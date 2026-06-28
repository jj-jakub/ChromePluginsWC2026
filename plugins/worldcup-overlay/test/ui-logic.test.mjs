import test from "node:test";
import assert from "node:assert/strict";

globalThis.self = globalThis;
await import(new URL("../src/ui-logic.js", import.meta.url));
const { resolveTheme } = globalThis.WC.ui;

test("resolveTheme honors explicit light/dark and follows the system for auto", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("auto", false), "light");
});
