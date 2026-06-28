import test from "node:test";
import assert from "node:assert/strict";
import { badgeFor } from "../src/badge.js";

const NOW = 1_000_000_000_000;
const H = 3600000;

test("badgeFor shows the live score in red", () => {
  const b = badgeFor({ matches: [{ matchMode: "live", home: "Brazil", away: "Norway", homeScore: 1, awayScore: 0 }], index: 0 }, NOW);
  assert.equal(b.text, "1-0");
  assert.match(b.color, /e11d2b/i);
});

test("badgeFor clamps an over-long score to LIVE (~4-char limit)", () => {
  const b = badgeFor({ matches: [{ matchMode: "live", home: "A", away: "B", homeScore: 10, awayScore: 10 }], index: 0 }, NOW);
  assert.equal(b.text, "LIVE");
});

test("badgeFor shows a compact countdown for the next fixture", () => {
  assert.equal(badgeFor({ matches: [{ matchMode: "upcoming", home: "A", away: "B", kickoffMs: NOW + 2 * H }], index: 0 }, NOW).text, "2h");
  assert.equal(badgeFor({ matches: [{ matchMode: "upcoming", home: "A", away: "B", kickoffMs: NOW + 15 * 60000 }], index: 0 }, NOW).text, "15m");
});

test("badgeFor is empty for results/idle and for an empty deck", () => {
  assert.equal(badgeFor({ matches: [{ matchMode: "result", home: "A", away: "B" }], index: 0 }, NOW).text, "");
  assert.equal(badgeFor({ matches: [], index: 0 }, NOW).text, "");
});

test("badgeFor honors the favorite-aware index", () => {
  const state = {
    matches: [
      { matchMode: "result", home: "A", away: "B" },
      { matchMode: "live", home: "Brazil", away: "Spain", homeScore: 2, awayScore: 1 },
    ],
    index: 1,
  };
  assert.equal(badgeFor(state, NOW).text, "2-1");
});
