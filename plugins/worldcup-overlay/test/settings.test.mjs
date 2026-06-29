import test from "node:test";
import assert from "node:assert/strict";

// settings.js is a classic content-script attaching to self.WC. Shim self, then load it.
globalThis.self = globalThis;
await import(new URL("../src/settings.js", import.meta.url));
const { DEFAULTS, normalize, REFRESH_MIN, REFRESH_MAX, SCALE_MIN, SCALE_MAX } = globalThis.WC.settings;

test("normalize(undefined/garbage) returns the full defaults", () => {
  assert.deepEqual(normalize(undefined), DEFAULTS);
  assert.deepEqual(normalize(null), DEFAULTS);
  assert.deepEqual(normalize("nonsense"), DEFAULTS);
  assert.deepEqual(normalize(42), DEFAULTS);
});

test("normalize clamps the refresh interval into range", () => {
  assert.equal(normalize({ refreshMins: 0 }).refreshMins, REFRESH_MIN);
  assert.equal(normalize({ refreshMins: -100 }).refreshMins, REFRESH_MIN);
  assert.equal(normalize({ refreshMins: 999 }).refreshMins, REFRESH_MAX);
  assert.equal(normalize({ refreshMins: "7" }).refreshMins, 7); // numeric strings coerce
  assert.equal(normalize({ refreshMins: "abc" }).refreshMins, DEFAULTS.refreshMins); // NaN -> default
});

test("normalize maps an invalid corner/theme back to the default", () => {
  assert.equal(normalize({ corner: "middle" }).corner, DEFAULTS.corner);
  assert.equal(normalize({ corner: "bl" }).corner, "bl");
  assert.equal(normalize({ theme: "neon" }).theme, DEFAULTS.theme);
  assert.equal(normalize({ theme: "dark" }).theme, "dark");
});

test("normalize merges a partial object onto the defaults", () => {
  const out = normalize({ corner: "bl", startMinimized: true });
  assert.equal(out.corner, "bl");
  assert.equal(out.startMinimized, true);
  assert.equal(out.refreshMins, DEFAULTS.refreshMins); // untouched field keeps default
  assert.equal(out.theme, DEFAULTS.theme);
});

test("normalize drops unknown keys", () => {
  const out = normalize({ corner: "tr", hackerField: "x", __proto__pollution: 1 });
  assert.equal("hackerField" in out, false);
  assert.equal("__proto__pollution" in out, false);
  assert.deepEqual(Object.keys(out).sort(), Object.keys(DEFAULTS).sort());
});

test("normalize cleans the favorites / site-rules lists (trim, drop blanks, de-dupe)", () => {
  const out = normalize({
    favorites: ["Brazil", " Brazil ", "", "  ", "England", 7, null],
    siteRules: [" example.com ", "example.com", ".bank.com"],
  });
  assert.deepEqual(out.favorites, ["Brazil", "England"]);
  assert.deepEqual(out.siteRules, ["example.com", ".bank.com"]);
});

test("normalize deep-merges the notify sub-object", () => {
  const out = normalize({ notify: { enabled: true, leadMins: 999 } });
  assert.equal(out.notify.enabled, true);
  assert.equal(out.notify.leadMins, 120); // clamped to LEAD_MAX
  assert.equal(out.notify.kickoff, DEFAULTS.notify.kickoff); // untouched sub-field default
});

test("normalize clamps + rounds the widget scale", () => {
  assert.equal(normalize({}).scale, DEFAULTS.scale); // 1 by default
  assert.equal(normalize({ scale: 0.1 }).scale, SCALE_MIN); // below min
  assert.equal(normalize({ scale: 9 }).scale, SCALE_MAX); // above max
  assert.equal(normalize({ scale: 1.337 }).scale, 1.34); // rounded to 2dp
  assert.equal(normalize({ scale: "1.5" }).scale, 1.5); // numeric string coerces
  assert.equal(normalize({ scale: "huge" }).scale, DEFAULTS.scale); // NaN -> default
  const rounded = normalize({ scale: 1.337 });
  assert.equal(rounded.scale, 1.34); // rounds to 2dp
  assert.equal(normalize(rounded).scale, 1.34); // and re-normalizing the rounded value is stable
  assert.ok(SCALE_MIN < SCALE_MAX);
});

test("normalize is idempotent", () => {
  const messy = { corner: "br", refreshMins: 500, favorites: [" Spain ", "Spain"], junk: 1 };
  const once = normalize(messy);
  assert.deepEqual(normalize(once), once);
});
