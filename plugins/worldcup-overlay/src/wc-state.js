// Pure World Cup state logic — no network, no chrome APIs. Unit-testable in isolation.
//
// Decides the single thing the overlay should show from a list of normalized events, and builds
// the chronological deck the user rotates through.

import { LIVE_WINDOW_MS } from "./config.js";

/**
 * @typedef {Object} WcEvent  A normalized match (see api.js `normalizeEvent`).
 * @property {string}  id
 * @property {string}  home
 * @property {string}  away
 * @property {number?} homeScore
 * @property {number?} awayScore
 * @property {string}  status        Raw provider status (e.g. "NS", "FT", "2H").
 * @property {string}  progress      Free-text progress (e.g. "2H 67'") when available.
 * @property {string}  venue
 * @property {"finished"|"live"|"scheduled"} phase
 * @property {number?} kickoffMs     Epoch ms (UTC), or null if unknown.
 * @property {"live"|"upcoming"|"result"} [matchMode]  Per-match mode, added by buildDeck.
 */

const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO", "MATCH FINISHED", "FINISHED"]);
const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "PEN_LIVE", "LIVE", "INPLAY"]);

/** Map a raw provider status to a coarse phase. Unknown/empty -> "scheduled" (not yet finished). */
export function phaseOf(status) {
  const s = (status || "").trim().toUpperCase();
  if (FINISHED.has(s)) return "finished";
  if (LIVE.has(s)) return "live";
  return "scheduled";
}

/**
 * Is this event live right now? Either the provider says so, or its kickoff has passed, it's
 * within the live window, and it isn't marked finished (covers the free tier's lack of a
 * push livescore feed).
 */
export function isLiveNow(ev, now) {
  if (ev.phase === "finished") return false;
  if (ev.phase === "live") return true;
  if (!ev.kickoffMs) return false;
  return now >= ev.kickoffMs && now <= ev.kickoffMs + LIVE_WINDOW_MS;
}

/** Per-match mode used when rendering any match in the rotatable deck. */
export function matchModeOf(ev, now) {
  if (isLiveNow(ev, now)) return "live";
  if (ev.phase === "finished") return "result";
  return "upcoming";
}

/**
 * Pick the single match to feature: live, else the soonest upcoming, else the most recent
 * finished. Returns `{ mode, match, updatedAt }`; mode is "empty" when there's nothing.
 */
export function classify(events, now) {
  const list = (events || []).filter(Boolean);

  const live = list
    .filter((e) => isLiveNow(e, now))
    .sort((a, b) => (a.kickoffMs || 0) - (b.kickoffMs || 0));
  if (live.length) return { mode: "live", match: live[0], updatedAt: now };

  const upcoming = list
    .filter((e) => e.phase !== "finished" && e.kickoffMs && e.kickoffMs > now)
    .sort((a, b) => a.kickoffMs - b.kickoffMs);
  if (upcoming.length) return { mode: "upcoming", match: upcoming[0], updatedAt: now };

  const finished = list
    .filter((e) => e.phase === "finished" || (e.homeScore != null && e.awayScore != null))
    .sort((a, b) => (b.kickoffMs || 0) - (a.kickoffMs || 0));
  if (finished.length) return { mode: "result", match: finished[0], updatedAt: now };

  return { mode: "empty", match: null, updatedAt: now };
}

/**
 * Build the deck the user rotates through with the arrows: every match with a known kickoff,
 * sorted earliest -> latest, each tagged with its own `matchMode`, plus the index of the
 * "primary" match (what classify() features by default).
 * @returns {{ matches: WcEvent[], primaryIndex: number }}
 */
export function buildDeck(events, now) {
  const matches = (events || [])
    .filter((e) => e && e.kickoffMs != null)
    .map((e) => ({ ...e, matchMode: matchModeOf(e, now) }))
    .sort((a, b) => a.kickoffMs - b.kickoffMs);

  const primary = classify(events, now);
  let primaryIndex = primary.match ? matches.findIndex((m) => m.id === primary.match.id) : 0;
  if (primaryIndex < 0) primaryIndex = 0;

  return { matches, primaryIndex };
}
