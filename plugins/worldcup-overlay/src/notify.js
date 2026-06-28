// Desktop-notification decisions. Pure ES module (no chrome / network), imported by the service
// worker and unit-tested directly. Given the current deck + the user's prefs, returns the
// notifications that *should* exist right now, each with a STABLE tag so the worker can fire each
// one exactly once (it tracks already-fired tags). Tags encode state (score in the tag) so a new
// score is a new notification. Kickoff reminders are reliable from kickoffMs math AS LONG AS the
// refresh interval is finer than the lead window — the worker passes its refresh period as
// extraLeadMs so the last refresh before kickoff always fires the reminder. In-play deltas upgrade
// automatically with a patron live-score key.

import { matchHasFavorite } from "./wc-state.js";

/**
 * @param {WcEvent[]} deck
 * @param {number} now
 * @param {string[]} favorites
 * @param {{enabled,kickoff,goals,fullTime,leadMins,favoritesOnly}} prefs
 * @param {{extraLeadMs?: number, recentMs?: number}} [opts]  extraLeadMs widens the kickoff window
 *        by the refresh cadence; recentMs gates live/score/full-time to recently-kicked-off matches
 *        so opting in doesn't burst stale "Full time" alerts for long-finished games.
 * @returns {{tag:string,title:string,message:string}[]}
 */
export function notificationsFor(deck, now, favorites, prefs, opts) {
  const out = [];
  if (!prefs || !prefs.enabled) return out;
  const o = opts || {};
  const recentMs = o.recentMs != null ? o.recentMs : Infinity;
  const leadMs = (prefs.leadMins || 15) * 60000 + (o.extraLeadMs || 0);
  const want = (m) => !prefs.favoritesOnly || matchHasFavorite(m, favorites);
  const recent = (m) => recentMs === Infinity || (m.kickoffMs != null && now - m.kickoffMs <= recentMs);

  for (const m of deck || []) {
    if (!m || !want(m)) continue;

    if (prefs.kickoff && m.matchMode === "upcoming" && m.kickoffMs) {
      const ms = m.kickoffMs - now;
      if (ms > 0 && ms <= leadMs) {
        out.push({ tag: `ko-${m.id}`, title: "Kickoff soon", message: `${m.home} v ${m.away} — in ~${Math.max(1, Math.round(ms / 60000))}m` });
      }
    }

    if (prefs.goals && m.matchMode === "live" && recent(m)) {
      out.push({ tag: `live-${m.id}`, title: "Now live", message: `${m.home} v ${m.away} has kicked off` });
      if (m.homeScore != null && m.awayScore != null && (m.homeScore > 0 || m.awayScore > 0)) {
        out.push({ tag: `score-${m.id}-${m.homeScore}-${m.awayScore}`, title: "Goal!", message: `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}` });
      }
    }

    if (prefs.fullTime && m.matchMode === "result" && recent(m) && m.homeScore != null && m.awayScore != null) {
      out.push({ tag: `ft-${m.id}`, title: "Full time", message: `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}` });
    }
  }
  return out;
}
