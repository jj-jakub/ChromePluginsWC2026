// Group-standings computation. Pure ES module (no chrome / network), imported by the service
// worker and unit-tested directly. Derives a live group table purely from finished results — the
// headline "real data" feature, with no live-feed dependency.
//
// FIFA group ranking used here: points (3/1/0), then goal difference, then goals for, then name
// (a stable, deterministic fallback — the full FIFA head-to-head tiebreakers need fair-play and
// drawing-of-lots data the free tier doesn't expose).

const TEAMS_PER_GROUP = 4;
const MATCHES_PER_GROUP = (TEAMS_PER_GROUP * (TEAMS_PER_GROUP - 1)) / 2; // round-robin = 6

const teamKey = (s) => String(s || "").trim().toLowerCase();

function blankRow(team) {
  return { team, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0 };
}

/**
 * Build a sorted table from ALL of a group's events (finished or not). Every team in the group
 * gets a row (so the full roster shows, with 0s for teams yet to play); only finished matches
 * with both scores contribute to the stats. Teams are keyed case-insensitively so the same nation
 * never splits into two rows (matching form.js / favorites identity). `qualifying` is only flagged
 * once the group is complete (all matches played) — a partial table makes no qualification claim.
 */
function tableFromMatches(groupEvents) {
  const teams = new Map();
  const get = (name) => {
    const id = teamKey(name);
    if (!teams.has(id)) teams.set(id, blankRow(name));
    return teams.get(id);
  };

  let finished = 0;
  for (const m of groupEvents) {
    const h = get(m.home); // register both teams even for unplayed fixtures (full roster)
    const a = get(m.away);
    if (m.phase !== "finished" || m.homeScore == null || m.awayScore == null) continue;
    finished++;
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

  const complete = finished >= MATCHES_PER_GROUP;
  rows.forEach((r, i) => {
    r.qualifying = complete && i < 2; // only claim qualification once the group is decided
  });
  return rows;
}

/**
 * Standings for every group present in `events`, keyed by group name. Every team that appears in
 * a group's fixtures gets a row; only finished matches with both scores count toward the stats.
 * Non-group (knockout) matches are ignored.
 * @returns {Record<string, Array>} group name -> sorted rows
 */
export function computeStandings(events) {
  const byGroup = {};
  for (const e of events || []) {
    const g = (e.group || "").trim();
    if (!g) continue;
    (byGroup[g] = byGroup[g] || []).push(e); // all group events — finished or not
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
