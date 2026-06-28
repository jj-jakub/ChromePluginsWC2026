import test from "node:test";
import assert from "node:assert/strict";
import {
  phaseOf,
  isLiveNow,
  matchModeOf,
  classify,
  buildDeck,
  teamIsFavorite,
  matchHasFavorite,
  applyFavorites,
  nextFavoriteFixture,
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

test("teamIsFavorite matches case-insensitively and trims; empty/null favorites are false", () => {
  assert.equal(teamIsFavorite("Brazil", ["brazil"]), true);
  assert.equal(teamIsFavorite("brazil", [" Brazil "]), true);
  assert.equal(teamIsFavorite("Brazil", ["Norway"]), false);
  assert.equal(teamIsFavorite("Brazil", []), false);
  assert.equal(teamIsFavorite("Brazil", null), false);
});

test("matchHasFavorite checks both sides", () => {
  const m = { home: "Brazil", away: "Norway" };
  assert.equal(matchHasFavorite(m, ["Norway"]), true);
  assert.equal(matchHasFavorite(m, ["Brazil"]), true);
  assert.equal(matchHasFavorite(m, ["Spain"]), false);
});

test("applyFavorites tags isFavorite and re-ranks to the favorite's match", () => {
  const live = ev({ id: "L", status: "2H", ko: NOW - H, home: "Spain", away: "Italy" });
  const up = ev({ id: "U", status: "NS", ko: NOW + 2 * H, home: "Brazil", away: "Norway" });
  const done = ev({ id: "D", status: "FT", hs: 2, as: 1, ko: NOW - 5 * H, home: "France", away: "Peru" });
  const { matches, primaryIndex } = buildDeck([up, done, live], NOW);
  assert.equal(matches[primaryIndex].id, "L"); // base primary is the live (Spain) match

  const out = applyFavorites(matches, NOW, ["Brazil"], primaryIndex);
  assert.equal(out.matches[out.index].id, "U"); // re-ranked to Brazil's upcoming match
  assert.equal(out.matches.find((m) => m.id === "U").isFavorite, true);
  assert.equal(out.matches.find((m) => m.id === "L").isFavorite, false);
});

test("applyFavorites prefers a live favorite over an upcoming favorite", () => {
  const liveFav = ev({ id: "LF", status: "2H", ko: NOW - H, home: "Brazil", away: "Italy" });
  const upFav = ev({ id: "UF", status: "NS", ko: NOW + 2 * H, home: "Brazil", away: "Norway" });
  const { matches, primaryIndex } = buildDeck([upFav, liveFav], NOW);
  const out = applyFavorites(matches, NOW, ["Brazil"], primaryIndex);
  assert.equal(out.matches[out.index].id, "LF");
});

test("applyFavorites falls back to the base index when no favorite is in the deck", () => {
  const live = ev({ id: "L", status: "2H", ko: NOW - H, home: "Spain", away: "Italy" });
  const up = ev({ id: "U", status: "NS", ko: NOW + 2 * H, home: "Brazil", away: "Norway" });
  const { matches, primaryIndex } = buildDeck([up, live], NOW);
  const out = applyFavorites(matches, NOW, ["Germany"], primaryIndex);
  assert.equal(out.index, primaryIndex);
  assert.equal(out.matches.every((m) => m.isFavorite === false), true);
});

test("nextFavoriteFixture returns the soonest favorite, live before upcoming", () => {
  const live = ev({ id: "L", status: "2H", ko: NOW - H, home: "Brazil", away: "Italy" });
  const soon = ev({ id: "S", status: "NS", ko: NOW + H, home: "Brazil", away: "Spain" });
  const { matches } = buildDeck([soon, live], NOW);
  assert.equal(nextFavoriteFixture(matches, NOW, ["Brazil"]).id, "L");
  assert.equal(nextFavoriteFixture(matches, NOW, ["Germany"]), null);
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
