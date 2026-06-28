import test from "node:test";
import assert from "node:assert/strict";

globalThis.self = globalThis;
await import(new URL("../src/keymap.js", import.meta.url));
const { keyToAction } = globalThis.WC.keymap;

test("arrows rotate (swapped under RTL), Esc minimizes, R refreshes", () => {
  assert.equal(keyToAction("ArrowLeft", {}), "earlier");
  assert.equal(keyToAction("ArrowRight", {}), "later");
  assert.equal(keyToAction("ArrowLeft", { isRtl: true }), "later");
  assert.equal(keyToAction("ArrowRight", { isRtl: true }), "earlier");
  assert.equal(keyToAction("Escape", {}), "minimize");
  assert.equal(keyToAction("r", {}), "refresh");
  assert.equal(keyToAction("R", {}), "refresh");
});

test("when minimized, only Enter/Space expand", () => {
  assert.equal(keyToAction("Enter", { minimized: true }), "expand");
  assert.equal(keyToAction(" ", { minimized: true }), "expand");
  assert.equal(keyToAction("ArrowLeft", { minimized: true }), null);
  assert.equal(keyToAction("Escape", { minimized: true }), null);
});

test("unhandled keys return null", () => {
  assert.equal(keyToAction("a", {}), null);
  assert.equal(keyToAction("Tab", {}), null);
  assert.equal(keyToAction("", {}), null);
  assert.equal(keyToAction(undefined, {}), null);
});
