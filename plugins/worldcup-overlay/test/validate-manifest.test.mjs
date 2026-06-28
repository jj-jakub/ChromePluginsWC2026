import test from "node:test";
import assert from "node:assert/strict";
import { validateManifest, collectReferencedFiles } from "../../../scripts/validate-manifest.mjs";

const allExist = () => true;

const good = {
  manifest_version: 3,
  name: "World Cup Overlay",
  version: "0.2.0",
  description: "Shows the World Cup match in the corner.",
  icons: { 16: "icons/icon16.png" },
  action: { default_popup: "src/popup.html", default_icon: { 16: "icons/icon16.png" } },
  options_ui: { page: "src/options.html" },
  background: { service_worker: "src/service-worker.js", type: "module" },
  content_scripts: [{ matches: ["<all_urls>"], js: ["src/content.js"], css: ["src/content.css"] }],
  web_accessible_resources: [{ resources: ["icons/icon16.png"], matches: ["<all_urls>"] }],
};

test("a well-formed manifest passes", () => {
  const r = validateManifest(good, allExist);
  assert.equal(r.ok, true, r.errors.join("; "));
});

test("collectReferencedFiles gathers icons, sw, content scripts, pages, WAR", () => {
  const files = collectReferencedFiles(good);
  for (const f of ["icons/icon16.png", "src/popup.html", "src/options.html", "src/service-worker.js", "src/content.js", "src/content.css"]) {
    assert.ok(files.includes(f), `expected ${f}`);
  }
});

test("flags a wrong manifest_version", () => {
  assert.equal(validateManifest({ ...good, manifest_version: 2 }, allExist).ok, false);
});

test("flags a non-semver version, but accepts up to 4 parts", () => {
  assert.equal(validateManifest({ ...good, version: "v1" }, allExist).ok, false);
  assert.equal(validateManifest({ ...good, version: "1.2.3.4" }, allExist).ok, true);
});

test("flags missing required keys", () => {
  const { name, ...noName } = good;
  assert.equal(validateManifest(noName, allExist).ok, false);
  const { description, ...noDesc } = good;
  assert.equal(validateManifest(noDesc, allExist).ok, false);
});

test("flags a referenced-but-absent file", () => {
  const r = validateManifest(good, (f) => f !== "src/content.js");
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("src/content.js")));
});

test("flags malformed web_accessible_resources", () => {
  assert.equal(validateManifest({ ...good, web_accessible_resources: [{ resources: "nope" }] }, allExist).ok, false);
  assert.equal(validateManifest({ ...good, web_accessible_resources: {} }, allExist).ok, false);
});
