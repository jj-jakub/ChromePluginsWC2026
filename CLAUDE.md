# ChromePluginsWC2026 — project context

> Auto-loaded at the start of each Claude Code session in this folder. Durable memory for the
> repo. Keep it updated; keep it compact.

## What this is
A monorepo of small, self-contained **Chrome extensions (Manifest V3)**. One folder per plugin
under `plugins/`, each independently loadable. **No build step, no dependencies** — plain
HTML/CSS/JS. New plugins start from `plugins/_template/`.

GitHub: `git@github.com:jj-jakub/ChromePluginsWC2026.git` (origin uses **SSH** — HTTPS has no
creds on this machine, so push over SSH).

## Plugins
- **worldcup-overlay** — feature-rich (favorites, group table, form, agenda, live-minute, calendar
  export, score-pulse, opt-in notifications, toolbar badge). A floating widget pinned to a
  **configurable corner of every page**
  showing FIFA World Cup 2026: the live match, else next fixture, else last result. Country flags,
  ‹ › arrows to rotate the whole match deck, a counter that jumps back to "current", a manual
  ↻ refresh, and minimize-to-ball. **Follow nations with the ★** — a favorite's match becomes the
  default and gets a favorites-only filter + a "Your next" line. **☰ flips to the live group
  table** (computed from results). Also ships a **toolbar popup**
  (same card on icon-click) and an **options page** (corner, start-minimized, refresh interval;
  `chrome.storage.sync`). Confirmed working in Chrome.

## worldcup-overlay architecture
Two worlds talking over one message, `WC_GET_STATE`:
```
src/
  config.js          all tunables (API key/league/season, cache TTLs, alarm, live window, msg, settings mirror)
  ── background (ES modules, service worker type:module) ──
  service-worker.js  fetch → buildDeck → cache → chrome.alarms (period from settings); backoff+health on failure; decorates with favorites per-request; answers WC_GET_STATE
  api.js             TheSportsDB client: fetch fixture window (+ fetchSeason for standings) → sanitize → normalize → reconcile → WcEvent
  wc-state.js        PURE: phaseOf / isLiveNow / matchModeOf / classify / buildDeck + favorites (applyFavorites/favoriteIndex/nextFavoriteFixture)
  sanitize.js        PURE: defensive coercion of raw provider rows (never throws); drops junk
  reconcile.js       PURE: dedupe duplicate ids across endpoints; most-progressed wins; lowConfidence flag
  backoff.js         PURE: nextDelay (capped exponential) + classifyHealth (ok|degraded|down)
  standings.js       PURE: computeStandings / tableFor — group tables from finished results (FIFA tiebreakers, top-2 qualify)
  form.js            PURE: teamForm — a nation's recent W/D/L + GF/GA from finished season events
  badge.js           PURE: badgeFor — toolbar badge text/color/title (live score / countdown)
  notify.js          PURE: notificationsFor — which desktop notifications should exist now (stable tags)
  ── content scripts (classic; share one self.WC namespace, loaded in this order before content.js) ──
  i18n.js            self.WC.t/dir — chrome.i18n wrapper (English fallback) + RTL direction
  format.js          self.WC.fmt — esc / clock / dayLabel / until / ago / roundLabel / liveMinute
  flags.js           self.WC.flag — country → emoji flag
  settings.js        self.WC.settings — PURE DEFAULTS + normalize() gatekeeper for chrome.storage.sync
  agenda.js          self.WC.agenda — PURE groupByDay (all-fixtures list grouped by day)
  ics.js             self.WC.ics — PURE toICS (RFC5545 .ics for "add to calendar")
  score-diff.js      self.WC.scoreDiff — PURE diff / announceFor (goal pulse + aria-live announcer)
  site-match.js      self.WC.site — PURE siteAllowed / ruleMatches (per-site allow/deny)
  ui-logic.js        self.WC.ui — PURE resolveTheme (auto/light/dark)
  keymap.js          self.WC.keymap — PURE keyToAction (←/→/Esc/R/Enter, RTL-aware)
  position.js        self.WC.position — PURE nearestCorner / clampToViewport (drag snap)
  render.js          self.WC.render — PURE HTML builders (card / mini / matchBody / standings / agenda); reused by the popup
  content.js         inject isolated widget; settings/theme/dir/site-rules; render the deck; rotate / refresh / minimize / drag / keyboard
  content.css        scoped styles (+ .wc-pos-* corners, .wc-theme-light, focus/reduced-motion/forced-colors, [dir=rtl])
  ── extension pages (own documents; normal CSS, no all:initial) ──
  options.html/js/css  settings UI → chrome.storage.sync (via settings.normalize)
  popup.html/js/css    toolbar action popup; reuses content.css + render.js in a #wc-overlay-root wrapper
_locales/{en,es,fr,de,pt}/messages.json   i18n catalogs (en complete; others fall back to en)
test/                node --test (137 cases) — every PURE module; run `cd plugins/worldcup-overlay && node --test`
scripts/validate-manifest.mjs   PURE manifest validator (CI + local); .github/workflows/ci.yml runs tests+validate+package
```

## Key decisions (this is why things are the way they are)
- **Display = content-script overlay**, fixed to a user-chosen corner (`.wc-pos-*` class from
  settings), isolated under `#wc-overlay-root`. The **popup reuses the same `#wc-overlay-root` +
  `content.css`** so the card looks identical on the toolbar icon.
- **Settings live in `chrome.storage.sync`** behind one pure gatekeeper, `settings.normalize()`
  (in `settings.js`): it clamps/whitelists every field and drops unknown keys, so a stale or
  corrupted stored object can never crash the content world or the worker. The worker mirrors the
  few values it needs in `config.js` (same discipline as the duplicated `MSG` string).
- **Data = TheSportsDB free public key `"3"`, no signup.** League **4429** (FIFA World Cup),
  season **2026**. Workhorse endpoint `eventsday.php?d=YYYY-MM-DD&l=4429` (+ next/past league).
  Free tier has **no live-score feed** → "live" is inferred from the kickoff window
  (`LIVE_WINDOW_MS`, 150 min). Score appears once the provider marks the match finished.
  A patron key (set in `config.js`) would unlock real live data with no other changes.
- **Flags are emoji, not images** — deliberate: no `<img>` means nothing breaks under strict
  page CSP, zero network. Renders natively on macOS. (Windows shows 2-letter codes — OS limit.)
- **Network only in the service worker** — `host_permissions` bypass CORS there, not in pages.
- **Permissions: `storage`, `alarms`, `notifications`** (notifications opt-in, default off) + host
  `thesportsdb.com` + `<all_urls>` content script. The worker also sets the toolbar badge and (when
  enabled) fires `chrome.notifications` after each refresh.
- The pure logic (`wc-state.js`) and content helpers (`format.js`/`flags.js`) are deliberately
  `chrome`/network-free so they stay unit-testable.

## Gotchas learned (don't rediscover these)
- **`all: initial` disables color inheritance.** The CSS reset means EVERY text element must set
  its own `color`, or it renders **black** (was black-on-green until fixed). Watch this for any
  injected UI.
- **Content scripts can't use ES modules from the manifest.** Hence the `self.WC` namespace
  shared across `format.js`/`flags.js`/`settings.js`/`render.js`/`content.js` (loaded in that
  order). Any pure helper both worlds need is either a classic `self.WC` file tested via the
  `self` shim, or duplicated: the message string `"WC_GET_STATE"` and the settings `KEY`/clamp
  range are duplicated in `config.js` and must match.
- **You cannot load an unpacked extension via automation here.** Chrome 149 removed the
  `--load-extension` CLI flag; Chrome is sandboxed read-only (no clicking `chrome://` or the
  native file picker). Loading is a manual user action: `chrome://extensions` → Developer mode →
  Load unpacked → pick the plugin folder.
- **Preview/dev-server tooling wants port 8787**, which the user's separate stockTrading
  dashboard holds — don't fight it; verify the widget by reloading in Chrome instead.

## How to work here
- **Load/reload:** `chrome://extensions` → Developer mode → Load unpacked → plugin folder.
  After changes, hit the ↻ reload icon on the card, then refresh a page.
- **Test:** `cd plugins/worldcup-overlay && node --test`
- **Validate manifest:** `python3 -c "import json; json.load(open('plugins/<name>/manifest.json'))"`
- **Package:** `scripts/package.sh <name>` → `dist/<name>.zip` (tests excluded).
- **New plugin:** `cp -r plugins/_template plugins/<name>`; see `docs/adding-a-plugin.md`.
- **Commits:** small, imperative, focused.

## Conventions
One plugin per folder, independently loadable, no cross-plugin imports. Least-privilege
permissions. Vanilla JS first. Isolate injected UI (namespaced ids, `all:initial`, high z-index,
explicit colors).

See `PLAN.md` for next steps.
