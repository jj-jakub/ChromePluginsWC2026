# Plugin Template

Copy this folder to start a new plugin:

```bash
cp -r plugins/_template plugins/my-new-plugin
```

Then edit `manifest.json` (name, description, permissions) and fill in `src/`.
See [../../docs/adding-a-plugin.md](../../docs/adding-a-plugin.md).

> Add real `icons/icon16.png`, `icon48.png`, `icon128.png` before loading — Chrome
> requires PNG icons (SVG is not supported for extension icons).
