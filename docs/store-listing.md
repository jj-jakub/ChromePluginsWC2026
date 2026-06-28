# Chrome Web Store listing notes — World Cup Overlay

Material for the store submission: single-purpose description, per-permission justification, and
the data-safety disclosures.

## Single purpose

Show FIFA World Cup 2026 fixtures, live/last scores, group standings and team form in a small,
movable widget in the corner of the page (and in a toolbar popup), with optional follow-a-nation
favorites, calendar export, and kickoff/score notifications.

## Permission justification

| Permission / host | Why it's needed |
| --- | --- |
| `storage` | Save the user's settings (`storage.sync`, syncs across their devices) and cache fixtures/scores locally (`storage.local` / `storage.session`) so the widget loads instantly and works offline. |
| `alarms` | Refresh scores in the background on a timer (the user's chosen interval) so the widget and toolbar badge stay current without an open tab. |
| `notifications` | **Optional, off by default.** Show desktop alerts for a followed nation's kickoff, goals/live, and full-time when the user turns them on. |
| Host: `https://www.thesportsdb.com/*` | The only network endpoint — fetch public World Cup fixtures and results from TheSportsDB. |
| Content script on `<all_urls>` | Render the overlay on whichever page the user is viewing. It reads only the page's own hostname (locally) for the optional per-site allow/deny list; it never reads or transmits page content. |

No `tabs`, `webRequest`, `cookies`, `history`, `downloads`, `scripting`, or remote-code
permissions are requested.

## Data safety disclosures

- **Does this extension collect or use user data?** No personal or sensitive user data is
  collected or transmitted.
- **Data sold to third parties?** No.
- **Data used for purposes unrelated to the core functionality?** No.
- **Network:** one request type, to `thesportsdb.com`, for public sports data; contains no
  personal information.
- **On-device only:** settings (sync, in the user's own account) and a response cache (local).

## Privacy policy URL

Host [privacy-policy.md](./privacy-policy.md) at a public URL and link it in the listing (Chrome
requires a privacy policy URL once any permission is requested).
