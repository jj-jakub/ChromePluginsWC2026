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

test("teamRow renders a follow star, filled when favorite", () => {
  const off = teamRow("Brazil", 1, false, false);
  assert.match(off, /class="wc-star"/);
  assert.doesNotMatch(off, /wc-star on/);
  const on = teamRow("Brazil", 1, false, true);
  assert.match(on, /class="wc-star on"/);
  assert.match(on, /aria-pressed="true"/);
});

test("card stars the favorite side and shows the favorites filter when canFilter", () => {
  const deck = [
    { id: "a", home: "Brazil", away: "Norway", matchMode: "upcoming", kickoffMs: NOW + H, isFavorite: true },
  ];
  const html = card({ deck, cursor: 0, favorites: ["Brazil"], canFilter: true, icon: "i.png" }, NOW);
  assert.match(html, /wc-favfilter/);
  assert.match(html, /class="wc-star on" data-team="Brazil"/);
  assert.match(html, /class="wc-star" data-team="Norway"/);
});

test("card omits the favorites filter when canFilter is false", () => {
  const deck = [{ id: "a", home: "Brazil", away: "Norway", matchMode: "upcoming", kickoffMs: NOW + H }];
  assert.doesNotMatch(card({ deck, cursor: 0, icon: "i.png" }, NOW), /wc-favfilter/);
});

test("card shows a 'Your next' line for an upcoming favorite", () => {
  const deck = [
    { id: "a", home: "Brazil", away: "Norway", matchMode: "upcoming", kickoffMs: NOW + 2 * H, isFavorite: true },
  ];
  const html = card({ deck, cursor: 0, favorites: ["Brazil"], icon: "i.png" }, NOW);
  assert.match(html, /wc-yournext/);
  assert.match(html, /Your next:/);
  assert.match(html, /Brazil v Norway/);
});

test("card with favFilter on and an empty filtered deck shows favorites empty copy", () => {
  const html = card({ deck: [], favFilter: true, canFilter: true, icon: "i.png" }, NOW);
  assert.match(html, /No favorite matches/);
});

test("matchBody renders a recent-form strip when form data is attached", () => {
  const mm = {
    id: "1", home: "Brazil", away: "Norway", homeScore: 2, awayScore: 1,
    matchMode: "result", kickoffMs: NOW - H,
    homeForm: { last: ["W", "W", "D"] }, awayForm: { last: ["L", "D"] },
  };
  const html = matchBody(mm, NOW, []);
  assert.match(html, /wc-form/);
  assert.match(html, /wc-chip wc-chip-w/);
  assert.match(html, /wc-chip wc-chip-l/);
});

test("matchBody omits the form strip when there's no form data", () => {
  const html = matchBody(m({ matchMode: "upcoming", ko: NOW + H }), NOW, []);
  assert.doesNotMatch(html, /wc-form/);
});

test("card in table mode renders the standings and hides the match nav", () => {
  const standings = {
    group: "Group A",
    rows: [
      { team: "Brazil", played: 3, win: 3, draw: 0, loss: 0, gf: 7, ga: 1, gd: 6, points: 9, qualifying: true },
      { team: "Spain", played: 3, win: 2, draw: 0, loss: 1, gf: 4, ga: 2, gd: 2, points: 6, qualifying: true },
      { team: "Norway", played: 3, win: 1, draw: 0, loss: 2, gf: 2, ga: 4, gd: -2, points: 3, qualifying: false },
      { team: "Peru", played: 3, win: 0, draw: 0, loss: 3, gf: 0, ga: 6, gd: -6, points: 0, qualifying: false },
    ],
    partial: false,
  };
  const html = card({ mode: "table", standings, canTable: true, icon: "i.png" }, NOW);
  assert.match(html, /wc-table/);
  assert.match(html, /Group A/);
  assert.match(html, /Brazil/);
  assert.match(html, /wc-trow q/); // qualifying rows highlighted
  assert.match(html, /wc-tabletoggle on/);
  assert.doesNotMatch(html, /wc-nav/); // no match-rotation nav in table mode
});

test("card table mode shows loading and a partial note", () => {
  assert.match(
    card({ mode: "table", standings: { group: "Group A", loading: true }, canTable: true, icon: "i" }, NOW),
    /Loading group table/
  );
  const partial = card(
    {
      mode: "table",
      standings: { group: "Group A", rows: [{ team: "A", played: 1, win: 1, draw: 0, loss: 0, gf: 1, ga: 0, gd: 1, points: 3, qualifying: true }], partial: true },
      canTable: true,
      icon: "i",
    },
    NOW
  );
  assert.match(partial, /Partial table/);
});

test("card shows the table toggle only when canTable", () => {
  assert.match(card({ deck: [m({ matchMode: "live" })], cursor: 0, canTable: true, icon: "i" }, NOW), /wc-tabletoggle/);
  assert.doesNotMatch(card({ deck: [m({ matchMode: "live" })], cursor: 0, icon: "i" }, NOW), /wc-tabletoggle/);
});

test("mini shows the live indicator only when a live match is in the deck", () => {
  assert.match(mini({ deck: [m({ matchMode: "live" })], icon: "i.png" }), /wc-mini-live/);
  assert.doesNotMatch(mini({ deck: [m({ matchMode: "upcoming" })], icon: "i.png" }), /wc-mini-live/);
});
