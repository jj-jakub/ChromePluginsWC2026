import test from "node:test";
import assert from "node:assert/strict";
import { notificationsFor } from "../src/notify.js";

const NOW = 1_000_000_000_000;
const prefs = { enabled: true, kickoff: true, goals: true, fullTime: true, leadMins: 15, favoritesOnly: false };

test("returns nothing when notifications are disabled", () => {
  const deck = [{ id: "1", matchMode: "live", home: "A", away: "B", homeScore: 1, awayScore: 0 }];
  assert.deepEqual(notificationsFor(deck, NOW, [], { ...prefs, enabled: false }), []);
});

test("kickoff-imminent fires only inside the lead window", () => {
  const inWindow = [{ id: "1", matchMode: "upcoming", home: "A", away: "B", kickoffMs: NOW + 10 * 60000 }];
  const outWindow = [{ id: "2", matchMode: "upcoming", home: "A", away: "B", kickoffMs: NOW + 60 * 60000 }];
  assert.ok(notificationsFor(inWindow, NOW, [], prefs).some((n) => n.tag === "ko-1"));
  assert.equal(notificationsFor(outWindow, NOW, [], prefs).length, 0);
});

test("went-live + score (score-stamped tag) + full-time fire", () => {
  const live = [{ id: "1", matchMode: "live", home: "A", away: "B", homeScore: 2, awayScore: 1 }];
  const liveTags = notificationsFor(live, NOW, [], prefs).map((n) => n.tag);
  assert.ok(liveTags.includes("live-1"));
  assert.ok(liveTags.includes("score-1-2-1"));

  const ft = [{ id: "1", matchMode: "result", home: "A", away: "B", homeScore: 2, awayScore: 1 }];
  assert.ok(notificationsFor(ft, NOW, [], prefs).some((n) => n.tag === "ft-1"));
});

test("recentMs gates live/score/full-time to recently-kicked-off matches (no stale burst)", () => {
  const fresh = { id: "1", matchMode: "result", home: "A", away: "B", homeScore: 1, awayScore: 0, kickoffMs: NOW - 60 * 60000 }; // 1h ago
  const stale = { id: "2", matchMode: "result", home: "C", away: "D", homeScore: 1, awayScore: 0, kickoffMs: NOW - 30 * 60 * 60000 }; // 30h ago
  const tags = notificationsFor([fresh, stale], NOW, [], prefs, { recentMs: 3 * 60 * 60000 }).map((n) => n.tag);
  assert.ok(tags.includes("ft-1"));
  assert.ok(!tags.includes("ft-2"));
});

test("extraLeadMs widens the kickoff window by the refresh cadence", () => {
  const m = { id: "1", matchMode: "upcoming", home: "A", away: "B", kickoffMs: NOW + 20 * 60000 }; // 20m out
  const p = { ...prefs, leadMins: 15 };
  assert.equal(notificationsFor([m], NOW, [], p).some((n) => n.tag === "ko-1"), false); // 20m > 15m lead
  assert.equal(notificationsFor([m], NOW, [], p, { extraLeadMs: 10 * 60000 }).some((n) => n.tag === "ko-1"), true); // window now 25m
});

test("favorites-only filters to followed nations", () => {
  const deck = [
    { id: "1", matchMode: "live", home: "Brazil", away: "Norway", homeScore: 1, awayScore: 0 },
    { id: "2", matchMode: "live", home: "Spain", away: "Italy", homeScore: 0, awayScore: 0 },
  ];
  const tags = notificationsFor(deck, NOW, ["Brazil"], { ...prefs, favoritesOnly: true }).map((n) => n.tag);
  assert.ok(tags.some((t) => t.endsWith("-1") || t.includes("-1-")));
  assert.ok(!tags.some((t) => t.endsWith("-2") || t.includes("-2-")));
});
