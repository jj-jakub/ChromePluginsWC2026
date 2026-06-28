import test from "node:test";
import assert from "node:assert/strict";
import { teamForm } from "../src/form.js";

const e = (home, away, hs, as, ko, phase = "finished") => ({
  home, away, homeScore: hs, awayScore: as, kickoffMs: ko, phase,
});

test("teamForm tallies W/D/L + GF/GA and returns results chronologically", () => {
  const events = [
    e("Brazil", "Norway", 2, 0, 3), // W (home)
    e("Spain", "Brazil", 1, 1, 1), // D (away) — earliest
    e("Brazil", "Italy", 0, 2, 5), // L (home) — latest
  ];
  const f = teamForm(events, "Brazil");
  assert.equal(f.W, 1);
  assert.equal(f.D, 1);
  assert.equal(f.L, 1);
  assert.equal(f.GF, 3); // 1 (away) + 2 (home) + 0 (home)
  assert.equal(f.GA, 3); // 1 + 0 + 2
  assert.deepEqual(f.last, ["D", "W", "L"]); // ordered by kickoff: ko1, ko3, ko5
});

test("teamForm matches case-insensitively and ignores unfinished / other teams", () => {
  const events = [
    e("Brazil", "Norway", 1, 0, 1, "live"), // live -> ignored
    e("Spain", "Italy", 2, 2, 2), // other teams
    e("brazil", "Spain", 3, 0, 3), // case-insensitive home
  ];
  const f = teamForm(events, "Brazil");
  assert.equal(f.W, 1);
  assert.deepEqual(f.last, ["W"]);
});

test("teamForm caps last[] to N (default 5) but totals count all", () => {
  const events = Array.from({ length: 7 }, (_, i) =>
    e("Brazil", "X" + i, 1, 0, i)
  );
  const f = teamForm(events, "Brazil");
  assert.equal(f.last.length, 5);
  assert.equal(f.W, 7);
  assert.equal(f.GF, 7);
});

test("teamForm on no data is all zeros / empty", () => {
  const f = teamForm([], "Brazil");
  assert.deepEqual(f, { team: "Brazil", W: 0, D: 0, L: 0, GF: 0, GA: 0, last: [] });
});
