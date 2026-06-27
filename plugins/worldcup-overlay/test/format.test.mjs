import test from "node:test";
import assert from "node:assert/strict";

// format.js is a classic content-script that attaches to `self.WC`. Shim `self`, then load it.
globalThis.self = globalThis;
await import(new URL("../src/format.js", import.meta.url));
const { esc, until, ago, dayLabel } = globalThis.WC.fmt;

test("esc escapes HTML-significant characters", () => {
  assert.equal(esc(`<a href="x">A&B's</a>`), "&lt;a href=&quot;x&quot;&gt;A&amp;B&#39;s&lt;/a&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(0), "0");
});

test("until renders a future countdown", () => {
  const now = 1_000_000_000_000;
  assert.equal(until(now + (2 * 3600 + 5 * 60) * 1000, now), "in 2h 5m");
  assert.equal(until(now + 30 * 60000, now), "in 30m");
  assert.equal(until(now, now), "kicking off");
});

test("ago renders elapsed time", () => {
  const now = 1_000_000_000_000;
  assert.equal(ago(now - 30 * 1000, now), "just now");
  assert.equal(ago(now - 5 * 60000, now), "5m ago");
  assert.equal(ago(now - 3 * 3600000, now), "3h ago");
  assert.equal(ago(now - 2 * 86400000, now), "2d ago");
});

test("dayLabel names days relative to now", () => {
  const noon = new Date(2026, 5, 27, 12, 0, 0).getTime(); // local noon, DST-safe
  assert.equal(dayLabel(noon, noon), "Today");
  assert.equal(dayLabel(noon + 86400000, noon), "Tomorrow");
  assert.equal(dayLabel(noon - 86400000, noon), "Yesterday");
});
