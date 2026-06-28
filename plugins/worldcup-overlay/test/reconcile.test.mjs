import test from "node:test";
import assert from "node:assert/strict";
import { reconcile } from "../src/reconcile.js";

const ev = (o) => ({
  id: o.id,
  phase: o.phase || "scheduled",
  homeScore: o.hs ?? null,
  awayScore: o.as ?? null,
  kickoffMs: o.ko ?? 0,
});

test("reconcile collapses duplicate ids to one record", () => {
  const out = reconcile([ev({ id: "1", phase: "scheduled" }), ev({ id: "1", phase: "live", hs: 1, as: 0 })]);
  assert.equal(out.length, 1);
});

test("finished > live > scheduled, regardless of order", () => {
  const fin = ev({ id: "1", phase: "finished", hs: 2, as: 1 });
  const live = ev({ id: "1", phase: "live", hs: 1, as: 1 });
  const sched = ev({ id: "1", phase: "scheduled" });
  assert.equal(reconcile([sched, live, fin])[0].phase, "finished");
  assert.equal(reconcile([fin, live, sched])[0].phase, "finished");
});

test("a known score beats a blank one at equal phase", () => {
  const blank = ev({ id: "1", phase: "live" });
  const scored = ev({ id: "1", phase: "live", hs: 1, as: 0 });
  assert.equal(reconcile([blank, scored])[0].homeScore, 1);
  assert.equal(reconcile([scored, blank])[0].homeScore, 1);
});

test("higher score-sum wins on a live tie (the later snapshot)", () => {
  const a = ev({ id: "1", phase: "live", hs: 1, as: 0 });
  const b = ev({ id: "1", phase: "live", hs: 2, as: 1 });
  const out = reconcile([a, b])[0];
  assert.equal(out.homeScore, 2);
  assert.equal(out.awayScore, 1);
});

test("material disagreement flags lowConfidence", () => {
  const a = ev({ id: "1", phase: "live", hs: 1, as: 0 });
  const b = ev({ id: "1", phase: "finished", hs: 1, as: 0 });
  assert.equal(reconcile([a, b])[0].lowConfidence, true);
});

test("agreeing duplicates are not flagged low-confidence", () => {
  const a = ev({ id: "1", phase: "finished", hs: 2, as: 1 });
  const b = ev({ id: "1", phase: "finished", hs: 2, as: 1 });
  assert.equal(reconcile([a, b])[0].lowConfidence, undefined);
});

test("distinct ids pass through; null / id-less entries are skipped", () => {
  const out = reconcile([ev({ id: "1" }), ev({ id: "2" }), null, { id: null }, undefined]);
  assert.deepEqual(out.map((e) => e.id).sort(), ["1", "2"]);
});
