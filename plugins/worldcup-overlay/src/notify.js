// Desktop-notification decisions. Pure ES module (no chrome / network), imported by the service
// worker and unit-tested directly. Given the current deck + the user's prefs, returns the
// notifications that *should* exist right now, each with a STABLE tag so the worker can fire each
// one exactly once (it tracks already-fired tags). Tags encode state (score in the tag) so a new
// score is a new notification. Kickoff reminders are fully reliable from kickoffMs math; in-play
// deltas upgrade automatically with a patron live-score key.

import { matchHasFavorite } from "./wc-state.js";

/**
 * @param {WcEvent[]} deck
 * @param {number} now
 * @param {string[]} favorites
 * @param {{enabled,kickoff,goals,fullTime,leadMins,favoritesOnly}} prefs
 * @returns {{tag:string,title:string,message:string}[]}
 */
export function notificationsFor(deck, now, favorites, prefs) {
  const out = [];
  if (!prefs || !prefs.enabled) return out;
  const want = (m) => !prefs.favoritesOnly || matchHasFavorite(m, favorites);
  const lead = prefs.leadMins || 15;

  for (const m of deck || []) {
    if (!m || !want(m)) continue;

    if (prefs.kickoff && m.matchMode === "upcoming" && m.kickoffMs) {
      const mins = (m.kickoffMs - now) / 60000;
      if (mins > 0 && mins <= lead) {
        out.push({ tag: `ko-${m.id}`, title: "Kickoff soon", message: `${m.home} v ${m.away} — in ~${Math.max(1, Math.round(mins))}m` });
      }
    }

    if (prefs.goals && m.matchMode === "live") {
      out.push({ tag: `live-${m.id}`, title: "Now live", message: `${m.home} v ${m.away} has kicked off` });
      if (m.homeScore != null && m.awayScore != null && (m.homeScore > 0 || m.awayScore > 0)) {
        out.push({ tag: `score-${m.id}-${m.homeScore}-${m.awayScore}`, title: "Goal!", message: `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}` });
      }
    }

    if (prefs.fullTime && m.matchMode === "result" && m.homeScore != null && m.awayScore != null) {
      out.push({ tag: `ft-${m.id}`, title: "Full time", message: `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}` });
    }
  }
  return out;
}
