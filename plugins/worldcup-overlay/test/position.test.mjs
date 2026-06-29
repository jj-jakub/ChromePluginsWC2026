import test from "node:test";
import assert from "node:assert/strict";

globalThis.self = globalThis;
await import(new URL("../src/position.js", import.meta.url));
const { nearestCorner, clampToViewport, resizeVector, scaleFromDrag } = globalThis.WC.position;

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

test("resizeVector points from each anchor corner toward its free (opposite) corner", () => {
  assert.deepEqual(resizeVector("tl"), { signX: 1, signY: 1 }); // free corner is bottom-right
  assert.deepEqual(resizeVector("tr"), { signX: -1, signY: 1 }); // bottom-left
  assert.deepEqual(resizeVector("bl"), { signX: 1, signY: -1 }); // top-right
  assert.deepEqual(resizeVector("br"), { signX: -1, signY: -1 }); // top-left
});

test("scaleFromDrag yields 1 when the pointer sits on the unscaled free corner", () => {
  // anchor at origin, 200x100 card, free corner toward +x/+y. Pointer exactly on the base corner.
  const s = scaleFromDrag({ anchorX: 0, anchorY: 0, pointerX: 200, pointerY: 100, baseW: 200, baseH: 100, signX: 1, signY: 1, min: 0.8, max: 2 });
  assert.ok(Math.abs(s - 1) < 1e-9, `expected ~1, got ${s}`);
});

test("scaleFromDrag scales with the pointer's distance along the diagonal", () => {
  const base = { anchorX: 0, anchorY: 0, baseW: 200, baseH: 100, signX: 1, signY: 1, min: 0.8, max: 2 };
  // twice as far out -> ~2x (then clamped at max=2)
  assert.ok(Math.abs(scaleFromDrag({ ...base, pointerX: 400, pointerY: 200 }) - 2) < 1e-9);
  // halfway in -> ~0.5, clamped up to the 0.8 minimum
  assert.equal(scaleFromDrag({ ...base, pointerX: 100, pointerY: 50 }), 0.8);
});

test("scaleFromDrag honors a top-right anchor (free corner to the lower-left)", () => {
  // anchor at viewport (500,0); dragging the grip down-left (toward 300,100) enlarges it.
  const v = resizeVector("tr");
  const s = scaleFromDrag({ anchorX: 500, anchorY: 0, pointerX: 300, pointerY: 100, baseW: 200, baseH: 100, signX: v.signX, signY: v.signY, min: 0.8, max: 2 });
  assert.ok(Math.abs(s - 1) < 1e-9, `expected ~1, got ${s}`);
});

test("scaleFromDrag honors a bottom-right anchor (free corner up-left, signY=-1)", () => {
  // anchor at viewport (500,400); dragging the grip up-left (toward 300,300) sits on the base corner.
  const v = resizeVector("br");
  const s = scaleFromDrag({ anchorX: 500, anchorY: 400, pointerX: 300, pointerY: 300, baseW: 200, baseH: 100, signX: v.signX, signY: v.signY, min: 0.8, max: 2 });
  assert.ok(Math.abs(s - 1) < 1e-9, `expected ~1, got ${s}`);
});

test("scaleFromDrag clamps a far-out drag down to max", () => {
  // pointer 3x past the base corner would imply ~3.0; max=2 must pull it down.
  const s = scaleFromDrag({ anchorX: 0, anchorY: 0, pointerX: 600, pointerY: 300, baseW: 200, baseH: 100, signX: 1, signY: 1, min: 0.8, max: 2 });
  assert.equal(s, 2);
});

test("scaleFromDrag never returns NaN on degenerate input", () => {
  const s = scaleFromDrag({ anchorX: 0, anchorY: 0, pointerX: 10, pointerY: 10, baseW: 0, baseH: 0, signX: 1, signY: 1, min: 0.8, max: 2 });
  assert.ok(Number.isFinite(s));
});
