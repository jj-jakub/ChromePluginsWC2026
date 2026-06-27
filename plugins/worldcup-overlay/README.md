# World Cup Overlay (FIFA WC 2026)

A floating widget pinned to the **top-right corner of every page** showing FIFA World Cup 2026:

- **Live** — the match currently in progress.
- **Upcoming** — if nothing is live, the next scheduled fixture (with kickoff time).
- **Result** — if no fixtures are upcoming, the most recent finished match + score.

Each team shows its **flag** (emoji — no images, so no broken icons on strict-CSP sites).
Use the **‹ ›** arrows to rotate through the whole match deck (earliest → latest); the
**counter** in the middle jumps back to the current match. The header **↻** forces a manual
refresh; the widget also auto-refreshes and can be minimized to a soccer-ball launcher.

## Install (unpacked)

`chrome://extensions` → **Developer mode** → **Load unpacked** → select this folder
(`plugins/worldcup-overlay/`).

## Architecture

Two worlds — a **background service worker** (does the network + decisions) and a **content
script** (renders the widget) — talk over one message, `WC_GET_STATE`.

```
src/
  config.js          all tunables: API key/league/season, cache TTLs, alarm, live window, msg
  ── background (ES modules) ─────────────────────────────────────────────
  service-worker.js  fetch → buildDeck → cache (storage) → chrome.alarms; answers WC_GET_STATE
  api.js             TheSportsDB client: fetch a fixture window + normalize to WcEvent
  wc-state.js        PURE logic: phaseOf / isLiveNow / classify / buildDeck (no chrome, no net)
  ── content script (classic, share self.WC) ────────────────────────────
  format.js          self.WC.fmt — esc / clock / dayLabel / until / ago
  flags.js           self.WC.flag — country → emoji flag
  content.js         inject isolated widget, render the deck, rotate/refresh/minimize
  content.css        scoped styles (all:initial reset; every text node sets its own color)
```

Why the split: `host_permissions` only bypass CORS from the worker, so all fetching lives
there; the pure decision logic (`wc-state.js`) and the content helpers (`format.js`, `flags.js`)
have no `chrome`/network dependency, which is what makes them unit-testable (see below). The
content files can't use ES modules from the manifest, so they share one `self.WC` namespace and
load before `content.js`.

## Tests

Pure logic and helpers are covered by zero-dependency `node --test` files in `test/`:

```bash
node --test          # from this folder (plugins/worldcup-overlay/)
```

## Data source & limits

[TheSportsDB](https://www.thesportsdb.com/) public API, free test key — **no signup required**.
The free tier doesn't expose minute-by-minute live scores, so an in-progress match is detected
from the day's schedule (kickoff passed, not yet finished) and shown as **Live**; the score
updates once the provider marks the match finished. Swapping in a premium key (set in
`src/config.js`) unlocks richer live data without other changes.

## Permissions

- `storage` — cache the last good state.
- `alarms` — periodic background refresh.
- `host_permissions: https://www.thesportsdb.com/*` — the only network destination.
