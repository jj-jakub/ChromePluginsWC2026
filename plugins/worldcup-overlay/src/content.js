// World Cup Overlay — content script.
// Injects an isolated top-right widget and renders the state from the service worker:
//   live match  ->  next fixture  ->  last result.
// The widget can be minimized to a soccer-ball launcher (persisted), and auto-refreshes.

(() => {
  const ROOT_ID = "wc-overlay-root";
  if (!document.body && !document.documentElement) return;
  if (document.getElementById(ROOT_ID)) return; // SPA re-run guard

  const ICON = chrome.runtime.getURL("icons/icon48.png");
  const UI_KEY = "wc_ui";
  const POLL_MS = 60 * 1000; // re-ask the worker for state
  const TICK_MS = 30 * 1000; // re-render relative times

  let minimized = false;
  let state = null;
  let fetchedAt = null;

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

  // ---- render ----
  function teamRow(name, score, win) {
    return `<div class="wc-team${win ? " win" : ""}">
        <span class="wc-name">${esc(name)}</span>
        <span class="wc-score">${score == null ? "" : esc(score)}</span>
      </div>`;
  }

  function bodyFor(st, now) {
    if (!st || st.mode === "error") {
      return `<div class="wc-empty">Couldn't load World Cup data. It'll retry shortly.</div>`;
    }
    if (st.mode === "empty") {
      return `<div class="wc-empty">No World Cup matches found right now.</div>`;
    }

    const m = st.match;
    const ko = m.kickoffMs;

    if (st.mode === "live") {
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

    if (st.mode === "upcoming") {
      return `
        <span class="wc-status upcoming">Up next</span>
        <div class="wc-teams">
          ${teamRow(m.home, null)}
          ${teamRow(m.away, null)}
        </div>
        <span class="wc-meta">${ko ? `${esc(dayLabel(ko, now))} ${esc(clock(ko))} · ${esc(untilStr(ko, now))}` : "Scheduled"}</span>
        ${m.venue ? `<span class="wc-sub">${esc(m.venue)}</span>` : ""}`;
    }

    // result
    const hs = m.homeScore,
      as = m.awayScore;
    return `
      <span class="wc-status result">Full time</span>
      <div class="wc-teams">
        ${teamRow(m.home, hs, hs != null && as != null && hs > as)}
        ${teamRow(m.away, as, hs != null && as != null && as > hs)}
      </div>
      <span class="wc-meta">${ko ? esc(dayLabel(ko, now)) : "Recently played"}</span>
      ${m.venue ? `<span class="wc-sub">${esc(m.venue)}</span>` : ""}`;
  }

  function render() {
    const now = Date.now();
    if (minimized) {
      const live = state && state.mode === "live";
      root.innerHTML = `<div class="wc-mini" title="FIFA World Cup — click to expand">
          <img src="${ICON}" alt="World Cup">${live ? '<span class="wc-mini-live"></span>' : ""}
        </div>`;
      root.querySelector(".wc-mini").addEventListener("click", () => setMinimized(false));
      return;
    }

    const foot = fetchedAt
      ? `<span class="wc-foot">Updated ${esc(agoStr(fetchedAt, now))}${state && state.stale ? " · offline" : ""} · TheSportsDB</span>`
      : "";

    root.innerHTML = `
      <div class="wc-card">
        <div class="wc-head">
          <span class="wc-dot"><img src="${ICON}" alt=""></span>
          <span class="wc-title">FIFA World Cup</span>
          <span class="wc-min" title="Minimize">–</span>
        </div>
        <div class="wc-body">
          ${bodyFor(state, now)}
          ${foot}
        </div>
      </div>`;
    root.querySelector(".wc-min").addEventListener("click", () => setMinimized(true));
  }

  // ---- state plumbing ----
  function setMinimized(v) {
    minimized = v;
    try {
      chrome.storage.local.set({ [UI_KEY]: { minimized: v } });
    } catch (_) {}
    render();
  }

  function requestState() {
    try {
      chrome.runtime.sendMessage({ type: "WC_GET_STATE" }, (resp) => {
        if (chrome.runtime.lastError) {
          state = { mode: "error" };
          render();
          return;
        }
        if (resp && resp.ok) {
          state = resp.state;
          state.stale = resp.stale;
          fetchedAt = resp.fetchedAt || Date.now();
        } else {
          state = { mode: "error" };
        }
        render();
      });
    } catch (_) {
      state = { mode: "error" };
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
  setInterval(render, TICK_MS); // keep "in 2h 5m" / "3m ago" fresh between polls
})();
