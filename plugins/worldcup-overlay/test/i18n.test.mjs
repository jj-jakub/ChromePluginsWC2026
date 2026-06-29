import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.self = globalThis;
await import(new URL("../src/i18n.js", import.meta.url));
const { t } = globalThis.WC;

const read = (loc) => JSON.parse(readFileSync(new URL(`../_locales/${loc}/messages.json`, import.meta.url)));
const en = read("en");

// Every message key the UI references through t(...) (keep in sync with render.js).
const USED = [
  "extName", "extDescription",
  "statusLive", "statusUpNext", "statusFullTime",
  "titleRefresh", "titleMinimize", "titleAllFixtures", "titleShowMatch", "titleGroupTable",
  "titleFavoritesOnly", "titleShowAll", "titleExpand", "titleAddToCalendar", "labelCalendar",
  "titleEarlierMatch", "titleLaterMatch", "titleJumpToCurrent", "titleShowThisMatch",
  "ariaToggleFixtures", "ariaToggleTable", "ariaToggleFavorites", "followTeam", "unfollowTeam",
  "yourNext", "footUpdated", "footOffline",
  "emptyNoMatches", "emptyNoFavorites", "emptyError", "emptyNoSchedule", "emptyNoTable",
  "loadingTable", "partialTable", "healthDelayed", "healthDown",
];

test("t() returns the English fallback when chrome.i18n is absent (node)", () => {
  assert.equal(t("statusLive", "Live"), "Live");
  assert.equal(t("missingKey", "Fallback"), "Fallback");
  assert.equal(t("missingKey"), "missingKey"); // no fallback -> the key itself
});

test("en/messages.json defines every key the UI uses (and each has a non-empty message)", () => {
  for (const k of USED) {
    assert.ok(en[k] && typeof en[k].message === "string" && en[k].message, `missing en key: ${k}`);
  }
});

test("other locales only define keys that exist in en (no orphans, so fallback works)", () => {
  for (const loc of ["es", "fr", "de", "pt"]) {
    const m = read(loc);
    assert.ok(m.extName && m.extDescription, `${loc} should localize the store name/description`);
    for (const k of Object.keys(m)) assert.ok(en[k], `${loc} has an orphan key not in en: ${k}`);
  }
});
