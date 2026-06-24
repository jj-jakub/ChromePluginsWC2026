// Pure World Cup state logic — no network, no chrome APIs. Unit-testable in isolation.
//
// Takes a list of normalized events (see api.js `normalizeEvent`) plus "now" and decides the
// single thing the overlay should show: a live match, else the next upcoming fixture, else the
// most recent result.

export const LIVE_WINDOW_MS = 150 * 60 * 1000; // a match (+ stoppage/HT) ~ 2h30m of "could be live"

const FINISHED = new Set([
  "FT",
  "AET",
  "PEN",
  "AWD",
  "WO",
  "MATCH FINISHED",
  "FINISHED",
]);
const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "PEN_LIVE", "LIVE", "INPLAY"]);

export function phaseOf(status) {
  const s = (status || "").trim().toUpperCase();
  if (FINISHED.has(s)) return "finished";
  if (LIVE.has(s)) return "live";
  return "scheduled"; // NS, TBD, "", null, postponed-ish — treat as not-yet-finished
}

// Is this event live *right now*? Either the provider says so, or its kickoff has passed and
// it's within the live window and not marked finished. The time-window heuristic covers the
// free API tier, which doesn't push minute-by-minute statuses.
export function isLiveNow(ev, now) {
  if (ev.phase === "finished") return false;
  if (ev.phase === "live") return true;
  if (!ev.kickoffMs) return false;
  return now >= ev.kickoffMs && now <= ev.kickoffMs + LIVE_WINDOW_MS;
}

export function classify(events, now) {
  const list = (events || []).filter(Boolean);

  const live = list
    .filter((e) => isLiveNow(e, now))
    .sort((a, b) => (a.kickoffMs || 0) - (b.kickoffMs || 0));
  if (live.length) {
    return { mode: "live", match: live[0], updatedAt: now };
  }

  const upcoming = list
    .filter((e) => e.phase !== "finished" && e.kickoffMs && e.kickoffMs > now)
    .sort((a, b) => a.kickoffMs - b.kickoffMs);
  if (upcoming.length) {
    return { mode: "upcoming", match: upcoming[0], updatedAt: now };
  }

  const finished = list
    .filter((e) => e.phase === "finished" || (e.homeScore != null && e.awayScore != null))
    .sort((a, b) => (b.kickoffMs || 0) - (a.kickoffMs || 0));
  if (finished.length) {
    return { mode: "result", match: finished[0], updatedAt: now };
  }

  return { mode: "empty", match: null, updatedAt: now };
}
