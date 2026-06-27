// TheSportsDB client for the FIFA World Cup. Fetches a window of fixtures and normalizes them
// into the WcEvent shape the rest of the app consumes. Credentials live in config.js.
//
// The free tier has no minute-by-minute livescore feed, so live status is inferred from kickoff
// time (see wc-state.js). To upgrade, set a patron key in config.js (and optionally wire the v2
// livescore endpoint here).

import { API_BASE, THESPORTSDB } from "./config.js";
import { phaseOf } from "./wc-state.js";

const DAY_MS = 86400000;

async function getJSON(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** "YYYY-MM-DD" in UTC for a Date. */
export function utcDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Parse a TheSportsDB timestamp (UTC) to epoch ms. Prefers strTimestamp, falls back to
 * dateEvent + strTime. Returns null when nothing is usable.
 */
export function kickoffMsOf(ev) {
  const ts = ev.strTimestamp || ev.strTimestampMS;
  if (ts) {
    const norm = String(ts).includes("T") ? String(ts) : String(ts).replace(" ", "T");
    const ms = Date.parse(norm.endsWith("Z") ? norm : norm + "Z");
    if (!Number.isNaN(ms)) return ms;
  }
  if (ev.dateEvent) {
    const t = ev.strTime && ev.strTime !== "00:00:00" ? ev.strTime : "00:00:00";
    const ms = Date.parse(`${ev.dateEvent}T${t}Z`);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Raw TheSportsDB event -> normalized {@link WcEvent}. */
export function normalizeEvent(ev) {
  return {
    id: ev.idEvent,
    league: ev.strLeague || "FIFA World Cup",
    round: ev.intRound || ev.strStage || "",
    venue: ev.strVenue || "",
    home: ev.strHomeTeam || "Home",
    away: ev.strAwayTeam || "Away",
    homeBadge: ev.strHomeTeamBadge || "",
    awayBadge: ev.strAwayTeamBadge || "",
    homeScore: toNum(ev.intHomeScore),
    awayScore: toNum(ev.intAwayScore),
    status: ev.strStatus || "",
    progress: ev.strProgress || "",
    phase: phaseOf(ev.strStatus),
    kickoffMs: kickoffMsOf(ev),
  };
}

const endpoints = {
  day: (dateStr) => `${API_BASE}/eventsday.php?d=${dateStr}&l=${THESPORTSDB.LEAGUE_ID}`,
  next: () => `${API_BASE}/eventsnextleague.php?id=${THESPORTSDB.LEAGUE_ID}`,
  past: () => `${API_BASE}/eventspastleague.php?id=${THESPORTSDB.LEAGUE_ID}`,
};

async function eventsFrom(url) {
  const data = await getJSON(url);
  return data.events || [];
}

/**
 * Pull a window of events around "now" (yesterday/today/tomorrow UTC, to cover timezone edges)
 * plus the league's next/past endpoints as a safety net. Deduped by event id and normalized.
 * Per-request failures are tolerated — a partial result is better than none.
 * @returns {Promise<WcEvent[]>}
 */
export async function fetchEvents(now = Date.now()) {
  const days = [now - DAY_MS, now, now + DAY_MS].map((t) => utcDateStr(new Date(t)));
  const urls = [...days.map(endpoints.day), endpoints.next(), endpoints.past()];

  const results = await Promise.allSettled(urls.map(eventsFrom));

  const byId = new Map();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const raw of r.value) {
      if (raw && raw.idEvent && !byId.has(raw.idEvent)) {
        byId.set(raw.idEvent, normalizeEvent(raw));
      }
    }
  }
  return [...byId.values()];
}
