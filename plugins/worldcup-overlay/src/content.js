// World Cup Overlay — content script (state plumbing + DOM wiring).
//
// Injects an isolated widget and renders the match deck from the service worker. The markup lives
// in render.js (self.WC.render); formatting in format.js (self.WC.fmt) and flags in flags.js
// (self.WC.flag); user preferences in settings.js (self.WC.settings). All are classic scripts
// loaded before this one (content scripts can't import ES modules from the manifest).
//
// The ‹ › arrows rotate through every match (earliest -> latest); the default view is the
// "primary" match (live, else next fixture, else last result). Minimizes to a ball launcher.
// Corner position and start-minimized come from chrome.storage.sync and update live.

(() => {
  const ROOT_ID = "wc-overlay-root";
  if (!document.body && !document.documentElement) return;
  if (document.getElementById(ROOT_ID)) return; // SPA re-run guard

  // --- constants (content-side; MSG must match config.js MSG.GET_STATE) ---
  const MSG_GET_STATE = "WC_GET_STATE";
  const UI_KEY = "wc_ui";
  const ICON = chrome.runtime.getURL("icons/icon48.png");
  const POLL_MS = 60 * 1000; // re-ask the worker for state
  const TICK_MS = 30 * 1000; // re-render relative times between polls

  const WC = self.WC;
  const settingsApi = WC.settings;
  const SETTINGS_KEY = settingsApi.KEY;

  // --- view state ---
  let minimized = false;
  let deck = []; // sorted matches, each with .matchMode
  let primaryIndex = 0;
  let cursor = null; // index of the match currently shown
  let fetchedAt = null;
  let stale = false;
  let loadError = false;
  let refreshing = false;
  let health = null;
  let settings = settingsApi.DEFAULTS;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "wc-overlay";
  (document.body || document.documentElement).appendChild(root);

  // ---- apply non-content preferences (position, etc.) ----
  function applyChrome() {
    root.classList.remove("wc-pos-tl", "wc-pos-tr", "wc-pos-bl", "wc-pos-br");
    root.classList.add("wc-pos-" + settings.corner);
  }

  // ---- render + wire events ----
  function render() {
    const now = Date.now();
    if (minimized) {
      root.innerHTML = WC.render.mini({ deck, icon: ICON });
      root.querySelector(".wc-mini").addEventListener("click", () => setMinimized(false));
      return;
    }
    if (deck.length && (cursor == null || cursor >= deck.length)) cursor = primaryIndex;
    root.innerHTML = WC.render.card(
      { deck, cursor, fetchedAt, stale, refreshing, loadError, health, icon: ICON },
      now
    );

    root.querySelector(".wc-min").addEventListener("click", () => setMinimized(true));
    root.querySelector(".wc-refresh").addEventListener("click", () => {
      if (!refreshing) requestState(true);
    });
    root.querySelectorAll(".wc-arrow").forEach((b) =>
      b.addEventListener("click", () => rotate(Number(b.dataset.dir)))
    );
    const count = root.querySelector(".wc-count");
    if (count) count.addEventListener("click", () => jumpToPrimary());
  }

  // ---- actions ----
  function rotate(dir) {
    if (!deck.length) return;
    cursor = (cursor + dir + deck.length) % deck.length; // wrap-around
    render();
  }

  function jumpToPrimary() {
    cursor = primaryIndex;
    render();
  }

  function setMinimized(v) {
    minimized = v;
    try {
      chrome.storage.local.set({ [UI_KEY]: { minimized: v } });
    } catch (_) {}
    render();
  }

  // Adopt new state, keeping the same match in view across refreshes when possible.
  function applyState(st) {
    const prevId = cursor != null && deck[cursor] ? deck[cursor].id : null;
    deck = (st && st.matches) || [];
    primaryIndex = (st && st.index) || 0;
    if (cursor == null) {
      cursor = primaryIndex;
    } else {
      const keep = deck.findIndex((m) => m.id === prevId);
      cursor = keep >= 0 ? keep : Math.min(primaryIndex, Math.max(0, deck.length - 1));
    }
  }

  function requestState(force) {
    if (force) {
      refreshing = true;
      render(); // show the spinner immediately
    }
    try {
      chrome.runtime.sendMessage({ type: MSG_GET_STATE, force: !!force }, (resp) => {
        refreshing = false;
        health = (resp && resp.health) || null;
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          loadError = true;
          render();
          return;
        }
        loadError = false;
        stale = !!resp.stale;
        applyState(resp.state);
        fetchedAt = resp.fetchedAt || Date.now();
        render();
      });
    } catch (_) {
      refreshing = false;
      loadError = true;
      render();
    }
  }

  // ---- init ----
  function start() {
    applyChrome();
    render();
    requestState();
    setInterval(requestState, POLL_MS);
    setInterval(render, TICK_MS);
  }

  // React to settings edited in the options page (or the overlay's own controls) while a tab is open.
  function watchSettings() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[SETTINGS_KEY]) {
          settings = settingsApi.normalize(changes[SETTINGS_KEY].newValue);
          applyChrome();
          if (!minimized) render();
        }
      });
    } catch (_) {}
  }

  // Bootstrap: load settings (sync) first, then the per-session UI state (local), then start.
  function boot() {
    const afterSettings = () => {
      try {
        chrome.storage.local.get(UI_KEY, (got) => {
          const ui = got && got[UI_KEY];
          minimized =
            ui && typeof ui.minimized === "boolean" ? ui.minimized : settings.startMinimized;
          start();
        });
      } catch (_) {
        minimized = settings.startMinimized;
        start();
      }
    };
    try {
      chrome.storage.sync.get(SETTINGS_KEY, (got) => {
        settings = settingsApi.normalize(got && got[SETTINGS_KEY]);
        afterSettings();
      });
    } catch (_) {
      settings = settingsApi.normalize(null);
      afterSettings();
    }
    watchSettings();
  }

  boot();
})();
