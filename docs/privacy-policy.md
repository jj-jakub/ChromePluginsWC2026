# Privacy Policy — World Cup Overlay

_Last updated: 2026-06-29_

**World Cup Overlay does not collect, store, sell, or share any personal data.** There are no
analytics, no trackers, no accounts, and no third-party SDKs.

## What the extension does

It shows FIFA World Cup 2026 fixtures, scores and group tables in a small widget in the corner of
the pages you visit (and in a toolbar popup).

## Data and where it lives

- **Your settings** (corner, theme, refresh interval, favorite nations, per-site rules,
  notification preferences) are stored with Chrome's `storage.sync` API. They live in **your own
  Google/Chrome account** and sync across your devices. They are never sent to us — we have no
  server.
- **A response cache** (the current fixtures/scores and a small fetch-health record) is stored
  locally with `storage.local` / `storage.session` on your device, so the widget loads instantly
  and degrades gracefully offline.
- The extension makes **one kind of network request**: to the public sports data provider
  **TheSportsDB** (`https://www.thesportsdb.com`) to fetch public World Cup fixtures and results.
  These requests contain no personal information — just the public competition/date being looked
  up. They are made from the extension's background service worker, not from the pages you visit.

## What the extension never does

- It never reads, records, or transmits the content of the web pages you visit.
- It never sends your browsing history, the URLs you visit, or your settings anywhere.
- It never shows ads.

The only thing the content script reads from a page is its **hostname** — and only locally, in
your browser, so the optional per-site allow/deny list can decide whether to show the widget there.
That hostname is never transmitted.

## Permissions

See [store-listing.md](./store-listing.md) for a per-permission justification.

## Contact

Questions or concerns: open an issue at
<https://github.com/jj-jakub/ChromePluginsWC2026>.
