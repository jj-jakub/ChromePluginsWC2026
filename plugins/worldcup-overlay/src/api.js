// TheSportsDB client for the FIFA World Cup (league 4429, season 2026).
//
// Free public test key — no signup. The free tier has no minute-by-minute livescore feed, so
// we read the day's schedule and infer "live" from kickoff time (see wc-state.js). To upgrade,
// drop a patron key into API_KEY and (optionally) wire the v2 livescore endpoint.

import { phaseOf } from "./wc-state.js";

export const API_KEY = "3"; // public free test key
export const LEAGUE_ID = "4429"; // FIFA World Cup
export const SEASON = "2026";

const BASE = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

async function getJSON(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// "YYYY-MM-DD" in UTC for a Date.
export function utcDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// Parse TheSportsDB timestamps (UTC) into epoch ms. Prefers strTimestamp; falls back to
// dateEvent + strTime. Returns null if nothing usable.
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

// Raw TheSportsDB event -> normalized shape used by wc-state.js and the UI.
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

async function eventsForDay(dateStr) {
  const data = await getJSON(`${BASE}/eventsday.php?d=${dateStr}&l=${LEAGUE_ID}`);
  return data.events || [];
}

async function nextLeagueEvents() {
  const data = await getJSON(`${BASE}/eventsnextleague.php?id=${LEAGUE_ID}`);
  return data.events || [];
}

async function pastLeagueEvents() {
  const data = await getJSON(`${BASE}/eventspastleague.php?id=${LEAGUE_ID}`);
  return data.events || [];
}

// Pull a window of events around "now" (yesterday/today/tomorrow UTC to cover timezone edges)
// plus the league's next/past endpoints as a safety net, deduped by event id.
export async function fetchEvents(now = Date.now()) {
  const today = new Date(now);
  const yday = new Date(now - 86400000);
  const tmrw = new Date(now + 86400000);

  const days = [yday, today, tmrw].map(utcDateStr);
  const results = await Promise.allSettled([
    ...days.map((d) => eventsForDay(d)),
    nextLeagueEvents(),
    pastLeagueEvents(),
  ]);

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
