// FocusFlow shared storage + date helpers — single source of truth.
// Loaded via importScripts() in the service worker AND via <script src> in pages.
// Exposes: gSync, sSync, gLocal, sLocal, todayKey on globalThis.
(function (root) {
  function _logErr(label) {
    try {
      const err = chrome.runtime.lastError;
      if (err) console.warn("[FF storage]", label, err.message);
    } catch (_) {}
  }

  // FF v6.18: Smart Memory Cache to prevent 48x redundant disk reads of sync settings
  let _syncCache = null;
  let _syncCachePromise = null;
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.settings) {
        _syncCache = null;
      }
    });
  } catch (_) {}

  root.gSync = function (keys) {
    const isSettingsReq = !keys || (Array.isArray(keys) && keys.includes("settings")) || keys === "settings";
    
    if (isSettingsReq) {
      if (_syncCache) {
        return Promise.resolve(keys ? { settings: _syncCache.settings } : _syncCache);
      }
      if (_syncCachePromise) {
        return _syncCachePromise.then(res => (keys ? { settings: res.settings } : res));
      }
    }

    const p = new Promise((res) =>
      chrome.storage.sync.get(keys, (r) => {
        _logErr("gSync");
        const data = r || {};
        if (isSettingsReq && data.settings !== undefined) {
          _syncCache = data;
        }
        res(data);
      })
    );
    
    if (isSettingsReq) {
      _syncCachePromise = p;
      p.finally(() => { _syncCachePromise = null; });
    }
    return p;
  };
  root.sSync = function (obj) {
    // FF v6.18: Synchronously invalidate local cache the millisecond we write to avoid stale tab reads
    if (obj && obj.settings !== undefined) {
      _syncCache = null;
    }
    return new Promise((res) =>
      chrome.storage.sync.set(obj, (r) => {
        _logErr("sSync");
        res(r);
      })
    );
  };
  root.gLocal = function (keys) {
    return new Promise((res) =>
      chrome.storage.local.get(keys, (r) => {
        _logErr("gLocal");
        res(r || {});
      })
    );
  };
  root.sLocal = function (obj) {
    return new Promise((res) =>
      chrome.storage.local.set(obj, (r) => {
        _logErr("sLocal");
        res(r);
      })
    );
  };

  // FF v6.6: session storage helpers — data cleared automatically when browser closes.
  // Use for transient runtime state (activeSession, wentIdleAt, lastMediaPing).
  root.gSession = function (keys) {
    return new Promise((res) =>
      chrome.storage.session.get(keys, (r) => {
        _logErr("gSession");
        res(r || {});
      })
    );
  };
  root.sSession = function (obj) {
    return new Promise((res) =>
      chrome.storage.session.set(obj, (r) => {
        _logErr("sSession");
        res(r);
      })
    );
  };

  root.todayKey = function () {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };
})(typeof self !== "undefined" ? self : this);
