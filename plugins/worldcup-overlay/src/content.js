// World Cup Overlay — content script.
// Injects an isolated top-right widget and renders the match deck from the service worker.
// The ‹ › arrows rotate through every match (earliest -> latest); the default view is the
// "primary" match (live, else next fixture, else last result). Minimizes to a ball launcher.

(() => {
  const ROOT_ID = "wc-overlay-root";
  if (!document.body && !document.documentElement) return;
  if (document.getElementById(ROOT_ID)) return; // SPA re-run guard

  const ICON = chrome.runtime.getURL("icons/icon48.png");
  const UI_KEY = "wc_ui";
  const POLL_MS = 60 * 1000;
  const TICK_MS = 30 * 1000;

  let minimized = false;
  let deck = []; // sorted matches, each with .matchMode
  let primaryIndex = 0;
  let cursor = null; // which match is shown
  let fetchedAt = null;
  let loadError = false;
  let refreshing = false;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "wc-overlay";
  (document.body || document.documentElement).appendChild(root);

  // ---- helpers ----
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const clock = (ms) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  function dayLabel(ms, now) {
    const a = new Date(now);
    a.setHours(0, 0, 0, 0);
    const b = new Date(ms);
    b.setHours(0, 0, 0, 0);
    const diff = Math.round((b - a) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return new Date(ms).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function untilStr(ms, now) {
    const s = Math.max(0, Math.round((ms - now) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h >= 1) return `in ${h}h ${m}m`;
    if (m >= 1) return `in ${m}m`;
    return "kicking off";
  }

  function agoStr(ms, now) {
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const flagOf = (name) => (typeof self.wcFlagFor === "function" ? self.wcFlagFor(name) : "");

  // ---- render ----
  function teamRow(name, score, win) {
    const flag = flagOf(name);
    return `<div class="wc-team${win ? " win" : ""}">
        <span class="wc-name">${flag ? `<span class="wc-flag">${flag}</span>` : ""}${esc(name)}</span>
        <span class="wc-score">${score == null ? "" : esc(score)}</span>
      </div>`;
  }

  function matchBody(m, now) {
    const ko = m.kickoffMs;
    if (m.matchMode === "live") {
      const prog = m.progress || m.status || "Live";
      return `
        <span class="wc-status live"><span class="wc-live-dot"></span>Live</span>
        <div class="wc-teams">
          ${teamRow(m.home, m.homeScore)}
          ${teamRow(m.away, m.awayScore)}
        </div>
        <span class="wc-meta">${esc(prog)}${ko ? ` · ${esc(clock(ko))} kickoff` : ""}</span>
        ${m.venue ? `<span class="wc-sub">${esc(m.venue)}</span>` : ""}`;
    }
    if (m.matchMode === "upcoming") {
      return `
        <span class="wc-status upcoming">Up next</span>
        <div class="wc-teams">
          ${teamRow(m.home, null)}
          ${teamRow(m.away, null)}
        </div>
        <span class="wc-meta">${ko ? `${esc(dayLabel(ko, now))} ${esc(clock(ko))} · ${esc(untilStr(ko, now))}` : "Scheduled"}</span>
        ${m.venue ? `<span class="wc-sub">${esc(m.venue)}</span>` : ""}`;
    }
    const hs = m.homeScore,
      as = m.awayScore;
    return `
      <span class="wc-status result">Full time</span>
      <div class="wc-teams">
        ${teamRow(m.home, hs, hs != null && as != null && hs > as)}
        ${teamRow(m.away, as, hs != null && as != null && as > hs)}
      </div>
      <span class="wc-meta">${ko ? `${esc(dayLabel(ko, now))} · ${esc(clock(ko))}` : "Recently played"}</span>
      ${m.venue ? `<span class="wc-sub">${esc(m.venue)}</span>` : ""}`;
  }

  function render() {
    const now = Date.now();

    if (minimized) {
      const live = deck.some((m) => m.matchMode === "live");
      root.innerHTML = `<div class="wc-mini" title="FIFA World Cup — click to expand">
          <img src="${ICON}" alt="World Cup">${live ? '<span class="wc-mini-live"></span>' : ""}
        </div>`;
      root.querySelector(".wc-mini").addEventListener("click", () => setMinimized(false));
      return;
    }

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
      ? `<span class="wc-foot">Updated ${esc(agoStr(fetchedAt, now))}${loadError ? "" : ""} · TheSportsDB</span>`
      : "";

    root.innerHTML = `
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

    root.querySelector(".wc-min").addEventListener("click", () => setMinimized(true));
    root.querySelector(".wc-refresh").addEventListener("click", () => {
      if (!refreshing) requestState(true);
    });
    root.querySelectorAll(".wc-arrow").forEach((b) =>
      b.addEventListener("click", () => {
        const dir = Number(b.dataset.dir);
        cursor = (cursor + dir + deck.length) % deck.length; // wrap-around rotate
        render();
      })
    );
    const count = root.querySelector(".wc-count");
    if (count) count.addEventListener("click", () => {
      cursor = primaryIndex;
      render();
    });
  }

  // ---- state plumbing ----
  function setMinimized(v) {
    minimized = v;
    try {
      chrome.storage.local.set({ [UI_KEY]: { minimized: v } });
    } catch (_) {}
    render();
  }

  function applyState(st) {
    const matches = (st && st.matches) || [];
    const prevId = cursor != null && deck[cursor] ? deck[cursor].id : null;
    deck = matches;
    primaryIndex = (st && st.index) || 0;
    if (cursor == null) {
      cursor = primaryIndex; // first load -> show the primary match
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
      chrome.runtime.sendMessage({ type: "WC_GET_STATE", force: !!force }, (resp) => {
        refreshing = false;
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          loadError = true;
          render();
          return;
        }
        loadError = false;
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
  try {
    chrome.storage.local.get(UI_KEY, (got) => {
      const ui = got && got[UI_KEY];
      minimized = !!(ui && ui.minimized);
      render();
      requestState();
    });
  } catch (_) {
    render();
    requestState();
  }

  setInterval(requestState, POLL_MS);
  setInterval(render, TICK_MS);
})();
