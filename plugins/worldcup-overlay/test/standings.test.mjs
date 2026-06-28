import test from "node:test";
import assert from "node:assert/strict";
import { computeStandings, tableFor, finishedCount } from "../src/standings.js";

const m = (home, away, hs, as, group = "Group A", phase = "finished") => ({
  home, away, homeScore: hs, awayScore: as, group, phase,
});

test("computeStandings tallies P/W/D/L/GF/GA/GD/Pts from finished matches", () => {
  const events = [
    m("Brazil", "Norway", 2, 0),
    m("Spain", "Brazil", 1, 1),
    m("Norway", "Spain", 0, 3),
  ];
  const brazil = computeStandings(events)["Group A"].find((r) => r.team === "Brazil");
  assert.equal(brazil.played, 2);
  assert.equal(brazil.win, 1);
  assert.equal(brazil.draw, 1);
  assert.equal(brazil.loss, 0);
  assert.equal(brazil.gf, 3);
  assert.equal(brazil.ga, 1);
  assert.equal(brazil.gd, 2);
  assert.equal(brazil.points, 4);
});

test("computeStandings sorts by points, then GD, then GF; flags the top two", () => {
  const events = [
    m("A", "B", 3, 0),
    m("C", "D", 1, 0),
    m("A", "C", 0, 0),
    m("B", "D", 2, 2),
    m("A", "D", 5, 0),
    m("B", "C", 0, 1),
  ];
  const rows = computeStandings(events)["Group A"];
  assert.deepEqual(rows.map((r) => r.team), ["A", "C", "B", "D"]); // A & C 7pts (A better GD), then B/D on GD
  assert.equal(rows[0].qualifying, true);
  assert.equal(rows[1].qualifying, true);
  assert.equal(rows[2].qualifying, false);
  assert.equal(rows[3].qualifying, false);
});

test("computeStandings ignores non-finished and groupless matches", () => {
  const events = [
    m("Brazil", "Norway", 2, 0, "Group A", "live"),
    m("Spain", "Italy", 1, 0, "", "finished"),
    m("Brazil", "Spain", 1, 1, "Group A", "finished"),
  ];
  const out = computeStandings(events);
  assert.deepEqual(Object.keys(out), ["Group A"]);
  assert.equal(out["Group A"].find((r) => r.team === "Brazil").played, 1);
});

test("tableFor reports partial vs complete (6 matches per group)", () => {
  const t1 = tableFor([m("A", "B", 1, 0), m("C", "D", 0, 0)], "Group A");
  assert.equal(t1.partial, true);
  assert.equal(t1.complete, false);

  const full = [
    m("A", "B", 1, 0), m("C", "D", 0, 0), m("A", "C", 2, 1),
    m("B", "D", 1, 1), m("A", "D", 3, 0), m("B", "C", 0, 2),
  ];
  const t2 = tableFor(full, "Group A");
  assert.equal(t2.partial, false);
  assert.equal(t2.complete, true);
  assert.equal(t2.rows.length, 4);
});

test("finishedCount counts only finished group matches with scores", () => {
  const events = [
    m("A", "B", 1, 0, "Group A", "finished"),
    m("C", "D", null, null, "Group A", "live"),
    m("A", "C", 2, 1, "Group B", "finished"),
  ];
  assert.equal(finishedCount(events, "Group A"), 1);
  assert.equal(finishedCount(events, "Group B"), 1);
  assert.equal(finishedCount(events, ""), 0);
});

test("computeStandings never throws on empty/garbage input", () => {
  assert.deepEqual(computeStandings(null), {});
  assert.deepEqual(computeStandings([]), {});
});
