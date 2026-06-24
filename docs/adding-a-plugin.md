# Adding a new plugin

Every plugin is a self-contained Manifest V3 extension in its own folder under `plugins/`.

## 1. Copy the template

```bash
cp -r plugins/_template plugins/my-new-plugin
```

## 2. Edit `manifest.json`

- Set a unique `name` and `description`.
- Declare only the `permissions` and `host_permissions` you actually need
  (least privilege — reviewers and users notice).
- Point `icons` / `action.default_icon` at your PNGs (16/48/128).

## 3. Write your code under `src/`

Convention used across this repo:

- `src/service-worker.js` — background logic, network fetches (host permissions let it
  bypass page CORS), caching, `chrome.alarms` refreshes.
- `src/content.js` + `src/content.css` — anything injected into pages.
- `src/api.js` — a thin client for whatever external API you call.

Keep DOM that you inject into pages **namespaced and isolated** (a unique id/class prefix,
high `z-index`, `all: initial` reset) so host-page CSS can't break it and yours can't break
the host page.

## 4. Load it

`chrome://extensions` → Developer mode → **Load unpacked** → pick `plugins/my-new-plugin`.
Hit the reload ↻ icon there after each change.

## 5. Package it

```bash
scripts/package.sh my-new-plugin   # -> dist/my-new-plugin.zip
```

## Conventions

- **No build step unless you need one.** Plain JS modules load fine in MV3.
- **No secrets in git.** Use a `secrets.local.js` (git-ignored) if a plugin needs a key.
- **Document each plugin** with its own `README.md` (what it does, permissions, data source).
