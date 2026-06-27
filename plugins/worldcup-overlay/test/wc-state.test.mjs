import test from "node:test";
import assert from "node:assert/strict";
import {
  phaseOf,
  isLiveNow,
  matchModeOf,
  classify,
  buildDeck,
} from "../src/wc-state.js";

const NOW = Date.UTC(2026, 5, 27, 12, 0, 0);
const H = 3600000;

const ev = (o) => ({
  id: o.id,
  home: o.home || "Home",
  away: o.away || "Away",
  homeScore: o.hs ?? null,
  awayScore: o.as ?? null,
  status: o.status || "",
  progress: "",
  venue: "",
  phase: phaseOf(o.status),
  kickoffMs: o.ko ?? null,
});

test("phaseOf classifies provider statuses", () => {
  assert.equal(phaseOf("FT"), "finished");
  assert.equal(phaseOf("Match Finished"), "finished");
  assert.equal(phaseOf("2H"), "live");
  assert.equal(phaseOf("HT"), "live");
  assert.equal(phaseOf("NS"), "scheduled");
  assert.equal(phaseOf(""), "scheduled");
  assert.equal(phaseOf(null), "scheduled");
});

test("isLiveNow respects phase and the kickoff window", () => {
  assert.equal(isLiveNow(ev({ id: 1, status: "2H", ko: NOW - H }), NOW), true);
  assert.equal(isLiveNow(ev({ id: 2, status: "NS", ko: NOW - 30 * 60000 }), NOW), true); // window
  assert.equal(isLiveNow(ev({ id: 3, status: "NS", ko: NOW - 3 * H }), NOW), false); // past window
  assert.equal(isLiveNow(ev({ id: 4, status: "NS", ko: NOW + H }), NOW), false); // future
  assert.equal(isLiveNow(ev({ id: 5, status: "FT", ko: NOW - H }), NOW), false); // finished
});

test("matchModeOf tags each match", () => {
  assert.equal(matchModeOf(ev({ id: 1, status: "2H", ko: NOW }), NOW), "live");
  assert.equal(matchModeOf(ev({ id: 2, status: "FT", ko: NOW - H }), NOW), "result");
  assert.equal(matchModeOf(ev({ id: 3, status: "NS", ko: NOW + H }), NOW), "upcoming");
});

test("classify prefers live > upcoming > result", () => {
  const live = ev({ id: "L", status: "2H", ko: NOW - H });
  const up = ev({ id: "U", status: "NS", ko: NOW + 2 * H });
  const done = ev({ id: "D", status: "FT", hs: 2, as: 1, ko: NOW - 5 * H });

  assert.equal(classify([up, done, live], NOW).match.id, "L");
  assert.equal(classify([up, done], NOW).match.id, "U");
  assert.equal(classify([done], NOW).match.id, "D");
  assert.equal(classify([], NOW).mode, "empty");
});

test("classify picks the soonest upcoming and the most recent result", () => {
  const soon = ev({ id: "soon", status: "NS", ko: NOW + H });
  const later = ev({ id: "later", status: "NS", ko: NOW + 5 * H });
  assert.equal(classify([later, soon], NOW).match.id, "soon");

  const old = ev({ id: "old", status: "FT", hs: 1, as: 0, ko: NOW - 10 * H });
  const recent = ev({ id: "recent", status: "FT", hs: 0, as: 0, ko: NOW - 2 * H });
  assert.equal(classify([old, recent], NOW).match.id, "recent");
});

test("buildDeck sorts chronologically, tags modes, points to the primary", () => {
  const live = ev({ id: "L", status: "2H", ko: NOW - H });
  const up = ev({ id: "U", status: "NS", ko: NOW + 2 * H });
  const done = ev({ id: "D", status: "FT", hs: 2, as: 1, ko: NOW - 5 * H });
  const noKo = ev({ id: "X", status: "NS", ko: null });

  const { matches, primaryIndex } = buildDeck([up, noKo, done, live], NOW);

  assert.deepEqual(matches.map((m) => m.id), ["D", "L", "U"]); // sorted, noKo dropped
  assert.deepEqual(matches.map((m) => m.matchMode), ["result", "live", "upcoming"]);
  assert.equal(matches[primaryIndex].id, "L"); // primary is the live match
});
