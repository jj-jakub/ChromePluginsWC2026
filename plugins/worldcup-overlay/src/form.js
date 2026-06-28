// Team form — a nation's recent results in the tournament. Pure ES module (no chrome / network),
// imported by the service worker and unit-tested directly. Computed from finished season events;
// shows "who's hot" context the single-match card lacks, with no live-feed dependency.

const key = (s) => String(s || "").trim().toLowerCase();

/**
 * @param {WcEvent[]} events  season events (only finished ones with both scores are counted)
 * @param {string}    team
 * @param {number}    lastN   how many recent results to keep (chronological, oldest -> newest)
 * @returns {{ team: string, W: number, D: number, L: number, GF: number, GA: number, last: ("W"|"D"|"L")[] }}
 */
export function teamForm(events, team, lastN = 5) {
  const t = key(team);
  const played = (events || [])
    .filter(
      (e) =>
        e &&
        e.phase === "finished" &&
        e.homeScore != null &&
        e.awayScore != null &&
        (key(e.home) === t || key(e.away) === t)
    )
    .sort((a, b) => (a.kickoffMs || 0) - (b.kickoffMs || 0));

  let W = 0, D = 0, L = 0, GF = 0, GA = 0;
  const results = [];
  for (const e of played) {
    const isHome = key(e.home) === t;
    const gf = isHome ? e.homeScore : e.awayScore;
    const ga = isHome ? e.awayScore : e.homeScore;
    GF += gf;
    GA += ga;
    if (gf > ga) {
      W++;
      results.push("W");
    } else if (gf < ga) {
      L++;
      results.push("L");
    } else {
      D++;
      results.push("D");
    }
  }

  return { team, W, D, L, GF, GA, last: results.slice(-lastN) };
}
