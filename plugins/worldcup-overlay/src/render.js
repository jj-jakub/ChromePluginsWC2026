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
  const { esc, clock, dayLabel, until, ago, roundLabel, liveMinute } = WC.fmt;
  const flagOf = WC.flag;
  const t = (k, f) => (WC.t ? WC.t(k, f) : f); // localized string, English fallback

  const favKey = (s) => String(s || "").trim().toLowerCase();
  const isFav = (name, favorites) => {
    if (!favorites || !favorites.length) return false;
    const k = favKey(name);
    return favorites.some((f) => favKey(f) === k);
  };

  // Per-team follow ★ — toggles a favorite nation. Always shown (it's how you add favorites).
  function star(name, fav) {
    const label = (fav ? t("unfollowTeam", "Unfollow") : t("followTeam", "Follow")) + " " + name;
    return `<button class="wc-star${fav ? " on" : ""}" data-team="${esc(name)}" title="${esc(label)}" aria-label="${esc(label)}" aria-pressed="${fav ? "true" : "false"}">★</button>`;
  }

  function teamRow(name, score, win, fav) {
    const flag = flagOf(name);
    return `<div class="wc-team${win ? " win" : ""}">
        ${star(name, !!fav)}
        <span class="wc-name">${flag ? `<span class="wc-flag">${flag}</span>` : ""}${esc(name)}</span>
        <span class="wc-score">${score == null ? "" : esc(score)}</span>
      </div>`;
  }

  // last-N W/D/L chips for one team, or "".
  function formChips(form) {
    if (!form || !form.last || !form.last.length) return "";
    return form.last
      .map((r) => `<span class="wc-chip wc-chip-${String(r).toLowerCase()}">${esc(r)}</span>`)
      .join("");
  }

  // A two-row recent-form strip (home then away), or "" when no form data is attached.
  function formStrip(m) {
    const h = formChips(m.homeForm);
    const a = formChips(m.awayForm);
    if (!h && !a) return "";
    const hf = flagOf(m.home);
    const af = flagOf(m.away);
    return `<div class="wc-form">
        <span class="wc-formrow">${hf ? `<span class="wc-flag">${hf}</span>` : ""}${h}</span>
        <span class="wc-formrow">${af ? `<span class="wc-flag">${af}</span>` : ""}${a}</span>
      </div>`;
  }

  function matchBody(m, now, favorites) {
    const ko = m.kickoffMs;
    const venue = m.venue ? `<span class="wc-sub">${esc(m.venue)}</span>` : "";
    const fH = isFav(m.home, favorites);
    const fA = isFav(m.away, favorites);
    const form = formStrip(m);
    const rl = roundLabel(m.round, m.stage, m.group);
    const round = rl ? `<span class="wc-round">${esc(rl)}</span>` : "";

    if (m.matchMode === "live") {
      // prefer a real provider progress string; else an estimated "~67'" clock; else status.
      const est = liveMinute(ko, now);
      const estTxt = est ? `~${est}${est >= 90 ? "+" : ""}'` : "";
      const prog = m.progress || estTxt || m.status || "Live";
      return `
        <span class="wc-status live"><span class="wc-live-dot"></span>${t("statusLive", "Live")}</span>
        ${round}
        <div class="wc-teams">${teamRow(m.home, m.homeScore, false, fH)}${teamRow(m.away, m.awayScore, false, fA)}</div>
        ${form}
        <span class="wc-meta">${esc(prog)}${ko ? ` · ${esc(clock(ko))} kickoff` : ""}</span>
        ${venue}`;
    }
    if (m.matchMode === "upcoming") {
      const when = ko ? `${esc(dayLabel(ko, now))} ${esc(clock(ko))} · ${esc(until(ko, now))}` : "Scheduled";
      const calT = t("titleAddToCalendar", "Add to calendar");
      const cal = ko
        ? `<button class="wc-cal" data-id="${esc(m.id)}" title="${esc(calT)}" aria-label="${esc(calT)}">＋ ${esc(t("labelCalendar", "Calendar"))}</button>`
        : "";
      return `
        <span class="wc-status upcoming">${t("statusUpNext", "Up next")}</span>
        ${round}
        <div class="wc-teams">${teamRow(m.home, null, false, fH)}${teamRow(m.away, null, false, fA)}</div>
        ${form}
        <span class="wc-meta">${when}</span>
        ${venue}
        ${cal}`;
    }
    // result
    const { homeScore: hs, awayScore: as } = m;
    const decided = hs != null && as != null;
    const when = ko ? `${esc(dayLabel(ko, now))} · ${esc(clock(ko))}` : "Recently played";
    return `
      <span class="wc-status result">${t("statusFullTime", "Full time")}</span>
      ${round}
      <div class="wc-teams">${teamRow(m.home, hs, decided && hs > as, fH)}${teamRow(m.away, as, decided && as > hs, fA)}</div>
      ${form}
      <span class="wc-meta">${when}</span>
      ${venue}`;
  }

  /** "Your next: <flag> Home v Away · in 2h" for the soonest live/upcoming favorite, else "". */
  function nextFavoriteLine(deck, now) {
    const cands = deck.filter(
      (m) => m.isFavorite && (m.matchMode === "live" || (m.matchMode === "upcoming" && m.kickoffMs > now))
    );
    if (!cands.length) return "";
    cands.sort((a, b) => {
      const la = a.matchMode === "live" ? 0 : 1;
      const lb = b.matchMode === "live" ? 0 : 1;
      if (la !== lb) return la - lb;
      return (a.kickoffMs || 0) - (b.kickoffMs || 0);
    });
    const m = cands[0];
    const when = m.matchMode === "live" ? "now" : until(m.kickoffMs, now);
    const fh = flagOf(m.home);
    return `<div class="wc-yournext">${esc(t("yourNext", "Your next:"))} ${fh ? `<span class="wc-flag">${fh}</span>` : ""}${esc(m.home)} v ${esc(m.away)} · ${esc(when)}</div>`;
  }

  /** Group standings table body. standings: { group, rows, partial, loading, error }. */
  function standingsBody(standings) {
    if (!standings || standings.loading) return `<div class="wc-empty">${esc(t("loadingTable", "Loading group table…"))}</div>`;
    if (standings.error || !standings.rows || !standings.rows.length) {
      return `<div class="wc-empty">${esc(t("emptyNoTable", "Group table not available yet."))}</div>`;
    }
    const head = `<div class="wc-trow wc-thead">
        <span class="wc-tpos"></span>
        <span class="wc-tteam">${esc(standings.group || "Group")}</span>
        <span class="wc-tnum">P</span>
        <span class="wc-tnum">GD</span>
        <span class="wc-tnum">Pts</span>
      </div>`;
    const rows = standings.rows
      .map((r, i) => {
        const flag = flagOf(r.team);
        const gd = `${r.gd > 0 ? "+" : ""}${r.gd}`;
        return `<div class="wc-trow${r.qualifying ? " q" : ""}">
        <span class="wc-tpos">${i + 1}</span>
        <span class="wc-tteam">${flag ? `<span class="wc-flag">${flag}</span>` : ""}${esc(r.team)}</span>
        <span class="wc-tnum">${esc(r.played)}</span>
        <span class="wc-tnum">${esc(gd)}</span>
        <span class="wc-tnum wc-tpts">${esc(r.points)}</span>
      </div>`;
      })
      .join("");
    const note = standings.partial ? `<div class="wc-tnote">${esc(t("partialTable", "Partial table — group still in progress."))}</div>` : "";
    return `<div class="wc-table">${head}${rows}${note}</div>`;
  }

  // One fixture row in the agenda list; clicking it jumps to that match (data-id).
  function agendaRow(m) {
    const live = m.matchMode === "live";
    const time = live ? "LIVE" : m.kickoffMs ? clock(m.kickoffMs) : "";
    const hf = flagOf(m.home);
    const af = flagOf(m.away);
    let mid;
    if (m.matchMode === "upcoming") {
      mid = "v";
    } else {
      const h = m.homeScore == null ? "" : esc(m.homeScore);
      const a = m.awayScore == null ? "" : esc(m.awayScore);
      mid = `${h}-${a}`;
    }
    return `<button class="wc-agrow${live ? " live" : ""}" data-id="${esc(m.id)}" title="${esc(t("titleShowThisMatch", "Show this match"))}">
        <span class="wc-agtime">${esc(time)}</span>
        <span class="wc-agteams">${hf ? `<span class="wc-flag">${hf}</span>` : ""}<span class="wc-agname">${esc(m.home)}</span><b class="wc-agscore">${mid}</b><span class="wc-agname">${esc(m.away)}</span>${af ? `<span class="wc-flag">${af}</span>` : ""}</span>
      </button>`;
  }

  /** Agenda list body: every fixture grouped under day headers. */
  function agendaBody(deck, now) {
    if (!deck.length) return `<div class="wc-empty">${esc(t("emptyNoSchedule", "No matches in the schedule."))}</div>`;
    const groups =
      WC.agenda && WC.agenda.groupByDay ? WC.agenda.groupByDay(deck, now) : [{ label: "", matches: deck }];
    return (
      `<div class="wc-agenda">` +
      groups
        .map((g) => `<div class="wc-agday">${esc(g.label)}</div>` + g.matches.map(agendaRow).join(""))
        .join("") +
      `</div>`
    );
  }

  /** "in 4m" / "in 1h 2m" / "shortly" — for the data-health retry copy. */
  function retryPhrase(nextRetryAt, now) {
    if (!nextRetryAt || nextRetryAt <= now) return "shortly";
    const u = until(nextRetryAt, now);
    return u === "kicking off" ? "shortly" : u;
  }

  /** A degraded/down banner, or "" when data is healthy. health: {status,nextRetryAt,lastSuccessMs}.
   *  All text here is static or derived from safe fmt output, so only the status class is escaped. */
  function healthBanner(health, now) {
    if (!health || health.status === "ok") return "";
    const status = health.status === "down" ? "down" : "degraded";
    const lead = status === "down" ? t("healthDown", "Can't reach live data.") : t("healthDelayed", "Live data delayed.");
    const retry = `Retrying ${retryPhrase(health.nextRetryAt, now)}.`;
    const last = health.lastSuccessMs ? ` Last update ${ago(health.lastSuccessMs, now)}.` : "";
    return `<div class="wc-health wc-health-${status}">${lead} ${retry}${last}</div>`;
  }

  // ---- schematic pitch view (illustrative top-down play area) ----

  // A compact scoreline above the pitch so the diagram view still carries score/status.
  function pitchScoreline(m, now) {
    const live = m.matchMode === "live";
    const result = m.matchMode === "result";
    let pill;
    if (live) pill = `<span class="wc-status live"><span class="wc-live-dot"></span>${t("statusLive", "Live")}</span>`;
    else if (result) pill = `<span class="wc-status result">${t("statusFullTime", "Full time")}</span>`;
    else pill = `<span class="wc-status upcoming">${t("statusUpNext", "Up next")}</span>`;
    const showScore = (live || result) && m.homeScore != null && m.awayScore != null;
    const sc = showScore ? `${esc(m.homeScore)}–${esc(m.awayScore)}` : "v";
    const hf = flagOf(m.home);
    const af = flagOf(m.away);
    return `<div class="wc-pitch-score">
        ${pill}
        <span class="wc-pitch-teams">
          <span class="wc-pitch-tm">${hf ? `<span class="wc-flag">${hf}</span>` : ""}${esc(m.home)}</span>
          <span class="wc-pitch-sc">${sc}</span>
          <span class="wc-pitch-tm">${esc(m.away)}${af ? `<span class="wc-flag">${af}</span>` : ""}</span>
        </span>
      </div>`;
  }

  // One player token: a translated <g> carrying its base coords so pitch-anim.js can bob it.
  function pitchToken(p, side) {
    return `<g class="wc-pl wc-pl-${side}" data-x="${p.x}" data-y="${p.y}" transform="translate(${p.x} ${p.y})"><circle class="wc-pl-dot" r="2.6"></circle><text class="wc-pl-num" x="0" y="0">${esc(p.n)}</text></g>`;
  }

  /** Top-down schematic pitch for one match. Positions come from WC.pitch (formation-derived). */
  function pitchBody(m, now) {
    if (!m || !WC.pitch) return `<div class="wc-empty">${esc(t("emptyNoMatches", "No World Cup matches found right now."))}</div>`;
    const hForm = m.homeFormation || WC.pitch.formationFor(m.home);
    const aForm = m.awayFormation || WC.pitch.formationFor(m.away);
    const lay = WC.pitch.layout(hForm, aForm);
    const path = WC.pitch.passPath(lay);
    const b0 = WC.pitch.ballAt(path, 0);

    let stripes = "";
    for (let i = 0; i < 10; i++) stripes += `<rect class="wc-stripe wc-stripe-${i % 2}" x="${i * 10}" y="0" width="10" height="64"></rect>`;
    const lines = `<g class="wc-pitch-lines">
        <rect x="1" y="1" width="98" height="62" rx="1"></rect>
        <line x1="50" y1="1" x2="50" y2="63"></line>
        <circle cx="50" cy="32" r="9"></circle>
        <circle class="wc-pitch-spot" cx="50" cy="32" r="0.7"></circle>
        <rect x="1" y="16" width="15" height="32"></rect>
        <rect x="1" y="24" width="6" height="16"></rect>
        <circle class="wc-pitch-spot" cx="11" cy="32" r="0.6"></circle>
        <rect x="83" y="16" width="15" height="32"></rect>
        <rect x="92" y="24" width="6" height="16"></rect>
        <circle class="wc-pitch-spot" cx="89" cy="32" r="0.6"></circle>
      </g>`;
    const players = lay.home.map((p) => pitchToken(p, "h")).join("") + lay.away.map((p) => pitchToken(p, "a")).join("");
    const ball = `<g class="wc-pitch-ball" transform="translate(${b0.x} ${b0.y})"><circle r="1.7"></circle></g>`;
    const label = esc(t("titlePitchView", "Pitch view"));
    return `${pitchScoreline(m, now)}
      <div class="wc-pitch-wrap">
        <svg class="wc-pitch" viewBox="0 0 100 64" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">
          <g class="wc-pitch-grass">${stripes}</g>
          ${lines}
          <g class="wc-pitch-players">${players}</g>
          ${ball}
        </svg>
        <div class="wc-pitch-note">${esc(t("pitchSchematic", "Schematic — illustrative positions, not live tracking."))}</div>
      </div>`;
  }

  /**
   * Full card markup.
   * @param {Object} model
   * @param {WcEvent[]} model.deck      sorted matches to show (already filtered for favFilter)
   * @param {number?}   model.cursor    index of the match to show (clamped by the caller)
   * @param {number?}   model.fetchedAt epoch ms of the last successful fetch
   * @param {boolean}   model.stale     showing a cached/offline copy
   * @param {boolean}   model.refreshing manual refresh in progress (spinner)
   * @param {boolean}   model.loadError could not load any data
   * @param {Object?}   model.health    {status,nextRetryAt,lastSuccessMs} data-health summary
   * @param {string[]}  model.favorites favorite nations (for the per-team ★ state)
   * @param {boolean}   model.favFilter favorites-only filter is active
   * @param {boolean}   model.canFilter the full deck has at least one favorite (show the filter btn)
   * @param {string}    model.icon      extension icon URL (chrome.runtime.getURL)
   */
  function card(model, now) {
    const {
      deck = [], fetchedAt, stale, refreshing, loadError, health,
      favorites = [], favFilter = false, canFilter = false,
      mode = "match", standings = null, canTable = false, flash = null, icon = "",
    } = model || {};
    let cursor = model && model.cursor != null ? model.cursor : 0;
    if (cursor < 0 || cursor >= deck.length) cursor = 0;

    const tableMode = mode === "table";
    const agendaMode = mode === "agenda";
    const pitchMode = mode === "pitch";
    const shownId = deck[cursor] && deck[cursor].id;
    const pulsing =
      !tableMode && !agendaMode && !pitchMode && flash && flash.ids && shownId != null && flash.ids.indexOf(shownId) >= 0;
    const banner = healthBanner(health, now);
    let body;
    let nav = "";
    if (tableMode) {
      body = standingsBody(standings);
    } else if (agendaMode) {
      body = agendaBody(deck, now);
    } else if (pitchMode) {
      body = pitchBody(deck[cursor], now);
    } else if (loadError) {
      body = `<div class="wc-empty">${esc(t("emptyError", "Couldn't load World Cup data."))}</div>`;
    } else if (!deck.length) {
      body = favFilter
        ? `<div class="wc-empty">${esc(t("emptyNoFavorites", "No favorite matches right now."))}</div>`
        : `<div class="wc-empty">${esc(t("emptyNoMatches", "No World Cup matches found right now."))}</div>`;
    } else {
      body = matchBody(deck[cursor], now, favorites);
      if (deck.length > 1) {
        const earlier = esc(t("titleEarlierMatch", "Earlier match"));
        const later = esc(t("titleLaterMatch", "Later match"));
        nav = `
          <div class="wc-nav">
            <button class="wc-arrow" data-dir="-1" title="${earlier}" aria-label="${earlier}">‹</button>
            <button class="wc-count" title="${esc(t("titleJumpToCurrent", "Jump to current"))}">${cursor + 1} / ${deck.length}</button>
            <button class="wc-arrow" data-dir="1" title="${later}" aria-label="${later}">›</button>
          </div>`;
      }
    }

    const showMatchT = esc(t("titleShowMatch", "Show match"));
    const agendaBtn = !loadError && deck.length
      ? `<button type="button" class="wc-icon wc-agendatoggle${agendaMode ? " on" : ""}" title="${agendaMode ? showMatchT : esc(t("titleAllFixtures", "All fixtures"))}" aria-label="${esc(t("ariaToggleFixtures", "Toggle fixtures list"))}" aria-pressed="${agendaMode ? "true" : "false"}">☰</button>`
      : "";
    const tableBtn = canTable
      ? `<button type="button" class="wc-icon wc-tabletoggle${tableMode ? " on" : ""}" title="${tableMode ? showMatchT : esc(t("titleGroupTable", "Group table"))}" aria-label="${esc(t("ariaToggleTable", "Toggle group table"))}" aria-pressed="${tableMode ? "true" : "false"}">▦</button>`
      : "";
    const pitchBtn = !loadError && deck.length
      ? `<button type="button" class="wc-icon wc-pitchtoggle${pitchMode ? " on" : ""}" title="${pitchMode ? showMatchT : esc(t("titlePitchView", "Pitch view"))}" aria-label="${esc(t("ariaTogglePitch", "Toggle pitch view"))}" aria-pressed="${pitchMode ? "true" : "false"}">⛶</button>`
      : "";
    const favBtn = canFilter && !tableMode && !agendaMode && !pitchMode
      ? `<button type="button" class="wc-icon wc-favfilter${favFilter ? " on" : ""}" title="${favFilter ? esc(t("titleShowAll", "Show all matches")) : esc(t("titleFavoritesOnly", "Show favorites only"))}" aria-label="${esc(t("ariaToggleFavorites", "Toggle favorites only"))}" aria-pressed="${favFilter ? "true" : "false"}">★</button>`
      : "";

    const yourNext = !tableMode && !agendaMode && !pitchMode && !loadError && deck.length ? nextFavoriteLine(deck, now) : "";

    const ver =
      typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest
        ? chrome.runtime.getManifest().version
        : "";
    const foot = fetchedAt
      ? `<span class="wc-foot">${esc(t("footUpdated", "Updated"))} ${esc(ago(fetchedAt, now))}${stale ? ` · ${esc(t("footOffline", "offline"))}` : ""} · TheSportsDB${ver ? ` · v${esc(ver)}` : ""}</span>`
      : "";

    const goal = pulsing ? `<div class="wc-goalflash">⚽ GOAL!</div>` : "";

    return `
      <div class="wc-card${pulsing ? " wc-goal" : ""}">
        <div class="wc-head">
          <span class="wc-dot"><img src="${icon}" alt=""></span>
          <span class="wc-title">FIFA World Cup</span>
          ${agendaBtn}
          ${tableBtn}
          ${pitchBtn}
          ${favBtn}
          <button type="button" class="wc-icon wc-refresh${refreshing ? " wc-spin" : ""}" title="${esc(t("titleRefresh", "Refresh now"))}" aria-label="${esc(t("titleRefresh", "Refresh now"))}">↻</button>
          <button type="button" class="wc-icon wc-min" title="${esc(t("titleMinimize", "Minimize"))}" aria-label="${esc(t("titleMinimize", "Minimize"))}">–</button>
        </div>
        ${goal}
        ${banner}
        <div class="wc-body">${body}</div>
        ${nav}
        <div class="wc-foot-wrap">${yourNext}${foot}</div>
      </div>`;
  }

  /** Minimized launcher ball. model: { deck, icon }. */
  function mini(model) {
    const { deck = [], icon = "" } = model || {};
    const live = deck.some((m) => m.matchMode === "live");
    return `<button type="button" class="wc-mini" title="${esc(t("titleExpand", "FIFA World Cup — click to expand"))}" aria-label="${esc(t("titleExpand", "FIFA World Cup — click to expand"))}">
        <img src="${icon}" alt="">${live ? '<span class="wc-mini-live"></span>' : ""}
      </button>`;
  }

  WC.render = { teamRow, matchBody, card, mini, pitchBody };
})();
