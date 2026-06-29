import test from "node:test";
import assert from "node:assert/strict";

// pitch.js is a classic self.WC.* module — shim self, import, read the namespace.
globalThis.self = globalThis;
await import(new URL("../src/pitch.js", import.meta.url));
const { W, H, FORMATIONS, formationFor, parseFormation, layout, passPath, ballAt } = globalThis.WC.pitch;

const within = (p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

test("parseFormation accepts valid shapes that total ten outfield players", () => {
  assert.deepEqual(parseFormation("4-3-3"), [4, 3, 3]);
  assert.deepEqual(parseFormation("4-4-2"), [4, 4, 2]);
  assert.deepEqual(parseFormation("4-2-3-1"), [4, 2, 3, 1]);
  assert.deepEqual(parseFormation("3-5-2"), [3, 5, 2]);
});

test("parseFormation falls back to 4-3-3 on malformed / wrong-total input", () => {
  assert.deepEqual(parseFormation(""), [4, 3, 3]);
  assert.deepEqual(parseFormation(null), [4, 3, 3]);
  assert.deepEqual(parseFormation("4-4-4"), [4, 3, 3]); // totals 12, not 10
  assert.deepEqual(parseFormation("11"), [4, 3, 3]); // single row
  assert.deepEqual(parseFormation("abc"), [4, 3, 3]);
  assert.deepEqual(parseFormation("4-3-3-3-3-3"), [4, 3, 3]); // too many rows
  assert.deepEqual(parseFormation("0-7-3"), [4, 3, 3]); // a zero-count row
});

test("formationFor is deterministic and always a known formation", () => {
  for (const name of ["Brazil", "Norway", "Spain", "", "🇧🇷"]) {
    const f = formationFor(name);
    assert.ok(FORMATIONS.includes(f), `${name} -> ${f} should be a known formation`);
    assert.equal(formationFor(name), f); // stable across calls
  }
});

test("layout produces eleven players per side, each inside the pitch", () => {
  const lay = layout("4-3-3", "4-4-2");
  assert.equal(lay.home.length, 11);
  assert.equal(lay.away.length, 11);
  for (const p of [...lay.home, ...lay.away]) assert.ok(within(p), `player out of bounds: ${JSON.stringify(p)}`);
  // shirt numbers 1..11 per side
  assert.deepEqual(lay.home.map((p) => p.n).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test("layout keepers sit on their own goal line, mirrored", () => {
  const lay = layout("4-3-3", "4-3-3");
  const hgk = lay.home.find((p) => p.gk);
  const agk = lay.away.find((p) => p.gk);
  assert.ok(hgk.x < 10 && Math.abs(hgk.y - H / 2) < 0.01);
  assert.ok(agk.x > W - 10 && Math.abs(agk.y - H / 2) < 0.01);
  assert.ok(Math.abs(hgk.x - (W - agk.x)) < 0.01); // symmetric depth
});

test("layout keeps the two sides on their own halves", () => {
  const lay = layout("3-5-2", "4-2-3-1");
  assert.ok(lay.home.every((p) => p.x < 50), "home should stay left of halfway");
  assert.ok(lay.away.every((p) => p.x > 50), "away should stay right of halfway");
});

test("layout tolerates a garbage formation by falling back, never throwing", () => {
  const lay = layout("nonsense", undefined);
  assert.equal(lay.home.length, 11);
  assert.equal(lay.away.length, 11);
});

test("passPath returns in-bounds points starting at the home keeper", () => {
  const lay = layout("4-3-3", "4-3-3");
  const path = passPath(lay);
  assert.ok(path.length >= 4);
  for (const p of path) assert.ok(within(p), `path point out of bounds: ${JSON.stringify(p)}`);
  const hgk = lay.home.find((p) => p.gk);
  assert.deepEqual(path[0], { x: hgk.x, y: hgk.y });
});

test("ballAt sits on the first point at phase 0 and loops back at phase 1", () => {
  const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.deepEqual(ballAt(path, 0), { x: 0, y: 0 });
  assert.deepEqual(ballAt(path, 1), { x: 0, y: 0 }); // wraps (1 % 1 === 0)
});

test("ballAt interpolates linearly within a segment", () => {
  const path = [{ x: 0, y: 0 }, { x: 8, y: 0 }]; // 2 points -> 2 segments (cyclic)
  // phase 0.25 -> a quarter of the way through segment 0 (0..8)
  const p = ballAt(path, 0.25);
  assert.ok(Math.abs(p.x - 4) < 1e-9 && Math.abs(p.y) < 1e-9);
});

test("ballAt normalizes out-of-range and non-finite phases instead of NaN", () => {
  const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  assert.deepEqual(ballAt(path, 2), ballAt(path, 0)); // 2 % 1 === 0
  assert.deepEqual(ballAt(path, -1), ballAt(path, 0));
  const nan = ballAt(path, NaN);
  assert.ok(Number.isFinite(nan.x) && Number.isFinite(nan.y));
});

test("ballAt is defensive on empty / single-point paths", () => {
  const c = ballAt([], 0.5);
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
  assert.deepEqual(ballAt([{ x: 3, y: 4 }], 0.7), { x: 3, y: 4 });
});
