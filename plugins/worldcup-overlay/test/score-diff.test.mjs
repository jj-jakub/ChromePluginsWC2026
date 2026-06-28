import test from "node:test";
import assert from "node:assert/strict";

globalThis.self = globalThis;
await import(new URL("../src/score-diff.js", import.meta.url));
const { diff, announceFor } = globalThis.WC.scoreDiff;

const m = (id, hs, as, home = "A", away = "B") => ({ id, homeScore: hs, awayScore: as, home, away });

test("diff reports the changed side, matched by id", () => {
  const d = diff([m("1", 0, 0)], [m("1", 1, 0)]);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], { id: "1", side: "home", from: 0, to: 1 });
});

test("diff ignores first-appearance scores, unchanged decks, and unmatched ids", () => {
  assert.deepEqual(diff([m("1", null, null)], [m("1", 1, 0)]), []); // prev had no score
  assert.deepEqual(diff([m("1", 1, 0)], [m("1", 1, 0)]), []); // unchanged
  assert.deepEqual(diff([m("1", 1, 0)], [m("2", 0, 0)]), []); // different id
});

test("announceFor composes a sentence on a change, null otherwise", () => {
  assert.equal(
    announceFor([m("1", 0, 0, "Brazil", "Norway")], [m("1", 1, 0, "Brazil", "Norway")]),
    "Goal — Brazil 1, Norway 0"
  );
  assert.equal(announceFor([m("1", 1, 0)], [m("1", 1, 0)]), null);
});
