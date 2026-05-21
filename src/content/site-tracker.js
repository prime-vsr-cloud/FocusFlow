// FocusFlow — Site Tracker & Cool-down (content script)
// Runs at document_start. Responsibilities:
//   1) If domain is on the cool-down list → show a configurable overlay before allowing access.
//   2) Send active interaction heartbeats and listen for 1-minute warning nudges.
(async () => {
  if (!chrome?.runtime?.id) return;
  const href = location.href;
  if (!/^https?:/.test(href)) return;
  if (href.startsWith(chrome.runtime.getURL(""))) return;
  const host = location.hostname.replace(/^www\./, "");

// Bug 1 fix: guard against double-injection on fast refresh in SPAs
  if (window.__ffCooldownActive) return;
  window.__ffCooldownActive = true;

// FF v6.18: Immediately notify the SW when the browser is minimized/restored.
// Must be registered BEFORE the early bailout so it works on every tracked page.
  const _sendVisibility = (state) => {
    try {
      if (chrome?.runtime?.id) {
        chrome.runtime.sendMessage({ type: state === "visible" ? "TRACKING_VISIBILITY_VISIBLE" : "TRACKING_VISIBILITY_HIDDEN", domain: host }).catch(() => {});
      }
    } catch (_) {}
  };
  document.addEventListener("visibilitychange", () => {
    _sendVisibility(document.visibilityState);
  });
  // Also fire immediately in case the script loaded into a hidden tab.
  if (document.visibilityState !== "visible") {
    _sendVisibility("hidden");
  }

  // Fast check: is this current website actually tracked or governed by any rules?
  // Bug 6 fix: read only blockRules + cooldownConfig (1 read instead of 3)
  const fastCfg = await new Promise((res) =>
    chrome.storage.local.get(["cooldownConfig", "blockRules"], (r) => res(r || {}))
  );
  const cdConf1 = fastCfg.cooldownConfig || {};
  const cooldowns = (cdConf1.activeDomains || []).map((d) => String(d).toLowerCase().trim()).filter(Boolean);
  const blockRules = fastCfg.blockRules || [];

  // Check if this domain is tracked or matches any cooldowns or block rules
  const isCooldown = cooldowns.some((d) => host === d || host.endsWith("." + d));
  const isBlocked = blockRules.some((r) => r.domain && (host === r.domain.toLowerCase() || host.endsWith("." + r.domain.toLowerCase())));

  // If the user has absolutely no rules for this domain, bail out completely!
  if (!isCooldown && !isBlocked) {
    window.__ffCooldownActive = false;
    return;
  }

  // ---- Active Interaction Heartbeats & Nudge Listeners (Always enabled if rules exist) ----
  const showNudgePopup = () => {
    if (document.getElementById("ff-nudge")) return;
    if (!document.body || !document.head) return;
    const t = document.createElement("div");
    t.id = "ff-nudge";
    t.style.cssText = "position:fixed;top:0;left:0;width:100%;background:#121212;color:#f8fafc;text-align:center;padding:12px;font-family:system-ui,-apple-system,sans-serif;font-weight:600;font-size:14px;z-index:2147483647;border-bottom:2px solid #F46B7A;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:ff-slide 0.5s ease;";
    const e = document.createElement("span");
    e.textContent = "FocusFlow: 1 minute remaining for this site. Wrap it up!";
    const a = document.createElement("button");
    a.id = "ff-nudge-x";
    a.textContent = "✕";
    a.style.cssText = "margin-left:16px;background:none;border:none;color:#94a3b8;cursor:pointer;font-weight:bold;";
    a.addEventListener("click", () => t.remove());
    t.appendChild(e);
    t.appendChild(a);
    document.body.appendChild(t);
    const s = document.createElement("style");
    s.textContent = "@keyframes ff-slide { from { transform: translateY(-100%); } to { transform: translateY(0); } }";
    document.head.appendChild(s);
    setTimeout(() => t.remove(), 1e4);
  };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SHOW_NUDGE") {
      showNudgePopup();
    }
  });

  let lastHeartbeat = Date.now();
  let lastInteract = Date.now();

  const pingInteractions = () => {
    const now = Date.now();
    // Throttled to at most once per second to prevent high event listener CPU usage
    if (now - lastInteract >= 1000) {
      lastInteract = now;
    }
  };
  window.addEventListener("mousemove", pingInteractions, { passive: true });
  window.addEventListener("scroll", pingInteractions, { passive: true });
  window.addEventListener("keydown", pingInteractions, { passive: true });
  window.addEventListener("touchstart", pingInteractions, { passive: true });

  let heartbeatTimer = null;
  const startHeartbeat = () => {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible" && (now - lastInteract < 30000)) {
        const elapsed = Math.round((now - lastHeartbeat) / 1000);
        if (elapsed > 0 && elapsed <= 15) {
          chrome.runtime.sendMessage({
            type: "TRACKING_HEARTBEAT",
            domain: host,
            elapsed: elapsed
          }).catch(() => {});
        }
      }
      lastHeartbeat = now;
    }, 10000);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  // Start heartbeat only if the tab is visible initially
  if (document.visibilityState === "visible") {
    startHeartbeat();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      lastHeartbeat = Date.now();
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  });

  // ---- 2. Cool-down overlay (Isolated check) ----
  const matchedDomain = cooldowns.find((d) => host === d || host.endsWith("." + d));
  if (!matchedDomain) return;

  const cdCfg = await new Promise((res) =>
    chrome.storage.local.get(["cooldownPassedAt", "cooldownConfig"], (r) => res(r || {}))
  );
  const passed = cdCfg.cooldownPassedAt || {};
  const cdConf2 = cdCfg.cooldownConfig || {};
  const allSettings = cdConf2.settings || {};
  const allReasons = cdConf2.reasons || {};
  const blockActive = cdConf2.blockActive || {};

  const siteCfg   = allSettings[matchedDomain] || {};
  const timerSecs = Math.max(1, Math.min(120, Number(siteCfg.timer) || 10));
  const frequency = siteCfg.frequency || "every10min";

  const lastPassed = passed[host] || 0;
  const now = Date.now();
  let showOverlayNow = true;
  if (frequency === "every10min" || frequency === "session") {
    if (now - lastPassed < 10 * 60 * 1000) showOverlayNow = false;
  } else if (frequency === "oncePerDay" || frequency === "daily") {
    if (new Date(lastPassed).toDateString() === new Date().toDateString()) showOverlayNow = false;
  }

  if (!showOverlayNow) {
    let blockTarget = blockActive[matchedDomain];
    if (blockTarget) {
      if (blockTarget.startsWith("/blocked/")) {
        const separator = blockTarget.includes("?") ? "&" : "?";
        blockTarget = chrome.runtime.getURL(blockTarget) + separator + "d=" + host;
      } else if (!blockTarget.startsWith("http")) {
        blockTarget = "https://" + blockTarget;
      }
      location.replace(blockTarget);
      return;
    }
    return;
  }

  const showOverlay = () => {
    if (document.getElementById("ff-cooldown")) return;

    const wrap = document.createElement("div");
    wrap.id = "ff-cooldown";
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(8,8,12,0.96);" +
      "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "font-family:system-ui,-apple-system,sans-serif;color:#fff;text-align:center;padding:24px;";

    wrap.innerHTML =
      '<div style="font-size:64px;margin-bottom:16px;">⏳</div>' +
      '<div style="font-size:28px;font-weight:800;margin-bottom:12px;">Take a breath…</div>' +
      '<div style="font-size:16px;color:#a1a1aa;margin-bottom:20px;max-width:420px;line-height:1.5;">' +
        'You set a cool-down on <strong style="color:#fff">' + host + '</strong>. Still want to continue?' +
      '</div>' +
      '<div id="ff-cd-num" style="font-size:88px;font-weight:900;color:#F46B7A;line-height:1;' +
        'margin-bottom:24px;font-variant-numeric:tabular-nums;">' + timerSecs + '</div>' +
      '<div style="display:flex;gap:12px;box-sizing:border-box !important;">' +
        '<div id="ff-cd-back" role="button" tabindex="0" style="' +
          'all:initial !important;box-sizing:border-box !important;font-family:system-ui,-apple-system,sans-serif !important;' +
          'background:#282828 !important;color:#fff !important;border:1px solid rgba(255,255,255,0.1) !important;' +
          'padding:14px 28px !important;border-radius:12px !important;font-size:15px !important;font-weight:700 !important;' +
          'cursor:pointer !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;' +
          'line-height:1.2 !important;height:auto !important;min-height:unset !important;user-select:none !important;">← Go back</div>' +
        '<div id="ff-cd-go" role="button" tabindex="0" style="' +
          'all:initial !important;box-sizing:border-box !important;font-family:system-ui,-apple-system,sans-serif !important;' +
          'background:rgba(244,107,122,0.15) !important;color:#F46B7A !important;border:1px solid rgba(244,107,122,0.3) !important;' +
          'padding:14px 28px !important;border-radius:12px !important;font-size:15px !important;font-weight:700 !important;' +
          'cursor:not-allowed !important;opacity:0.4 !important;display:inline-flex !important;align-items:center !important;' +
          'justify-content:center !important;line-height:1.2 !important;height:auto !important;min-height:unset !important;user-select:none !important;">Continue anyway</div>' +
      '</div>';

    (document.body || document.documentElement).appendChild(wrap);

    const num         = document.getElementById("ff-cd-num");
    const go          = document.getElementById("ff-cd-go");

    document.getElementById("ff-cd-back").onclick = () => history.back();

    let n = timerSecs;
    const tick = setInterval(() => {
      n--;
      num.textContent = n;
      if (n <= 0) {
        clearInterval(tick);
        num.textContent = "✓";
        num.style.color = "#05D581";
        go.style.setProperty("cursor", "pointer", "important");
        go.style.setProperty("opacity", "1", "important");
        go.style.setProperty("background", "rgba(5,213,129,0.15)", "important");
        go.style.setProperty("color", "#05D581", "important");
        go.style.setProperty("border-color", "rgba(5,213,129,0.3)", "important");
      }
    }, 1000);

    go.onclick = () => {
      if (n > 0) return;
      const updates = {
        cooldownPassedAt: { ...passed, [host]: Date.now() },
      };
      if (!chrome?.runtime?.id) {
        location.reload();
        return;
      }
      try {
        chrome.storage.local.set(updates, () => {
          wrap.remove();
          let blockTarget = blockActive[matchedDomain];
          if (blockTarget) {
            if (blockTarget.startsWith("/blocked/")) {
              const separator = blockTarget.includes("?") ? "&" : "?";
              blockTarget = chrome.runtime.getURL(blockTarget) + separator + "d=" + host;
            } else if (!blockTarget.startsWith("http")) {
              blockTarget = "https://" + blockTarget;
            }
            location.replace(blockTarget);
          }
        });
      } catch (err) {
        location.reload();
      }
    };
  };

  if (document.body) showOverlay();
  else document.addEventListener("DOMContentLoaded", showOverlay, { once: true });
})();
