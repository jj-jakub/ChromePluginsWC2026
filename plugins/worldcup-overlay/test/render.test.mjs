import test from "node:test";
import assert from "node:assert/strict";

// render.js depends on self.WC.fmt (format.js) and self.WC.flag (flags.js). Shim self, load in order.
globalThis.self = globalThis;
await import(new URL("../src/format.js", import.meta.url));
await import(new URL("../src/flags.js", import.meta.url));
await import(new URL("../src/render.js", import.meta.url));
const { card, mini, matchBody, teamRow } = globalThis.WC.render;

const NOW = Date.UTC(2026, 5, 27, 12, 0, 0);
const H = 3600000;

const m = (o) => ({
  id: o.id || "1",
  home: o.home || "Brazil",
  away: o.away || "Norway",
  homeScore: o.hs ?? null,
  awayScore: o.as ?? null,
  status: o.status || "",
  progress: o.progress || "",
  venue: o.venue || "",
  matchMode: o.matchMode,
  kickoffMs: o.ko ?? NOW,
});

test("matchBody renders a live match with the live pill and both scores", () => {
  const html = matchBody(m({ matchMode: "live", hs: 1, as: 0, progress: "2H 67'" }), NOW);
  assert.match(html, /wc-status live/);
  assert.match(html, /wc-live-dot/);
  assert.match(html, /Brazil/);
  assert.match(html, /Norway/);
  assert.match(html, /2H 67/);
});

test("matchBody renders an upcoming match with countdown, no scores", () => {
  const html = matchBody(m({ matchMode: "upcoming", ko: NOW + 2 * H }), NOW);
  assert.match(html, /Up next/);
  assert.match(html, /in 2h 0m/);
  assert.doesNotMatch(html, /wc-score">\d/); // no numeric score shown
});

test("matchBody marks the winner of a finished result", () => {
  const html = matchBody(m({ matchMode: "result", hs: 3, as: 1, ko: NOW - 3 * H }), NOW);
  assert.match(html, /Full time/);
  // the home team row carries the win class
  assert.match(html, /wc-team win[^]*Brazil/);
});

test("teamRow escapes hostile team names (XSS-safe interpolation)", () => {
  const html = teamRow('<img src=x onerror=alert(1)>', 2, false);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("card shows the empty state when the deck is empty", () => {
  const html = card({ deck: [], icon: "i.png" }, NOW);
  assert.match(html, /No World Cup matches/);
  assert.doesNotMatch(html, /wc-nav/);
});

test("card shows the error state on loadError", () => {
  const html = card({ deck: [], loadError: true, icon: "i.png" }, NOW);
  assert.match(html, /Couldn't load/);
});

test("card renders nav arrows + counter only when the deck has >1 match", () => {
  const one = card({ deck: [m({ matchMode: "live" })], cursor: 0, icon: "i.png" }, NOW);
  assert.doesNotMatch(one, /wc-nav/);

  const two = card(
    { deck: [m({ id: "a", matchMode: "result", ko: NOW - H }), m({ id: "b", matchMode: "upcoming", ko: NOW + H })], cursor: 0, icon: "i.png" },
    NOW
  );
  assert.match(two, /wc-nav/);
  assert.match(two, /1 \/ 2/);
});

test("card clamps an out-of-range cursor instead of throwing", () => {
  const html = card({ deck: [m({ matchMode: "live" })], cursor: 99, icon: "i.png" }, NOW);
  assert.match(html, /Brazil/); // rendered match 0, no crash
});

test("card footer reflects fetchedAt and the offline flag", () => {
  const html = card({ deck: [m({ matchMode: "live" })], cursor: 0, fetchedAt: NOW - 60000, stale: true, icon: "i.png" }, NOW);
  assert.match(html, /Updated/);
  assert.match(html, /offline/);
  assert.match(html, /TheSportsDB/);
});

test("card shows a data-health banner when degraded/down, but not when ok", () => {
  const base = { deck: [m({ matchMode: "live" })], cursor: 0, icon: "i.png" };
  assert.doesNotMatch(card({ ...base, health: { status: "ok" } }, NOW), /wc-health/);

  const deg = card(
    { ...base, health: { status: "degraded", nextRetryAt: NOW + 4 * 60000, lastSuccessMs: NOW - 12 * 60000 } },
    NOW
  );
  assert.match(deg, /wc-health wc-health-degraded/);
  assert.match(deg, /Live data delayed/);
  assert.match(deg, /Retrying in 4m/);
  assert.match(deg, /Last update 12m ago/);

  const down = card({ ...base, health: { status: "down", nextRetryAt: NOW + 30000 } }, NOW);
  assert.match(down, /wc-health-down/);
  assert.match(down, /Can't reach live data/);
  assert.match(down, /Retrying shortly/); // sub-minute retry rounds to "shortly"
});

test("mini shows the live indicator only when a live match is in the deck", () => {
  assert.match(mini({ deck: [m({ matchMode: "live" })], icon: "i.png" }), /wc-mini-live/);
  assert.doesNotMatch(mini({ deck: [m({ matchMode: "upcoming" })], icon: "i.png" }), /wc-mini-live/);
});
