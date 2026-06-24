#!/usr/bin/env bash
# Package a plugin folder into a distributable zip.
#
#   scripts/package.sh <plugin-name>
#
# Produces dist/<plugin-name>.zip containing the contents of plugins/<plugin-name>/
# (with the manifest at the zip root, which is what Chrome Web Store / unpacked installs expect).

set -euo pipefail

PLUGIN="${1:-}"
if [[ -z "$PLUGIN" ]]; then
  echo "usage: scripts/package.sh <plugin-name>" >&2
  echo "available:" >&2
  ls -1 plugins | grep -v '^_' | sed 's/^/  /' >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/plugins/$PLUGIN"
OUT="$ROOT/dist/$PLUGIN.zip"

if [[ ! -f "$SRC/manifest.json" ]]; then
  echo "error: $SRC/manifest.json not found — is '$PLUGIN' a real plugin?" >&2
  exit 1
fi

mkdir -p "$ROOT/dist"
rm -f "$OUT"

# Zip from inside the plugin dir so manifest.json sits at the archive root.
( cd "$SRC" && zip -r -q -X "$OUT" . -x '*.DS_Store' '*/secrets.local.js' )

echo "packaged -> dist/$PLUGIN.zip"
