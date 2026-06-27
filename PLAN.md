# PLAN — next steps

Backlog for ChromePluginsWC2026. Roughly prioritized; nothing here is committed work.

## worldcup-overlay — polish
- [ ] **Settings / options page** — let the user pick corner (TL/TR/BL/BR), toggle auto-show
      per-site, set refresh interval, and choose a favorite team to pin. Persist in
      `chrome.storage.sync`.
- [ ] **Toolbar popup** — a click-the-icon popup as an alternative to the always-on overlay
      (some users won't want it on every page). Reuse the same render code.
- [ ] **Per-site allow/deny list** — don't inject on sites the user excludes.
- [ ] **Goal/kickoff notifications** — `chrome.notifications` when a tracked match starts or the
      score changes (needs the live-score upgrade below to be meaningful).
- [ ] **Knockout bracket view** — a second tab/mode once the group stage ends.
- [ ] **Windows flag fallback** — emoji flags render as 2-letter codes on Windows; optionally
      swap to small SVG/PNG flag assets bundled locally (still no network/CSP issues).

## Data
- [ ] **Live scores** — wire a patron TheSportsDB key + the v2 livescore endpoint in `api.js`
      (config already isolates the key). Replaces the kickoff-window heuristic for in-play.
- [ ] **Resilience** — exponential backoff on repeated fetch failures; surface a clearer
      "data provider down" state.
- [ ] **Cross-check a second source** (e.g. football-data.org) if TheSportsDB WC coverage gaps.

## Repo / tooling
- [ ] **CI** — GitHub Actions running `node --test` (+ manifest JSON validation) on push/PR.
- [ ] **Lint/format** — optional Prettier + ESLint config (keep it zero-runtime-dependency for
      the extensions themselves; dev-only).
- [ ] **Shared utilities** — if a second plugin needs the same helpers, extract a `shared/`
      with a documented copy-or-symlink convention (no cross-plugin runtime imports).
- [ ] **Screenshots in CI** — headless render of the overlay states for the README (was blocked
      locally by the port-8787 conflict).

## New plugins (ideas)
- [ ] Pick the next plugin idea and scaffold from `plugins/_template/`.

## Known limitations to revisit
- Live status is inferred, not real (free API tier) — see Data → Live scores.
- No automated way to load the unpacked extension (manual step; see CLAUDE.md gotchas).
