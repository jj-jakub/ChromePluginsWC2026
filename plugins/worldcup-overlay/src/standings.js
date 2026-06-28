// Group-standings computation. Pure ES module (no chrome / network), imported by the service
// worker and unit-tested directly. Derives a live group table purely from finished results — the
// headline "real data" feature, with no live-feed dependency.
//
// FIFA group ranking used here: points (3/1/0), then goal difference, then goals for, then name
// (a stable, deterministic fallback — the full FIFA head-to-head tiebreakers need fair-play and
// drawing-of-lots data the free tier doesn't expose).

const TEAMS_PER_GROUP = 4;
const MATCHES_PER_GROUP = (TEAMS_PER_GROUP * (TEAMS_PER_GROUP - 1)) / 2; // round-robin = 6

function blankRow(team) {
  return { team, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0 };
}

/** Build a sorted table from a set of finished matches that all belong to one group. */
function tableFromMatches(matches) {
  const teams = new Map();
  const get = (name) => {
    if (!teams.has(name)) teams.set(name, blankRow(name));
    return teams.get(name);
  };

  for (const m of matches) {
    const h = get(m.home);
    const a = get(m.away);
    const hs = m.homeScore;
    const as = m.awayScore;
    h.played++;
    a.played++;
    h.gf += hs;
    h.ga += as;
    a.gf += as;
    a.ga += hs;
    if (hs > as) {
      h.win++;
      a.loss++;
    } else if (hs < as) {
      a.win++;
      h.loss++;
    } else {
      h.draw++;
      a.draw++;
    }
  }

  const rows = [...teams.values()].map((t) => ({
    ...t,
    gd: t.gf - t.ga,
    points: t.win * 3 + t.draw,
  }));

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.team.localeCompare(b.team)
  );

  rows.forEach((r, i) => {
    r.qualifying = i < 2; // top two advance
  });
  return rows;
}

/**
 * Standings for every group present in `events`, keyed by group name. Only finished matches with
 * both scores count; non-group (knockout) matches are ignored.
 * @returns {Record<string, Array>} group name -> sorted rows
 */
export function computeStandings(events) {
  const byGroup = {};
  for (const e of events || []) {
    const g = (e.group || "").trim();
    if (!g) continue;
    if (e.phase !== "finished") continue;
    if (e.homeScore == null || e.awayScore == null) continue;
    (byGroup[g] = byGroup[g] || []).push(e);
  }
  const out = {};
  for (const g of Object.keys(byGroup)) out[g] = tableFromMatches(byGroup[g]);
  return out;
}

/** How many finished group matches we have for `group` (6 = complete; fewer = partial table). */
export function finishedCount(events, group) {
  const g = String(group || "").trim();
  if (!g) return 0;
  return (events || []).filter(
    (e) => (e.group || "").trim() === g && e.phase === "finished" && e.homeScore != null && e.awayScore != null
  ).length;
}

/**
 * The standings for a single group, plus whether the table is partial (not all 6 matches played).
 * @returns {{ group: string, rows: Array, partial: boolean, complete: boolean }}
 */
export function tableFor(events, group) {
  const rows = computeStandings(events)[String(group || "").trim()] || [];
  const played = finishedCount(events, group);
  return { group: String(group || "").trim(), rows, partial: played < MATCHES_PER_GROUP, complete: played >= MATCHES_PER_GROUP };
}
