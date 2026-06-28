#!/usr/bin/env node
// Manifest validator (dev-only; no runtime dependency for the shipped extension).
//
// Pure core: validateManifest(manifest, fileExists) returns { ok, errors } — `fileExists(relPath)`
// is injected so it's unit-testable without touching disk. A thin CLI wraps it for CI:
//   node scripts/validate-manifest.mjs <plugin-dir|path/to/manifest.json>

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

// Chrome accepts 1–4 dot-separated integers for "version".
const VERSION_RE = /^\d+(\.\d+){0,3}$/;

/** Collect every packaged file path the manifest references (relative to the manifest dir).
 *  Defensive: never throws on a malformed shape (the validator reports those separately). */
export function collectReferencedFiles(m) {
  const out = new Set();
  const arr = (v) => (Array.isArray(v) ? v : []);
  const addIcons = (icons) => {
    if (icons && typeof icons === "object") for (const k of Object.keys(icons)) out.add(icons[k]);
  };
  addIcons(m.icons);
  if (m.action) {
    addIcons(m.action.default_icon);
    if (m.action.default_popup) out.add(m.action.default_popup);
  }
  if (m.options_ui && m.options_ui.page) out.add(m.options_ui.page);
  if (m.background && m.background.service_worker) out.add(m.background.service_worker);
  for (const cs of arr(m.content_scripts)) {
    arr(cs.js).forEach((f) => out.add(f));
    arr(cs.css).forEach((f) => out.add(f));
  }
  for (const w of arr(m.web_accessible_resources)) {
    if (w && typeof w === "object") arr(w.resources).forEach((f) => out.add(f));
  }
  if (m.default_locale) out.add(`_locales/${m.default_locale}/messages.json`);
  return [...out];
}

/**
 * @param {object} m manifest object
 * @param {(relPath: string) => boolean} fileExists predicate over packaged files
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateManifest(m, fileExists) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  if (!m || typeof m !== "object") return { ok: false, errors: ["manifest is not an object"] };

  if (m.manifest_version !== 3) err(`manifest_version must be 3 (got ${JSON.stringify(m.manifest_version)})`);
  if (typeof m.name !== "string" || !m.name.trim()) err("name is required");
  if (typeof m.version !== "string" || !VERSION_RE.test(m.version)) {
    err(`version must be 1–4 dot-separated integers (got ${JSON.stringify(m.version)})`);
  }
  if (typeof m.description !== "string" || !m.description.trim()) err("description is required");

  for (const f of collectReferencedFiles(m)) {
    if (!fileExists(f)) err(`referenced file not found: ${f}`);
  }

  if (m.web_accessible_resources !== undefined) {
    if (!Array.isArray(m.web_accessible_resources)) {
      err("web_accessible_resources must be an array (MV3)");
    } else {
      m.web_accessible_resources.forEach((w, i) => {
        if (!w || typeof w !== "object") return err(`web_accessible_resources[${i}] must be an object`);
        if (!Array.isArray(w.resources)) err(`web_accessible_resources[${i}].resources must be an array`);
        if (!Array.isArray(w.matches)) err(`web_accessible_resources[${i}].matches must be an array`);
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

function cli() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: validate-manifest.mjs <plugin-dir|path/to/manifest.json>");
    process.exit(2);
  }
  const manifestPath = arg.endsWith(".json") ? resolve(arg) : resolve(arg, "manifest.json");
  const base = dirname(manifestPath);
  let m;
  try {
    m = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    console.error(`✗ cannot read/parse ${manifestPath}: ${e.message}`);
    process.exit(1);
  }
  const { ok, errors } = validateManifest(m, (rel) => existsSync(join(base, rel)));
  if (ok) {
    console.log(`✓ ${manifestPath} is valid`);
    process.exit(0);
  }
  console.error(`✗ ${manifestPath}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// Run the CLI only when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) cli();
