# Contributing

## Principles

- **One plugin per folder, independently loadable.** No cross-plugin imports.
- **Least privilege.** Request the narrowest `permissions` / `host_permissions` that work.
- **Vanilla first.** Avoid frameworks/build steps unless a plugin genuinely needs one.
- **Isolate injected UI.** Namespace ids/classes, reset inherited styles, use a sane `z-index`.

## Commit style

Small, focused commits with imperative subjects, e.g.:

```
Add worldcup-overlay scaffold (manifest + service worker + content script)
```

## Before pushing

- Load the plugin unpacked and confirm it works (no console errors on a couple of sites).
- Update the plugin's `README.md` and the root README table if behavior changed.
