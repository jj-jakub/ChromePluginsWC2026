// Toolbar popup controller. A click-the-icon alternative to the always-on overlay, for users who
// don't want it on every page. Reuses the exact render layer (self.WC.render) and the same
// WC_GET_STATE message to the worker — so it shows the identical live / next / last deck with the
// ‹ › arrows, ↻ refresh, and the ★ follow controls. No minimize (that's a popup; just close it).

(() => {
  const MSG_GET_STATE = "WC_GET_STATE"; // must match config.MSG.GET_STATE
  const MSG_GET_STANDINGS = "WC_GET_STANDINGS";
  const SETTINGS_KEY = self.WC.settings.KEY;
  const ICON = chrome.runtime.getURL("icons/icon48.png");
  const WC = self.WC;
  const root = document.getElementById("wc-overlay-root");

  let deck = [];
  let primaryIndex = 0;
  let cursor = 0;
  let fetchedAt = null;
  let stale = false;
  let loadError = false;
  let refreshing = false;
  let health = null;
  let settings = self.WC.settings.DEFAULTS;
  let favorites = [];
  let favFilter = false;
  let tableMode = false;
  let tableGroup = "";
  let standings = null;
  let standingsSeq = 0;
  let agendaMode = false;
  let pitchMode = false;
  let pitchStartMs = null;
  let pitchCancel = null;

  function viewDeck() {
    return favFilter ? deck.filter((m) => m.isFavorite) : deck;
  }

  function clampPrimaryToView(vd) {
    const pid = deck[primaryIndex] && deck[primaryIndex].id;
    const i = vd.findIndex((m) => m.id === pid);
    return i >= 0 ? i : 0;
  }

  function currentGroup() {
    const vd = viewDeck();
    if (!vd.length) return "";
    const i = cursor != null && cursor < vd.length ? cursor : clampPrimaryToView(vd);
    return vd[i] && vd[i].group ? vd[i].group : "";
  }

  function render() {
    // Stop a running pitch loop before root.innerHTML is replaced; restarted below if still active.
    if (pitchCancel) {
      pitchCancel();
      pitchCancel = null;
    }
    const now = Date.now();
    const canFilter = deck.some((m) => m.isFavorite);
    if (!canFilter && favFilter) { favFilter = false; cursor = null; } // re-anchor to primary
    const vd = viewDeck();
    if (vd.length && (cursor == null || cursor >= vd.length)) cursor = clampPrimaryToView(vd);
    if (pitchMode && (loadError || !vd.length)) pitchMode = false; // never strand the user in the pitch

    root.innerHTML = WC.render.card(
      {
        deck: vd, cursor, fetchedAt, stale, refreshing, loadError, health, favorites, favFilter, canFilter,
        mode: pitchMode ? "pitch" : agendaMode ? "agenda" : tableMode ? "table" : "match",
        standings, canTable: tableMode || !!currentGroup(), icon: ICON,
        navTop: true, // the popup grows downward from the toolbar, so its top edge is the fixed one
      },
      now
    );
    root.querySelectorAll(".wc-arrow").forEach((b) =>
      b.addEventListener("click", () => rotate(Number(b.dataset.dir)))
    );
    const count = root.querySelector(".wc-count");
    if (count) count.addEventListener("click", () => { cursor = clampPrimaryToView(viewDeck()); render(); });
    const refresh = root.querySelector(".wc-refresh");
    if (refresh) refresh.addEventListener("click", () => {
      if (refreshing) return;
      if (tableMode) requestStandings(tableGroup, true);
      else requestState(true);
    });
    root.querySelectorAll(".wc-star").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(b.dataset.team); })
    );
    const favBtn = root.querySelector(".wc-favfilter");
    if (favBtn) favBtn.addEventListener("click", () => { favFilter = !favFilter; cursor = null; render(); });
    const tableBtn = root.querySelector(".wc-tabletoggle");
    if (tableBtn) tableBtn.addEventListener("click", () => toggleTable());
    const agendaBtn = root.querySelector(".wc-agendatoggle");
    if (agendaBtn) agendaBtn.addEventListener("click", () => {
      agendaMode = !agendaMode;
      if (agendaMode) { tableMode = false; pitchMode = false; standings = null; }
      render();
    });
    const pitchBtn = root.querySelector(".wc-pitchtoggle");
    if (pitchBtn) pitchBtn.addEventListener("click", () => togglePitch());
    root.querySelectorAll(".wc-agrow").forEach((b) =>
      b.addEventListener("click", () => {
        agendaMode = false;
        const vd2 = viewDeck();
        const i = vd2.findIndex((mm) => String(mm.id) === String(b.dataset.id));
        if (i >= 0) cursor = i;
        render();
      })
    );
    const cal = root.querySelector(".wc-cal");
    if (cal) cal.addEventListener("click", () => downloadIcs(cal.dataset.id));

    if (pitchMode && WC.pitchAnim) {
      const vd3 = viewDeck();
      const m = vd3[cursor != null && cursor < vd3.length ? cursor : clampPrimaryToView(vd3)] || null;
      pitchCancel = WC.pitchAnim.run(root, m, pitchStartMs);
    }
  }

  // Flip to / from the schematic pitch for the currently-featured match.
  function togglePitch() {
    if (pitchMode) {
      pitchMode = false;
      render();
      return;
    }
    const vd = viewDeck();
    if (!vd.length) return;
    tableMode = false;
    standings = null;
    agendaMode = false;
    pitchMode = true;
    pitchStartMs = Date.now();
    render();
  }

  function downloadIcs(id) {
    const match = deck.find((mm) => String(mm.id) === String(id));
    if (!match || !WC.ics) return;
    try {
      const text = WC.ics.toICS([match], { stampMs: Date.now() });
      const a = document.createElement("a");
      a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
      a.download = WC.ics.filenameFor(match);
      document.body.appendChild(a);
      a.click();
      a.remove();
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
    agendaMode = false;
    pitchMode = false;
    tableMode = true;
    tableGroup = group;
    standings = { group, loading: true };
    render();
    requestStandings(group);
  }

  function requestStandings(group, force) {
    const seq = ++standingsSeq;
    if (force) {
      refreshing = true; // spin the ↻ and make the re-click guard effective in table mode
      render();
    }
    try {
      chrome.runtime.sendMessage({ type: MSG_GET_STANDINGS, group, force: !!force }, (resp) => {
        if (force) refreshing = false;
        if (seq !== standingsSeq || !tableMode || group !== tableGroup) return;
        standings = chrome.runtime.lastError || !resp ? { group, error: true, rows: [] } : resp;
        render();
      });
    } catch (_) {
      if (force) refreshing = false;
      standings = { group, error: true, rows: [] };
      render();
    }
  }

  function rotate(dir) {
    const vd = viewDeck();
    if (!vd.length) return;
    cursor = (cursor + dir + vd.length) % vd.length;
    render();
  }

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

  function toggleFavorite(team) {
    if (!team) return;
    const favs = favorites.slice();
    const k = team.trim().toLowerCase();
    const i = favs.findIndex((f) => f.trim().toLowerCase() === k);
    if (i >= 0) favs.splice(i, 1);
    else favs.push(team);
    favorites = favs; // optimistic for the star fill
    render();
    // Re-read settings right before writing so a concurrent edit (options page / cross-device sync)
    // isn't clobbered by this popup's open-time snapshot.
    try {
      chrome.storage.sync.get(SETTINGS_KEY, (got) => {
        const cur = self.WC.settings.normalize(got && got[SETTINGS_KEY]);
        settings = self.WC.settings.normalize({ ...cur, favorites: favs });
        favorites = settings.favorites;
        chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => requestState());
      });
    } catch (_) {}
  }

  function requestState(force) {
    if (force) {
      refreshing = true;
      render();
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

  const darkMql = (() => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)");
    } catch (_) {
      return null;
    }
  })();
  function applyTheme() {
    const theme = WC.ui ? WC.ui.resolveTheme(settings.theme, darkMql ? darkMql.matches : false) : "dark";
    root.classList.remove("wc-theme-light", "wc-theme-dark");
    root.classList.add("wc-theme-" + theme);
  }

  // Load settings (for favorites / ★ state + theme), then fetch and render.
  try {
    chrome.storage.sync.get(SETTINGS_KEY, (got) => {
      settings = self.WC.settings.normalize(got && got[SETTINGS_KEY]);
      favorites = settings.favorites;
      applyTheme();
      render();
      requestState();
    });
    if (darkMql) darkMql.addEventListener("change", applyTheme);
  } catch (_) {
    render();
    requestState();
  }
})();
