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
    const now = Date.now();
    const canFilter = deck.some((m) => m.isFavorite);
    if (!canFilter) favFilter = false;
    const vd = viewDeck();
    if (vd.length && (cursor == null || cursor >= vd.length)) cursor = clampPrimaryToView(vd);

    root.innerHTML = WC.render.card(
      {
        deck: vd, cursor, fetchedAt, stale, refreshing, loadError, health, favorites, favFilter, canFilter,
        mode: tableMode ? "table" : "match", standings, canTable: tableMode || !!currentGroup(), icon: ICON,
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
    try {
      chrome.runtime.sendMessage({ type: MSG_GET_STANDINGS, group, force: !!force }, (resp) => {
        if (!tableMode || group !== tableGroup) return;
        standings = chrome.runtime.lastError || !resp ? { group, error: true, rows: [] } : resp;
        render();
      });
    } catch (_) {
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
    deck = (st && st.matches) || [];
    primaryIndex = (st && st.index) || 0;
    cursor = clampPrimaryToView(viewDeck());
  }

  function toggleFavorite(team) {
    if (!team) return;
    const favs = favorites.slice();
    const k = team.trim().toLowerCase();
    const i = favs.findIndex((f) => f.trim().toLowerCase() === k);
    if (i >= 0) favs.splice(i, 1);
    else favs.push(team);
    favorites = favs; // optimistic; persisted below (merged onto full settings), then re-ranked
    settings = self.WC.settings.normalize({ ...settings, favorites: favs });
    render();
    try {
      chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => requestState());
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

  // Load settings (for favorites / ★ state), then fetch and render.
  try {
    chrome.storage.sync.get(SETTINGS_KEY, (got) => {
      settings = self.WC.settings.normalize(got && got[SETTINGS_KEY]);
      favorites = settings.favorites;
      render();
      requestState();
    });
  } catch (_) {
    render();
    requestState();
  }
})();
