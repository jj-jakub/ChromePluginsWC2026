// Cross-endpoint reconciliation. Pure ES module (no chrome / network), imported by api.js and
// unit-tested directly. The same fixture often appears across the five endpoints we hit (eventsday
// x3 + next + past). The old dedupe kept the FIRST record seen, which during a status transition
// could pin a stale "scheduled" row over a fresher "live"/"finished" one. This picks the
// most-progressed / most-recent record per id and flags low confidence when sources disagree —
// a free second-source corroboration using data we already fetched.

// Operates on NORMALIZED WcEvents (they carry .phase / .homeScore / .awayScore).

const PHASE_RANK = { finished: 2, live: 1, scheduled: 0 };
const rankOf = (e) => PHASE_RANK[e.phase] ?? 0;
const hasScore = (e) => e.homeScore != null && e.awayScore != null;
const scoreSum = (e) => (e.homeScore || 0) + (e.awayScore || 0);

/** Which of two records describing the same match is the better source of truth. */
function preferred(a, b) {
  const ra = rankOf(a);
  const rb = rankOf(b);
  if (ra !== rb) return ra > rb ? a : b; // finished > live > scheduled
  if (hasScore(a) !== hasScore(b)) return hasScore(a) ? a : b; // a known score beats a blank one
  if (hasScore(a) && hasScore(b) && scoreSum(a) !== scoreSum(b)) {
    return scoreSum(a) > scoreSum(b) ? a : b; // mid-match, the higher total is the later snapshot
  }
  if ((a.kickoffMs || 0) !== (b.kickoffMs || 0)) return (a.kickoffMs || 0) >= (b.kickoffMs || 0) ? a : b;
  return a;
}

/** Do two records for the same match materially disagree (different phase or different score)? */
function disagree(a, b) {
  if (a.phase !== b.phase) return true;
  if (hasScore(a) && hasScore(b) && (a.homeScore !== b.homeScore || a.awayScore !== b.awayScore)) {
    return true;
  }
  return false;
}

/**
 * De-duplicate by id, merging duplicates to the most-progressed record. The kept record gains a
 * `lowConfidence: true` flag whenever any of its duplicate sources disagreed with it.
 * @param {WcEvent[]} events normalized events, possibly with duplicate ids
 * @returns {WcEvent[]} one record per id, original order of first appearance preserved
 */
export function reconcile(events) {
  const byId = new Map();
  for (const ev of events || []) {
    if (!ev || ev.id == null) continue;
    const prev = byId.get(ev.id);
    if (!prev) {
      byId.set(ev.id, ev);
      continue;
    }
    const winner = preferred(prev, ev);
    const lowConfidence = prev.lowConfidence || ev.lowConfidence || disagree(prev, ev);
    byId.set(ev.id, lowConfidence ? { ...winner, lowConfidence: true } : winner);
  }
  return [...byId.values()];
}
