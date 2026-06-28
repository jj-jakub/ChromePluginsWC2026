import test from "node:test";
import assert from "node:assert/strict";

// agenda.js uses self.WC.fmt.dayLabel (format.js). Shim self, load format then agenda.
globalThis.self = globalThis;
await import(new URL("../src/format.js", import.meta.url));
await import(new URL("../src/agenda.js", import.meta.url));
const { groupByDay } = globalThis.WC.agenda;

const DAY = 86400000;

test("groupByDay buckets matches under day headers in chronological order", () => {
  const now = new Date(2026, 5, 27, 12, 0, 0).getTime(); // local noon
  const m = (id, ko) => ({ id, kickoffMs: ko });
  const matches = [
    m("tomorrow", now + DAY),
    m("today-late", now + 3 * 3600000),
    m("today-early", now + 3600000),
  ];
  const groups = groupByDay(matches, now);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "Today");
  assert.equal(groups[1].label, "Tomorrow");
  // within "today", chronological
  assert.deepEqual(groups[0].matches.map((x) => x.id), ["today-early", "today-late"]);
});

test("groupByDay drops matches without a kickoff and handles an empty deck", () => {
  const now = new Date(2026, 5, 27, 12, 0, 0).getTime();
  assert.deepEqual(groupByDay([], now), []);
  assert.deepEqual(groupByDay([{ id: "x", kickoffMs: null }], now), []);
});
