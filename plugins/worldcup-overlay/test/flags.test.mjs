import test from "node:test";
import assert from "node:assert/strict";

// flags.js is a classic content-script that attaches to `self.WC`. Shim `self` to the global,
// then load it so we can exercise WC.flag in node.
globalThis.self = globalThis;
await import(new URL("../src/flags.js", import.meta.url));
const flag = globalThis.WC.flag;

test("maps common nations to emoji flags", () => {
  assert.equal(flag("Switzerland"), "🇨🇭");
  assert.equal(flag("Canada"), "🇨🇦");
  assert.equal(flag("Belgium"), "🇧🇪");
});

test("handles aliases and accents", () => {
  assert.equal(flag("USA"), flag("United States"));
  assert.equal(flag("Côte d'Ivoire"), flag("Ivory Coast"));
  assert.equal(flag("Türkiye"), flag("Turkey"));
  assert.equal(flag("Curaçao"), "🇨🇼");
  assert.equal(flag("DR Congo"), "🇨🇩");
});

test("UK subdivisions use tag-sequence flags and differ", () => {
  assert.ok(flag("England").startsWith("🏴"));
  assert.ok(flag("Scotland").startsWith("🏴"));
  assert.notEqual(flag("Scotland"), flag("Wales"));
});

test("unknown names return an empty string", () => {
  assert.equal(flag("Atlantis"), "");
  assert.equal(flag(""), "");
  assert.equal(flag(null), "");
});
