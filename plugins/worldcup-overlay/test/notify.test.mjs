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

test("favorites-only filters to followed nations", () => {
  const deck = [
    { id: "1", matchMode: "live", home: "Brazil", away: "Norway", homeScore: 1, awayScore: 0 },
    { id: "2", matchMode: "live", home: "Spain", away: "Italy", homeScore: 0, awayScore: 0 },
  ];
  const tags = notificationsFor(deck, NOW, ["Brazil"], { ...prefs, favoritesOnly: true }).map((n) => n.tag);
  assert.ok(tags.some((t) => t.endsWith("-1") || t.includes("-1-")));
  assert.ok(!tags.some((t) => t.endsWith("-2") || t.includes("-2-")));
});
