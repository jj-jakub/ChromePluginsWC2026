import test from "node:test";
import assert from "node:assert/strict";
import { asEventArray, cleanScore, cleanRecord, sanitizeEvents } from "../src/sanitize.js";

test("asEventArray coerces non-arrays to an empty array", () => {
  assert.deepEqual(asEventArray(null), []);
  assert.deepEqual(asEventArray(undefined), []);
  assert.deepEqual(asEventArray("not an array"), []);
  assert.deepEqual(asEventArray({ events: 1 }), []);
  assert.deepEqual(asEventArray([1, 2]), [1, 2]);
});

test("asEventArray caps an absurdly large payload", () => {
  const big = Array.from({ length: 1000 }, (_, i) => i);
  assert.equal(asEventArray(big).length, 500);
});

test("cleanScore accepts plausible ints, rejects junk / negative / absurd", () => {
  assert.equal(cleanScore("3"), 3);
  assert.equal(cleanScore(0), 0);
  assert.equal(cleanScore("0"), 0);
  assert.equal(cleanScore(""), null);
  assert.equal(cleanScore(null), null);
  assert.equal(cleanScore(undefined), null);
  assert.equal(cleanScore("abc"), null);
  assert.equal(cleanScore(-1), null);
  assert.equal(cleanScore(1000), null);
  assert.equal(cleanScore(2.6), 3); // rounds
});

test("cleanRecord drops records with no id or no team names", () => {
  assert.equal(cleanRecord(null), null);
  assert.equal(cleanRecord("x"), null);
  assert.equal(cleanRecord({ strHomeTeam: "Brazil", strAwayTeam: "Norway" }), null); // no id
  assert.equal(cleanRecord({ idEvent: "1" }), null); // no teams
  assert.equal(cleanRecord({ idEvent: "1", strHomeTeam: "  ", strAwayTeam: "" }), null);
});

test("cleanRecord trims, cleans scores, and preserves unknown fields", () => {
  const c = cleanRecord({
    idEvent: " 7 ",
    strHomeTeam: " Brazil ",
    strAwayTeam: "Norway",
    intHomeScore: "2",
    intAwayScore: "-5",
    strVenue: " MetLife Stadium ",
    strTimestamp: "2026-06-26 19:00:00",
    extraProviderField: "keep me",
  });
  assert.equal(c.idEvent, "7");
  assert.equal(c.strHomeTeam, "Brazil");
  assert.equal(c.intHomeScore, 2);
  assert.equal(c.intAwayScore, null); // negative -> unknown
  assert.equal(c.strVenue, "MetLife Stadium");
  assert.equal(c.strTimestamp, "2026-06-26 19:00:00"); // passthrough for normalizeEvent
  assert.equal(c.extraProviderField, "keep me");
});

test("sanitizeEvents never throws on garbage and drops the rejects", () => {
  assert.doesNotThrow(() => sanitizeEvents("totally not an array"));
  assert.doesNotThrow(() => sanitizeEvents(null));
  const out = sanitizeEvents([
    null,
    "x",
    { idEvent: "1", strHomeTeam: "A", strAwayTeam: "B" },
    { strHomeTeam: "no id here" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].idEvent, "1");
});
