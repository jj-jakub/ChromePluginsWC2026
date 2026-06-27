// World Cup Overlay — content script (rendering + state plumbing).
//
// Injects an isolated top-right widget and renders the match deck from the service worker. The
// ‹ › arrows rotate through every match (earliest -> latest); the default view is the "primary"
// match (live, else next fixture, else last result). Minimizes to a ball launcher.
//
// Pure helpers live in format.js (self.WC.fmt) and flags.js (self.WC.flag), loaded first.

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

  const { esc, clock, dayLabel, until, ago } = self.WC.fmt;
  const flagOf = self.WC.flag;

  // --- view state ---
  let minimized = false;
  let deck = []; // sorted matches, each with .matchMode
  let primaryIndex = 0;
  let cursor = null; // index of the match currently shown
  let fetchedAt = null;
  let stale = false;
  let loadError = false;
  let refreshing = false;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "wc-overlay";
  (document.body || document.documentElement).appendChild(root);

  // ---- templates ----
  function teamRow(name, score, win) {
    const flag = flagOf(name);
    return `<div class="wc-team${win ? " win" : ""}">
        <span class="wc-name">${flag ? `<span class="wc-flag">${flag}</span>` : ""}${esc(name)}</span>
        <span class="wc-score">${score == null ? "" : esc(score)}</span>
      </div>`;
  }

  function matchBody(m, now) {
    const ko = m.kickoffMs;
    const venue = m.venue ? `<span class="wc-sub">${esc(m.venue)}</span>` : "";

    if (m.matchMode === "live") {
      const prog = m.progress || m.status || "Live";
      return `
        <span class="wc-status live"><span class="wc-live-dot"></span>Live</span>
        <div class="wc-teams">${teamRow(m.home, m.homeScore)}${teamRow(m.away, m.awayScore)}</div>
        <span class="wc-meta">${esc(prog)}${ko ? ` · ${esc(clock(ko))} kickoff` : ""}</span>
        ${venue}`;
    }
    if (m.matchMode === "upcoming") {
      const when = ko ? `${esc(dayLabel(ko, now))} ${esc(clock(ko))} · ${esc(until(ko, now))}` : "Scheduled";
      return `
        <span class="wc-status upcoming">Up next</span>
        <div class="wc-teams">${teamRow(m.home, null)}${teamRow(m.away, null)}</div>
        <span class="wc-meta">${when}</span>
        ${venue}`;
    }
    // result
    const { homeScore: hs, awayScore: as } = m;
    const decided = hs != null && as != null;
    const when = ko ? `${esc(dayLabel(ko, now))} · ${esc(clock(ko))}` : "Recently played";
    return `
      <span class="wc-status result">Full time</span>
      <div class="wc-teams">${teamRow(m.home, hs, decided && hs > as)}${teamRow(m.away, as, decided && as > hs)}</div>
      <span class="wc-meta">${when}</span>
      ${venue}`;
  }

  function cardHTML(now) {
    let body;
    let nav = "";
    if (loadError) {
      body = `<div class="wc-empty">Couldn't load World Cup data. It'll retry shortly.</div>`;
    } else if (!deck.length) {
      body = `<div class="wc-empty">No World Cup matches found right now.</div>`;
    } else {
      if (cursor == null || cursor >= deck.length) cursor = primaryIndex;
      body = matchBody(deck[cursor], now);
      if (deck.length > 1) {
        nav = `
          <div class="wc-nav">
            <button class="wc-arrow" data-dir="-1" title="Earlier match" aria-label="Earlier match">‹</button>
            <button class="wc-count" title="Jump to current">${cursor + 1} / ${deck.length}</button>
            <button class="wc-arrow" data-dir="1" title="Later match" aria-label="Later match">›</button>
          </div>`;
      }
    }

    const foot = fetchedAt
      ? `<span class="wc-foot">Updated ${esc(ago(fetchedAt, now))}${stale ? " · offline" : ""} · TheSportsDB</span>`
      : "";

    return `
      <div class="wc-card">
        <div class="wc-head">
          <span class="wc-dot"><img src="${ICON}" alt=""></span>
          <span class="wc-title">FIFA World Cup</span>
          <span class="wc-icon wc-refresh${refreshing ? " wc-spin" : ""}" title="Refresh now" aria-label="Refresh">↻</span>
          <span class="wc-icon wc-min" title="Minimize" aria-label="Minimize">–</span>
        </div>
        <div class="wc-body">${body}</div>
        ${nav}
        <div class="wc-foot-wrap">${foot}</div>
      </div>`;
  }

  function miniHTML() {
    const live = deck.some((m) => m.matchMode === "live");
    return `<div class="wc-mini" title="FIFA World Cup — click to expand">
        <img src="${ICON}" alt="World Cup">${live ? '<span class="wc-mini-live"></span>' : ""}
      </div>`;
  }

  // ---- render + wire events ----
  function render() {
    const now = Date.now();
    root.innerHTML = minimized ? miniHTML() : cardHTML(now);

    if (minimized) {
      root.querySelector(".wc-mini").addEventListener("click", () => setMinimized(false));
      return;
    }
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
    render();
    requestState();
    setInterval(requestState, POLL_MS);
    setInterval(render, TICK_MS);
  }

  try {
    chrome.storage.local.get(UI_KEY, (got) => {
      minimized = !!(got && got[UI_KEY] && got[UI_KEY].minimized);
      start();
    });
  } catch (_) {
    start();
  }
})();
