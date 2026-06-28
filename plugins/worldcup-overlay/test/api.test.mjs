import test from "node:test";
import assert from "node:assert/strict";
import { utcDateStr, kickoffMsOf, normalizeEvent } from "../src/api.js";

test("utcDateStr formats UTC YYYY-MM-DD", () => {
  assert.equal(utcDateStr(new Date(Date.UTC(2026, 5, 27, 23, 30))), "2026-06-27");
});

test("kickoffMsOf parses strTimestamp as UTC", () => {
  assert.equal(kickoffMsOf({ strTimestamp: "2026-06-27 19:00:00" }), Date.UTC(2026, 5, 27, 19));
});

test("kickoffMsOf falls back to dateEvent + strTime", () => {
  assert.equal(
    kickoffMsOf({ dateEvent: "2026-06-27", strTime: "21:00:00" }),
    Date.UTC(2026, 5, 27, 21)
  );
});

test("kickoffMsOf returns null when nothing is usable", () => {
  assert.equal(kickoffMsOf({}), null);
});

test("normalizeEvent maps the provider shape to a WcEvent", () => {
  const m = normalizeEvent({
    idEvent: "1",
    strHomeTeam: "Brazil",
    strAwayTeam: "Norway",
    intHomeScore: "4",
    intAwayScore: "1",
    strStatus: "FT",
    strVenue: "MetLife Stadium",
    strTimestamp: "2026-06-26 19:00:00",
  });
  assert.equal(m.id, "1");
  assert.equal(m.home, "Brazil");
  assert.equal(m.away, "Norway");
  assert.equal(m.homeScore, 4); // numeric, not "4"
  assert.equal(m.awayScore, 1);
  assert.equal(m.phase, "finished");
  assert.equal(m.venue, "MetLife Stadium");
  assert.equal(m.kickoffMs, Date.UTC(2026, 5, 26, 19));
});

test("normalizeEvent retains the group (for standings)", () => {
  const m = normalizeEvent({ idEvent: "1", strHomeTeam: "A", strAwayTeam: "B", strGroup: "Group C" });
  assert.equal(m.group, "Group C");
  assert.equal(normalizeEvent({ idEvent: "2", strHomeTeam: "A", strAwayTeam: "B" }).group, "");
});

test("normalizeEvent leaves missing scores as null", () => {
  const m = normalizeEvent({ idEvent: "2", strStatus: "NS", intHomeScore: "", intAwayScore: null });
  assert.equal(m.homeScore, null);
  assert.equal(m.awayScore, null);
  assert.equal(m.phase, "scheduled");
});
