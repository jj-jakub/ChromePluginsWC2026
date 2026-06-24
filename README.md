# ChromePluginsWC2026

A monorepo of small, focused **Chrome extensions (Manifest V3)**. Each plugin lives in its
own self-contained folder under [`plugins/`](plugins/) and can be loaded independently.

## Plugins

| Plugin | What it does | Folder |
| ------ | ------------ | ------ |
| **World Cup Overlay** | Shows a live FIFA World Cup 2026 widget in the top-right corner of every page — the in-progress match, or the next fixture / last result when nothing is live. Data from [TheSportsDB](https://www.thesportsdb.com/). | [`plugins/worldcup-overlay/`](plugins/worldcup-overlay/) |

> New plugins start from [`plugins/_template/`](plugins/_template/). See
> [docs/adding-a-plugin.md](docs/adding-a-plugin.md).

## Loading a plugin in Chrome (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select the plugin's folder (e.g. `plugins/worldcup-overlay/`).
4. The extension is now active. Reload it from the same page after pulling changes.

Each plugin folder *is* the extension root — that folder contains the `manifest.json`.

## Repository layout

```
plugins/                 one folder per extension; each is independently loadable
  _template/             copy this to start a new plugin
  worldcup-overlay/      the World Cup top-right overlay
docs/                    contributing + how to add a plugin
scripts/                 helper scripts (e.g. package a plugin into a .zip)
dist/                    build output (git-ignored)
```

## Packaging for distribution

```bash
scripts/package.sh worldcup-overlay     # -> dist/worldcup-overlay.zip
```

The zip is what you'd upload to the Chrome Web Store, or share for manual install.

## License

[MIT](LICENSE)
