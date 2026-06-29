# PLAN — worldcup-overlay 1.0 roadmap

Driving the overlay to a top-class, store-ready 1.0. Built in ~7 coherent commits, foundations
first so later preferences have a home. Every item respects the hard constraints (no build, no
deps, CSP-safe, content-scripts-can't-import-modules, network-only-in-SW, `all:initial` color
discipline, least-privilege). Only **one** new permission across the whole roadmap:
`notifications`. Pure logic stays `chrome`/network-free and unit-tested.

Legend: `[x]` shipped · `[~]` in progress · `[ ]` planned.

## Commit 1 — Foundations
- [x] **Settings store + options page** — pure `settings.js` (`DEFAULTS` + `normalize()` gatekeeper),
      `options.html/js/css`, `chrome.storage.sync`, live `onChanged` updates; worker reads the
      refresh interval to set its alarm. Wired controls: corner, start-minimized, refresh interval.
- [x] **Render extraction + toolbar popup** — moved the markup builders into pure `render.js`
      (`card`/`mini`/`matchBody`), reused by a new `action.default_popup` page. `render.test.mjs`.

## Commit 2 — Data integrity & resilience
- [x] **Robust parsing** — `sanitize.js` (defensive per-record coercion, never throws) + `reconcile.js`
      (merge duplicate `idEvent` across endpoints; most-progressed wins; low-confidence flag). Routed through `api.js`.
- [x] **Backoff / health / provider-down** — `backoff.js` (`nextDelay` capped exponential,
      `classifyHealth` ok|degraded|down); worker persists failures + `nextRetryAt` and honors the
      backoff window; `getState` returns a `health` summary; overlay shows a degraded/down banner.

## Commit 3 — Engagement + real data (landing as focused sub-commits)
- [x] **Favorites (multi-team pin)** — ★ on each team toggles a favorite (`chrome.storage.sync`);
      pure `applyFavorites`/`favoriteIndex`/`teamIsFavorite`/`matchHasFavorite`/`nextFavoriteFixture`
      in `wc-state.js`; worker `decorate`s the cached deck per `GET_STATE` (re-rank, no refetch);
      favorites-only filter toggle + a "Your next" line; mirrored in the popup.
- [x] **Group standings** — pure `standings.js` (P/W/D/L/GF/GA/GD/Pts, FIFA tiebreakers, top-2 qualify);
      season-wide fetch (`fetchSeason`, lazy + 30-min cache) routed through sanitize/reconcile; ☰
      table-view toggle in the overlay + popup, with partial-table note. New `WC_GET_STANDINGS` message.
- [x] **Team form strip** — pure `form.js` (`teamForm` → W/D/L, GF/GA, last[]); SW attaches form to
      each deck match from the warmed season cache; render shows W/D/L chips under the teams.
- [ ] _Fast-follow:_ favorites management section on the options page (overlay/popup ★ covers it for now).

## Commit 4 — Match depth
- [x] **Per-match details** — `roundLabel(round, stage, group)` in `format.js` (Matchday N / Round of 16 / QF / SF / Final); a round caption under the status pill.
- [x] **Today's agenda / list mode** — pure `agenda.js` `groupByDay`; ☰ toggle to a scrollable day-grouped fixtures list; tap a row to jump to that match (overlay + popup).
- [x] **Estimated live minute** — pure `liveMinute(kickoffMs, now)` in `format.js` (HT gap, cap 90+, `~` prefix, yields to provider progress).

## Commit 5 — Glanceable & actionable
- [x] **Toolbar badge** — pure `badge.js` `badgeFor` (live score red / countdown / idle, ~4-char clamp, favorite-aware); SW sets it after each refresh + on favorites change.
- [x] **Desktop notifications** — pure `notify.js` `notificationsFor` (stable tags, favorites-only option); SW fires `chrome.notifications` de-duped via a bounded fired-set; options Notifications section. **+`notifications` permission.**
- [x] **Add-to-calendar (.ics)** — pure `ics.js` (RFC5545 CRLF/escaping, VEVENT + VALARM, stable UID); `＋ Calendar` button downloads via a `data:` anchor (overlay + popup).
- [x] **Score-change feedback** — pure `score-diff.js` (`diff`/`announceFor`); ⚽ GOAL pulse + visually-hidden `aria-live` announcer (reduced-motion-safe).

## Commit 6 — Accessibility, i18n & placement
- [ ] **Accessibility & keyboard** — real `<button>`s; pure `keymap.js` `keyToAction` (←/→/Esc/R/Enter/Space); `:focus-visible`, `prefers-reduced-motion`, `forced-colors`.
- [ ] **i18n + Intl dates + RTL** — `_locales/{en,es,fr,de,pt}`, `self.WC.t` fallback wrapper, `default_locale` + `__MSG__`, Intl date/relative formatting, RTL mirroring.
- [ ] **Per-site allow/deny list** — pure `site-match.js` (exact / `.suffix` / `*`; deny|allow); content early-return; options textarea.
- [ ] **Drag-to-reposition** — pure `position.js` (`nearestCorner`/`clampToViewport`); header drag + corner snap, persisted.
- [ ] **Theme: auto / light / dark** — pure `resolveTheme(pref, systemDark)`; `.wc-theme-*` CSS variants.

## Commit 7 — Distribution / store gate
- [x] **CI + manifest validator** — `.github/workflows/ci.yml` (node --test + validate + package artifact); pure `scripts/validate-manifest.mjs`; README CI badge; guarded footer version stamp.
- [x] **Privacy & permission docs** — `docs/privacy-policy.md`, `docs/store-listing.md` (per-permission justification), `PRIVACY.md`; permission table reflects the final manifest (incl. notifications).

---

**The 1.0 roadmap above is complete** — all 21 features shipped across 7 batches, each with pure
unit-tested logic and an adversarial multi-agent review (findings verified + fixed). 137 tests pass.
Next work is the deferred / fast-follow list below.

## Deferred (post-1.0)
- Knockout bracket view (empty until group stage ends; season fetch lands it cheaply later).
- Head-to-head line (free-tier past window rarely contains a prior meeting).
- Team-tint accent strip; compact-density peek; share-match-to-clipboard; first-run onboarding.
- **Live scores via a patron TheSportsDB key** + v2 livescore endpoint — upgrades inferred-live,
  score deltas, notifications and the badge to true real-time with no other code change.
- Windows flag fallback (emoji → bundled SVG/PNG) — OS limitation; lower priority.

## Known limitations to revisit
- Live status is inferred, not real (free API tier) — see patron-key note above.
- No automated way to load the unpacked extension (manual step; see CLAUDE.md gotchas).

## Repo / tooling (ongoing)
- [ ] Optional dev-only Prettier/ESLint (zero runtime dep for the shipped extension).
- [ ] `shared/` helpers convention if a second plugin needs them (no cross-plugin runtime imports).

## New plugins (ideas)
- [ ] Pick the next plugin idea and scaffold from `plugins/_template/`.
