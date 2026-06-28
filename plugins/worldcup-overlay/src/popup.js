// Toolbar popup controller. A click-the-icon alternative to the always-on overlay, for users who
// don't want it on every page. Reuses the exact render layer (self.WC.render) and the same
// WC_GET_STATE message to the worker — so it shows the identical live / next / last deck with the
// ‹ › arrows and ↻ refresh. No minimize (that's a popup; just close it).

(() => {
  const MSG_GET_STATE = "WC_GET_STATE"; // must match config.MSG.GET_STATE
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

  function render() {
    const now = Date.now();
    if (deck.length && (cursor == null || cursor >= deck.length)) cursor = primaryIndex;
    root.innerHTML = WC.render.card(
      { deck, cursor, fetchedAt, stale, refreshing, loadError, health, icon: ICON },
      now
    );
    root.querySelectorAll(".wc-arrow").forEach((b) =>
      b.addEventListener("click", () => rotate(Number(b.dataset.dir)))
    );
    const count = root.querySelector(".wc-count");
    if (count)
      count.addEventListener("click", () => {
        cursor = primaryIndex;
        render();
      });
    const refresh = root.querySelector(".wc-refresh");
    if (refresh)
      refresh.addEventListener("click", () => {
        if (!refreshing) requestState(true);
      });
  }

  function rotate(dir) {
    if (!deck.length) return;
    cursor = (cursor + dir + deck.length) % deck.length;
    render();
  }

  function applyState(st) {
    deck = (st && st.matches) || [];
    primaryIndex = (st && st.index) || 0;
    cursor = primaryIndex;
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

  render();
  requestState();
})();
