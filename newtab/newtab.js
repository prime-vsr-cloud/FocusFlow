// FocusFlow v6.15 — Custom New Tab page.
// This page is OPT-IN. The manifest does NOT override the browser's native
// new tab anymore; instead, the service worker watches for newly-created
// tabs and redirects them here only when settings.customNewTab === true.
// When the setting is OFF, this file is never loaded — users see their
// browser's true native new tab page (Google search box, top sites, etc.).

const $ = (id) => document.getElementById(id);
const send = (msg) =>
  new Promise((r) => {
    try { chrome.runtime.sendMessage(msg, (x) => { void chrome.runtime.lastError; r(x || null); }); }
    catch (_) { r(null); }
  });
// Bug 5 fix: gSync and todayKey now come from storage.js (loaded via script tag)

function fmtDur(secs) {
  if (!secs || secs <= 0) return "0m";
  const m = Math.floor(secs / 60);
  if (m < 60) return m + "m";
  const h = m / 60;
  if (h < 24) return (h === Math.floor(h) ? h : h.toFixed(1)) + "h";
  const d = Math.floor(h / 24), rh = Math.floor(h % 24);
  return rh > 0 ? d + "d " + rh + "h" : d + "d";
}
function fmtMMSS(secs) {
  secs = Math.max(0, Math.round(secs || 0));
  const m = Math.floor(secs / 60), s = secs % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

const QUOTES = [
  '"Future you is watching. Make them proud."',
  '"Discipline equals freedom."',
  '"Small steps every day."',
  '"Deep work beats busy work."',
  '"You don\'t need more time. You need more focus."',
  '"What you do today matters."',
];

// todayKey() now comes from storage.js (loaded via script tag)

function tickClock() {
  const d = new Date();
  $("clock").textContent =
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
  $("date").textContent = d.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  const h = d.getHours();
  $("greet").textContent =
    h < 5  ? "Burning the midnight oil" :
    h < 12 ? "Good morning" :
    h < 17 ? "Good afternoon" :
    h < 21 ? "Good evening" : "Late night focus";
}

async function loadStats() {
  try {
    const res = await send({ type: "STATS_GET_DAY", day: todayKey() });
    const data = (res && res.data) || {};
    const prod = (data.productivity || 0) + (data.learning || 0);
    const dist = data.distraction || 0;
    $("stat-prod").textContent = fmtDur(prod);
    $("stat-dist").textContent = fmtDur(dist);
  } catch (_) {}
  try {
    const r = await send({ type: "GET_FOCUS_HISTORY" });
    const hist = (r && r.focusHistory) || [];
    const today = todayKey();
    const cycles = hist
      .filter((h) => h.date === today)
      .reduce((s, h) => s + (h.cyclesCompleted || 0), 0);
    $("stat-cycles").textContent = String(cycles);
  } catch (_) {}
}

let lastState = null;
let liveTimer = null;

function paintFocusButton(fs) {
  const btn = $("btn-focus");
  const live = $("live-timer");
  if (fs && fs.active) {
    btn.textContent = "Stop Focus";
    btn.className = "bs-danger";
    btn.dataset.action = "stop";

    const isWork = fs.phase === "work";
    let remaining = fs.remaining;
    if (!fs.paused && fs.phaseEndsAt) {
      remaining = Math.max(0, Math.round((fs.phaseEndsAt - Date.now()) / 1000));
    }
    const phase = isWork ? "Work" : (fs.phase === "long_break" ? "Long Break" : "Break");
    live.textContent = `⏱ ${phase} · ${fmtMMSS(remaining)} remaining`;
    live.className = "live-timer show" + (isWork ? "" : " brk");
  } else {
    btn.textContent = "Start Focus";
    btn.className = "bp";
    btn.dataset.action = "start";
    live.className = "live-timer";
  }
}

async function refreshFocus() {
  const res = await send({ type: "FOCUS_GET_STATE" });
  lastState = (res && res.focusState) || null;
  paintFocusButton(lastState);
  if (lastState && lastState.active && !lastState.paused) startLiveTimer();
  else stopLiveTimer();
}

function startLiveTimer() {
  stopLiveTimer();
  liveTimer = setInterval(() => {
    if (lastState && lastState.active && !lastState.paused) paintFocusButton(lastState);
  }, 1000);
}
function stopLiveTimer() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }

function wireButtons() {
  $("btn-focus").addEventListener("click", async () => {
    const action = $("btn-focus").dataset.action || "start";
    if (action === "stop") await send({ type: "FOCUS_STOP" });
    else await send({ type: "FOCUS_START" });
    setTimeout(() => { refreshFocus(); loadStats(); }, 200);
  });
  $("btn-dash").addEventListener("click", () => {
    try { chrome.runtime.openOptionsPage(); }
    catch (_) { chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") }); }
  });
}

chrome.runtime.onMessage.addListener((m) => {
  if (m && m.type === "FOCUS_TICK" && m.focusState) {
    lastState = m.focusState;
    paintFocusButton(lastState);
    if (lastState.active && !lastState.paused) startLiveTimer();
    else stopLiveTimer();
  }
});
chrome.runtime.connect({ name: "focusflow-tracker" });

(async function init() {
  // FF v6.18: No need to check customNewTab here — the service worker only
  // redirects to this page when the setting is ON. The page always activates.
  try {
    document.body.classList.add("ff-newtab-active");
    $("quote").textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    tickClock();
    setInterval(tickClock, 30 * 1000);
    wireButtons();
    await Promise.all([loadStats(), refreshFocus()]);
    setInterval(loadStats, 60 * 1000);
  } catch (_) {
    document.body.classList.add("ff-newtab-active");
    tickClock();
    setInterval(tickClock, 30 * 1000);
  }
})();
