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
- **worldcup-overlay** — a floating widget pinned to the **top-right of every page** showing
  FIFA World Cup 2026: the live match, else next fixture, else last result. Country flags,
  ‹ › arrows to rotate the whole match deck, a counter that jumps back to "current", a manual
  ↻ refresh, and minimize-to-ball. Confirmed working in Chrome.

## worldcup-overlay architecture
Two worlds talking over one message, `WC_GET_STATE`:
```
src/
  config.js          all tunables (API key/league/season, cache TTLs, alarm, live window, msg)
  ── background (ES modules, service worker type:module) ──
  service-worker.js  fetch → buildDeck → storage cache → chrome.alarms; answers WC_GET_STATE
  api.js             TheSportsDB client: fetch fixture window + normalize → WcEvent
  wc-state.js        PURE: phaseOf / isLiveNow / matchModeOf / classify / buildDeck (no chrome/net)
  ── content script (classic; share a single self.WC namespace, loaded before content.js) ──
  format.js          self.WC.fmt — esc / clock / dayLabel / until / ago
  flags.js           self.WC.flag — country → emoji flag
  content.js         inject isolated widget, render the deck, rotate / refresh / minimize
  content.css        scoped styles
test/                node --test (20 cases) over wc-state, api, flags, format
```

## Key decisions (this is why things are the way they are)
- **Display = content-script overlay**, fixed top-right, isolated under `#wc-overlay-root`.
- **Data = TheSportsDB free public key `"3"`, no signup.** League **4429** (FIFA World Cup),
  season **2026**. Workhorse endpoint `eventsday.php?d=YYYY-MM-DD&l=4429` (+ next/past league).
  Free tier has **no live-score feed** → "live" is inferred from the kickoff window
  (`LIVE_WINDOW_MS`, 150 min). Score appears once the provider marks the match finished.
  A patron key (set in `config.js`) would unlock real live data with no other changes.
- **Flags are emoji, not images** — deliberate: no `<img>` means nothing breaks under strict
  page CSP, zero network. Renders natively on macOS. (Windows shows 2-letter codes — OS limit.)
- **Network only in the service worker** — `host_permissions` bypass CORS there, not in pages.
- The pure logic (`wc-state.js`) and content helpers (`format.js`/`flags.js`) are deliberately
  `chrome`/network-free so they stay unit-testable.

## Gotchas learned (don't rediscover these)
- **`all: initial` disables color inheritance.** The CSS reset means EVERY text element must set
  its own `color`, or it renders **black** (was black-on-green until fixed). Watch this for any
  injected UI.
- **Content scripts can't use ES modules from the manifest.** Hence the `self.WC` namespace
  shared across `format.js`/`flags.js`/`content.js`. The background IS `type:module` and imports
  `config.js` normally — but content can't, so the message string `"WC_GET_STATE"` is duplicated
  in `content.js` and must match `config.MSG.GET_STATE`.
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
