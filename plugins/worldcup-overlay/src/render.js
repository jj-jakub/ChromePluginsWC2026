// Pure HTML rendering for the overlay, exposed on the shared content-script namespace
// (self.WC.render). Extracted from content.js so the markup builders are unit-testable and can
// be reused verbatim by the toolbar popup (popup.js) — both load this file as a classic script.
//
// Functions take a plain model + `now` and return an HTML string. They read formatting/flag
// helpers off self.WC (loaded first: format.js, flags.js) but touch no DOM, no chrome APIs and
// no module-scoped view state — so test/render.test.mjs can drive them under the `self` shim.
// NOTE: callers interpolate the result with innerHTML, so every dynamic value goes through esc().

(() => {
  const WC = (self.WC = self.WC || {});
  const { esc, clock, dayLabel, until, ago } = WC.fmt;
  const flagOf = WC.flag;

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

  /**
   * Full card markup.
   * @param {Object} model
   * @param {WcEvent[]} model.deck      sorted matches (each with .matchMode)
   * @param {number?}   model.cursor    index of the match to show (clamped by the caller)
   * @param {number?}   model.fetchedAt epoch ms of the last successful fetch
   * @param {boolean}   model.stale     showing a cached/offline copy
   * @param {boolean}   model.refreshing manual refresh in progress (spinner)
   * @param {boolean}   model.loadError could not load any data
   * @param {string}    model.icon      extension icon URL (chrome.runtime.getURL)
   */
  function card(model, now) {
    const { deck = [], fetchedAt, stale, refreshing, loadError, icon = "" } = model || {};
    let cursor = model && model.cursor != null ? model.cursor : 0;
    if (cursor < 0 || cursor >= deck.length) cursor = 0;

    let body;
    let nav = "";
    if (loadError) {
      body = `<div class="wc-empty">Couldn't load World Cup data. It'll retry shortly.</div>`;
    } else if (!deck.length) {
      body = `<div class="wc-empty">No World Cup matches found right now.</div>`;
    } else {
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
          <span class="wc-dot"><img src="${icon}" alt=""></span>
          <span class="wc-title">FIFA World Cup</span>
          <span class="wc-icon wc-refresh${refreshing ? " wc-spin" : ""}" title="Refresh now" aria-label="Refresh">↻</span>
          <span class="wc-icon wc-min" title="Minimize" aria-label="Minimize">–</span>
        </div>
        <div class="wc-body">${body}</div>
        ${nav}
        <div class="wc-foot-wrap">${foot}</div>
      </div>`;
  }

  /** Minimized launcher ball. model: { deck, icon }. */
  function mini(model) {
    const { deck = [], icon = "" } = model || {};
    const live = deck.some((m) => m.matchMode === "live");
    return `<div class="wc-mini" title="FIFA World Cup — click to expand">
        <img src="${icon}" alt="World Cup">${live ? '<span class="wc-mini-live"></span>' : ""}
      </div>`;
  }

  WC.render = { teamRow, matchBody, card, mini };
})();
