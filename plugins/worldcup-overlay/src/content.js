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

  // --- constants (content-side; MSG must match config.js MSG.*) ---
  const MSG_GET_STATE = "WC_GET_STATE";
  const MSG_GET_STANDINGS = "WC_GET_STANDINGS";
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
  let favFilter = false; // show favorites-only when on
  let tableMode = false; // showing the group standings table instead of the match
  let tableGroup = ""; // the group currently shown in the table
  let standings = null; // { group, rows, partial, loading, error }
  let pollId = null; // setInterval ids, so we can stop polling a dead context
  let tickId = null;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "wc-overlay";
  (document.body || document.documentElement).appendChild(root);

  // ---- apply non-content preferences (position, etc.) ----
  function applyChrome() {
    root.classList.remove("wc-pos-tl", "wc-pos-tr", "wc-pos-bl", "wc-pos-br");
    root.classList.add("wc-pos-" + settings.corner);
  }

  // The deck actually shown: all matches, or favorites-only when the filter is on.
  function viewDeck() {
    return favFilter ? deck.filter((m) => m.isFavorite) : deck;
  }

  // Index within `vd` of the SW's primary match, else 0.
  function clampPrimaryToView(vd) {
    const pid = deck[primaryIndex] && deck[primaryIndex].id;
    const i = vd.findIndex((m) => m.id === pid);
    return i >= 0 ? i : 0;
  }

  // The currently-featured match, and its group (for the standings toggle).
  function currentMatch() {
    const vd = viewDeck();
    if (!vd.length) return null;
    const i = cursor != null && cursor < vd.length ? cursor : clampPrimaryToView(vd);
    return vd[i] || null;
  }
  function currentGroup() {
    const m = currentMatch();
    return m && m.group ? m.group : "";
  }

  // ---- render + wire events ----
  function render() {
    const now = Date.now();
    if (minimized) {
      root.innerHTML = WC.render.mini({ deck, icon: ICON });
      root.querySelector(".wc-mini").addEventListener("click", () => setMinimized(false));
      return;
    }
    const canFilter = deck.some((m) => m.isFavorite);
    if (!canFilter) favFilter = false; // nothing to filter to
    const vd = viewDeck();
    if (vd.length && (cursor == null || cursor >= vd.length)) cursor = clampPrimaryToView(vd);

    root.innerHTML = WC.render.card(
      {
        deck: vd, cursor, fetchedAt, stale, refreshing, loadError, health,
        favorites: settings.favorites, favFilter, canFilter,
        mode: tableMode ? "table" : "match", standings, canTable: tableMode || !!currentGroup(),
        icon: ICON,
      },
      now
    );

    root.querySelector(".wc-min").addEventListener("click", () => setMinimized(true));
    root.querySelector(".wc-refresh").addEventListener("click", () => {
      if (refreshing) return;
      if (tableMode) requestStandings(tableGroup, true);
      else requestState(true);
    });
    root.querySelectorAll(".wc-arrow").forEach((b) =>
      b.addEventListener("click", () => rotate(Number(b.dataset.dir)))
    );
    const count = root.querySelector(".wc-count");
    if (count) count.addEventListener("click", () => jumpToPrimary());
    root.querySelectorAll(".wc-star").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(b.dataset.team);
      })
    );
    const favBtn = root.querySelector(".wc-favfilter");
    if (favBtn) favBtn.addEventListener("click", () => toggleFavFilter());
    const tableBtn = root.querySelector(".wc-tabletoggle");
    if (tableBtn) tableBtn.addEventListener("click", () => toggleTable());
  }

  // ---- actions ----
  function rotate(dir) {
    const vd = viewDeck();
    if (!vd.length) return;
    cursor = (cursor + dir + vd.length) % vd.length; // wrap-around
    render();
  }

  function jumpToPrimary() {
    cursor = clampPrimaryToView(viewDeck());
    render();
  }

  function toggleFavFilter() {
    favFilter = !favFilter;
    cursor = null; // re-anchor to the primary within the new view
    render();
  }

  // Toggle a nation in settings.favorites; the storage.onChanged handler re-ranks + re-renders.
  function toggleFavorite(team) {
    if (!team) return;
    const favs = (settings.favorites || []).slice();
    const k = team.trim().toLowerCase();
    const i = favs.findIndex((f) => f.trim().toLowerCase() === k);
    if (i >= 0) favs.splice(i, 1);
    else favs.push(team);
    try {
      chrome.storage.sync.set({ [SETTINGS_KEY]: settingsApi.normalize({ ...settings, favorites: favs }) });
    } catch (_) {}
  }

  function toggleTable() {
    if (tableMode) {
      tableMode = false;
      standings = null;
      render();
      return;
    }
    const group = currentGroup();
    if (!group) return;
    tableMode = true;
    tableGroup = group;
    standings = { group, loading: true };
    render();
    requestStandings(group);
  }

  function requestStandings(group, force) {
    if (!contextAlive()) {
      stopLoops();
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: MSG_GET_STANDINGS, group, force: !!force }, (resp) => {
        if (!tableMode || group !== tableGroup) return; // user already switched away
        if (chrome.runtime.lastError || !resp) {
          standings = { group, error: true, rows: [] };
        } else {
          standings = resp;
        }
        render();
      });
    } catch (_) {
      standings = { group, error: true, rows: [] };
      render();
    }
  }

  function setMinimized(v) {
    minimized = v;
    // Per-session (chrome.storage.session, cleared on browser restart) so settings.startMinimized
    // governs each fresh start instead of being permanently shadowed by a persisted choice.
    try {
      chrome.storage.session.set({ [UI_KEY]: { minimized: v } });
    } catch (_) {}
    render();
  }

  // Adopt new state, keeping the same match in view across refreshes when possible.
  function applyState(st) {
    const vdPrev = viewDeck();
    const prevId = cursor != null && vdPrev[cursor] ? vdPrev[cursor].id : null;
    deck = (st && st.matches) || [];
    primaryIndex = (st && st.index) || 0;
    const vd = viewDeck();
    if (cursor == null) {
      cursor = clampPrimaryToView(vd);
    } else {
      const keep = vd.findIndex((m) => m.id === prevId);
      cursor = keep >= 0 ? keep : clampPrimaryToView(vd);
    }
  }

  // After an extension update/reload, an orphaned content script keeps running but chrome.runtime
  // is invalidated. Detect that and stop the loops so we don't poll a dead context forever.
  function contextAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function stopLoops() {
    if (pollId) clearInterval(pollId);
    if (tickId) clearInterval(tickId);
    pollId = tickId = null;
  }

  function requestState(force) {
    if (!contextAlive()) {
      stopLoops();
      return;
    }
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
    pollId = setInterval(requestState, POLL_MS);
    tickId = setInterval(render, TICK_MS);
  }

  // React to settings edited in the options page (or the overlay's own ★ controls) while a tab is
  // open. A favorites change re-ranks the deck (asks the SW to re-tag/re-index); other changes just
  // re-apply position and re-render.
  function watchSettings() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[SETTINGS_KEY]) {
          const prevFav = JSON.stringify(settings.favorites || []);
          settings = settingsApi.normalize(changes[SETTINGS_KEY].newValue);
          applyChrome();
          if (JSON.stringify(settings.favorites || []) !== prevFav) {
            requestState(); // re-rank + re-tag isFavorite from the SW (also re-renders)
          } else if (!minimized) {
            render();
          }
        }
      });
    } catch (_) {}
  }

  // Bootstrap: load settings (sync) first, then the per-session minimized state
  // (chrome.storage.session — cleared on browser restart), then start. If session has no stored
  // value (fresh browser start, or access not yet granted), settings.startMinimized governs.
  function boot() {
    const afterSettings = () => {
      try {
        chrome.storage.session.get(UI_KEY, (got) => {
          const ui = !chrome.runtime.lastError && got && got[UI_KEY];
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
