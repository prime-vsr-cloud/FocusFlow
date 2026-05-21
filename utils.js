// FF v6.16: gSync/sSync/gLocal/sLocal/todayKey live in src/lib/storage.js (loaded first).
// This file now only carries DOM/UI helpers used by popup + dashboard.

function $(e) {
    return document.getElementById(e)
}

function fmt(e) {
    if (!e || e <= 0) return "0m";
    const m = Math.floor(e / 60);
    if (m < 60) return m + "m";
    const h = m / 60;
    if (h < 24) return (h === Math.floor(h) ? h : h.toFixed(1)) + "h";
    const d = Math.floor(h / 24), rh = Math.floor(h % 24);
    return rh > 0 ? d + "d " + rh + "h" : d + "d";
}



function fmtTimer(e) {
    return e = Math.max(0, e || 0), Math.floor(e / 60) + ":" + String(e % 60).padStart(2, "0")
}

async function hashPin(e) {
    var t = await crypto.subtle.digest("SHA-256", (new TextEncoder).encode(e));
    return Array.from(new Uint8Array(t)).map(e => e.toString(16).padStart(2, "0")).join("")
}

function getFav(e) {
    const domain = String(e).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
        .replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
    const url = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    return `<img src="${url}" data-domain="${domain}" style="width:20px;height:20px;border-radius:4px;flex-shrink:0" />`;
}

// FF v6.7.0: merged improved error handling from dashboard.js — only retry
// on transient errors, not permanent ones like "Extension context invalidated".
function msg(e, t, retries = 3) {
    return new Promise(n => {
        try {
            chrome.runtime.sendMessage(Object.assign({
                type: e
            }, t || {}), res => {
                if (chrome.runtime.lastError) {
                    const errMsg = chrome.runtime.lastError.message || "";
                    console.warn("[FF msg]", e, errMsg);
                    // Only retry on transient errors; permanent invalidation should not loop
                    const isTransient = !errMsg.includes("Extension context invalidated") &&
                                       !errMsg.includes("The message port closed");
                    if (retries > 0 && isTransient) setTimeout(() => msg(e, t, retries - 1).then(n), 100);
                    else n(null);
                } else {
                    n(res);
                }
            });
        } catch (err) {
            const errMsg = (err && err.message) || "";
            const isTransient = !errMsg.includes("Extension context invalidated") &&
                               !errMsg.includes("The message port closed");
            if (retries > 0 && isTransient) setTimeout(() => msg(e, t, retries - 1).then(n), 100);
            else n(null);
        }
    });
}
async function applyTheme(e) {
    const t = await gLocal(["theme"]),
        n = "light" === t.theme,
        r = "cinematic" === t.theme;
    document.documentElement.classList.toggle("light", n), document.documentElement.classList.toggle("cinematic", r);
    const i = e ? $(e) : null;
    i && (i.innerHTML = n ? '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>' : r ? '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>')
}
document.addEventListener("error", e => {
    if (e.target.tagName === "IMG") {
        if (e.target.dataset.domain && e.target.src.includes("_favicon")) {
            e.target.src = `https://www.google.com/s2/favicons?sz=32&domain=${e.target.dataset.domain}`;
        } else if (e.target.src !== FALLBACK_ICON) {
            e.target.src = FALLBACK_ICON;
        }
    }
}, !0);
