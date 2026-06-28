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
  let standingsSeq = 0; // recency token so a stale standings response can't clobber a fresher one
  let agendaMode = false; // showing the all-fixtures agenda list instead of a single match
  let flash = null; // { ids:[matchId] } — a fresh score change to pulse
  let flashTimer = null;
  let blocked = false; // per-site allow/deny: true => hidden on this host
  let pollId = null; // setInterval ids, so we can stop polling a dead context
  let tickId = null;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "wc-overlay";
  (document.body || document.documentElement).appendChild(root);

  // Persistent visually-hidden live region — created ONCE and only its textContent is mutated, so
  // screen readers reliably announce score changes (a region rebuilt via innerHTML each render is
  // treated as initial content and not spoken). Lives at root level so it works minimized too.
  const announcer = document.createElement("div");
  announcer.className = "wc-sr";
  announcer.setAttribute("role", "status");
  announcer.setAttribute("aria-live", "polite");
  root.appendChild(announcer);

  // The card/mini markup is swapped into this host; the announcer above is never overwritten.
  const cardHost = document.createElement("div");
  root.appendChild(cardHost);

  const darkMql = (() => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)");
    } catch (_) {
      return null;
    }
  })();

  // ---- apply non-content preferences (position, theme, direction, site rules, etc.) ----
  function applyChrome() {
    root.classList.remove("wc-pos-tl", "wc-pos-tr", "wc-pos-bl", "wc-pos-br");
    root.classList.add("wc-pos-" + settings.corner);
    if (WC.dir) root.setAttribute("dir", WC.dir()); // RTL locales mirror text/flow inside the widget
    const theme = WC.ui ? WC.ui.resolveTheme(settings.theme, darkMql ? darkMql.matches : false) : "dark";
    root.classList.remove("wc-theme-light", "wc-theme-dark");
    root.classList.add("wc-theme-" + theme);
  }

  // Per-site allow/deny: hide the whole widget where the user excluded it (no new permission —
  // the content script already knows its own hostname). Re-evaluated live on a settings change.
  function evalSite() {
    const allowed = !WC.site || WC.site.siteAllowed(location.hostname, settings.siteRules, settings.siteMode);
    blocked = !allowed;
    root.hidden = blocked;
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
    if (blocked) return; // hidden on this site — nothing to draw
    const now = Date.now();
    if (minimized) {
      cardHost.innerHTML = WC.render.mini({ deck, icon: ICON });
      cardHost.querySelector(".wc-mini").addEventListener("click", () => setMinimized(false));
      return;
    }
    const canFilter = deck.some((m) => m.isFavorite);
    // If the filter is on but nothing is left to filter to, drop it and re-anchor to the primary
    // (cursor=null lets the clamp below pick clampPrimaryToView(full deck), not stale index 0).
    if (!canFilter && favFilter) {
      favFilter = false;
      cursor = null;
    }
    const vd = viewDeck();
    if (vd.length && (cursor == null || cursor >= vd.length)) cursor = clampPrimaryToView(vd);

    cardHost.innerHTML = WC.render.card(
      {
        deck: vd, cursor, fetchedAt, stale, refreshing, loadError, health,
        favorites: settings.favorites, favFilter, canFilter,
        mode: agendaMode ? "agenda" : tableMode ? "table" : "match",
        standings, canTable: tableMode || !!currentGroup(), flash,
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
    const agendaBtn = root.querySelector(".wc-agendatoggle");
    if (agendaBtn) agendaBtn.addEventListener("click", () => toggleAgenda());
    root.querySelectorAll(".wc-agrow").forEach((b) =>
      b.addEventListener("click", () => jumpToMatch(b.dataset.id))
    );
    const cal = root.querySelector(".wc-cal");
    if (cal) cal.addEventListener("click", () => downloadIcs(cal.dataset.id));
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
    agendaMode = false; // the two full-screen modes are mutually exclusive
    tableMode = true;
    tableGroup = group;
    standings = { group, loading: true };
    render();
    requestStandings(group);
  }

  function toggleAgenda() {
    agendaMode = !agendaMode;
    if (agendaMode) {
      tableMode = false; // mutually exclusive with the table
      standings = null;
    }
    render();
  }

  // Click an agenda row -> jump back to that match in the single-match view.
  function jumpToMatch(id) {
    agendaMode = false;
    const vd = viewDeck();
    const i = vd.findIndex((mm) => String(mm.id) === String(id));
    if (i >= 0) cursor = i;
    render();
  }

  // "Add to calendar" -> download a .ics for the match via a data: anchor (no permission needed).
  function downloadIcs(id) {
    const match = deck.find((mm) => String(mm.id) === String(id));
    if (!match || !WC.ics) return;
    try {
      const text = WC.ics.toICS([match], { stampMs: Date.now() });
      const a = document.createElement("a");
      a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
      a.download = WC.ics.filenameFor(match);
      (document.body || document.documentElement).appendChild(a);
      a.click();
      a.remove();
    } catch (_) {}
  }

  function requestStandings(group, force) {
    if (!contextAlive()) {
      stopLoops();
      return;
    }
    const seq = ++standingsSeq;
    if (force) {
      refreshing = true; // spin the ↻ and make the re-click guard effective in table mode
      render();
    }
    try {
      chrome.runtime.sendMessage({ type: MSG_GET_STANDINGS, group, force: !!force }, (resp) => {
        if (force) refreshing = false;
        if (seq !== standingsSeq || !tableMode || group !== tableGroup) return; // stale / switched away
        standings = chrome.runtime.lastError || !resp ? { group, error: true, rows: [] } : resp;
        render();
      });
    } catch (_) {
      if (force) refreshing = false;
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

  // Adopt new state, keeping the same match in view across refreshes when possible. Detects
  // score changes vs the previous deck to flash a goal pulse + announce it to screen readers.
  function applyState(st) {
    const oldDeck = deck;
    const next = (st && st.matches) || [];
    const changes = WC.scoreDiff ? WC.scoreDiff.diff(oldDeck, next) : [];

    const vdPrev = viewDeck();
    const prevId = cursor != null && vdPrev[cursor] ? vdPrev[cursor].id : null;
    deck = next;
    primaryIndex = (st && st.index) || 0;
    const vd = viewDeck();
    if (cursor == null) {
      cursor = clampPrimaryToView(vd);
    } else {
      const keep = vd.findIndex((m) => m.id === prevId);
      cursor = keep >= 0 ? keep : clampPrimaryToView(vd);
    }

    if (changes.length) {
      flash = { ids: [...new Set(changes.map((c) => c.id))] };
      // Mutate the persistent live region so screen readers announce it (works minimized too).
      announcer.textContent = WC.scoreDiff.announceFor(oldDeck, next) || "";
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flash = null;
        announcer.textContent = "";
        render();
      }, 6000);
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

  // Drag-to-reposition: grab the header (or the mini ball) to move the widget; on release it snaps
  // to the nearest corner and persists. A small move threshold keeps header-button taps working.
  let drag = null;
  let justDragged = false;
  const DRAG_THRESHOLD = 5;

  function onPointerDown(e) {
    if (blocked || e.button != null && e.button !== 0) return;
    const fromHead = e.target.closest(".wc-head") && !e.target.closest("button");
    const fromMini = !!e.target.closest(".wc-mini");
    if (!fromHead && !fromMini) return;
    const rect = root.getBoundingClientRect();
    drag = { startX: e.clientX, startY: e.clientY, offX: e.clientX - rect.left, offY: e.clientY - rect.top, w: rect.width, h: rect.height, moved: false };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
    drag.moved = true;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const raw = { x: e.clientX - drag.offX, y: e.clientY - drag.offY, w: drag.w, h: drag.h, vw, vh };
    const pos = WC.position ? WC.position.clampToViewport(raw, 4) : raw;
    root.classList.remove("wc-pos-tl", "wc-pos-tr", "wc-pos-bl", "wc-pos-br");
    root.style.top = pos.y + "px";
    root.style.left = pos.x + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function onPointerUp() {
    window.removeEventListener("pointermove", onPointerMove);
    if (!drag) return;
    if (drag.moved) {
      const rect = root.getBoundingClientRect();
      const corner = WC.position
        ? WC.position.nearestCorner({ x: rect.left, y: rect.top, w: rect.width, h: rect.height, vw: window.innerWidth, vh: window.innerHeight })
        : settings.corner;
      root.style.top = root.style.left = root.style.right = root.style.bottom = "";
      settings = settingsApi.normalize({ ...settings, corner });
      applyChrome();
      try {
        chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
      } catch (_) {}
      justDragged = true; // swallow the click that fires right after a drag
      setTimeout(() => {
        justDragged = false;
      }, 60);
    }
    drag = null;
  }

  function setupDrag() {
    root.addEventListener("pointerdown", onPointerDown);
    // A click immediately follows a drag's pointerup — suppress it so dragging the ball/header
    // doesn't also expand/minimize/toggle.
    root.addEventListener(
      "click",
      (e) => {
        if (justDragged) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true
    );
  }

  // Keyboard control — the listener lives on the persistent root, so it survives re-renders and
  // only fires when focus is inside the widget (so it never hijacks page typing/shortcuts).
  function focusSel(sel) {
    const el = root.querySelector(sel);
    if (el) el.focus();
  }
  function setupKeyboard() {
    root.addEventListener("keydown", (e) => {
      if (blocked) return;
      const isRtl = (document.documentElement.dir || document.dir) === "rtl";
      const action = WC.keymap ? WC.keymap.keyToAction(e.key, { minimized, isRtl }) : null;
      if (!action) return;
      e.preventDefault();
      if (action === "earlier" && !tableMode && !agendaMode) {
        rotate(-1);
        focusSel('.wc-arrow[data-dir="-1"]');
      } else if (action === "later" && !tableMode && !agendaMode) {
        rotate(1);
        focusSel('.wc-arrow[data-dir="1"]');
      } else if (action === "minimize" && !minimized) {
        setMinimized(true);
        focusSel(".wc-mini");
      } else if (action === "refresh" && !refreshing) {
        requestState(true);
        focusSel(".wc-refresh");
      } else if (action === "expand" && minimized) {
        setMinimized(false);
        focusSel(".wc-refresh");
      }
    });
  }

  // ---- init ----
  function start() {
    evalSite();
    setupKeyboard();
    setupDrag();
    applyChrome();
    render();
    requestState();
    pollId = setInterval(requestState, POLL_MS);
    tickId = setInterval(render, TICK_MS);
    try {
      // Re-resolve the theme live when the OS scheme flips (only matters for "auto").
      if (darkMql) darkMql.addEventListener("change", applyChrome);
    } catch (_) {}
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
          evalSite(); // a rules/mode change may show or hide the widget here
          if (JSON.stringify(settings.favorites || []) !== prevFav) {
            requestState(); // re-rank + re-tag isFavorite from the SW (also re-renders)
          } else {
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
