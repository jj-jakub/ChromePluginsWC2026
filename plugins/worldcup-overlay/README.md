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

## How it works

- `src/service-worker.js` — fetches data from [TheSportsDB](https://www.thesportsdb.com/)
  (league `4429`, season `2026`), computes a single "what to show" state, caches it, and
  refreshes on a `chrome.alarms` timer. Network calls run here so `host_permissions` bypass
  page CORS.
- `src/content.js` + `src/content.css` — inject the isolated top-right widget and render the
  state. The widget can be collapsed/hidden.
- `src/api.js` — thin TheSportsDB client.

## Data source & limits

[TheSportsDB](https://www.thesportsdb.com/) public API, free test key — **no signup required**.
The free tier doesn't expose minute-by-minute live scores, so an in-progress match is detected
from the day's schedule (kickoff passed, not yet finished) and shown as **Live**; the score
updates once the provider marks the match finished. Swapping in a premium key (set in
`src/api.js`) unlocks richer live data without other changes.

## Permissions

- `storage` — cache the last good state.
- `alarms` — periodic background refresh.
- `host_permissions: https://www.thesportsdb.com/*` — the only network destination.
