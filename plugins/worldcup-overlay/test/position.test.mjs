import test from "node:test";
import assert from "node:assert/strict";

globalThis.self = globalThis;
await import(new URL("../src/position.js", import.meta.url));
const { nearestCorner, clampToViewport } = globalThis.WC.position;

const vw = 1000;
const vh = 800;
const w = 200;
const h = 100;

test("nearestCorner picks the corner the box center is closest to", () => {
  assert.equal(nearestCorner({ x: 10, y: 10, w, h, vw, vh }), "tl");
  assert.equal(nearestCorner({ x: 790, y: 10, w, h, vw, vh }), "tr");
  assert.equal(nearestCorner({ x: 10, y: 690, w, h, vw, vh }), "bl");
  assert.equal(nearestCorner({ x: 790, y: 690, w, h, vw, vh }), "br");
  // exactly-centered box (center 500,400): the `< vw/2` / `< vh/2` tiebreak falls to bottom-right
  assert.equal(nearestCorner({ x: 400, y: 350, w, h, vw, vh }), "br");
});

test("clampToViewport keeps the box fully on-screen with a margin", () => {
  const m = 8;
  assert.deepEqual(clampToViewport({ x: -50, y: -50, w, h, vw, vh }, m), { x: 8, y: 8 });
  assert.deepEqual(clampToViewport({ x: 5000, y: 5000, w, h, vw, vh }, m), { x: vw - w - m, y: vh - h - m });
  assert.deepEqual(clampToViewport({ x: 100, y: 120, w, h, vw, vh }, m), { x: 100, y: 120 });
});
