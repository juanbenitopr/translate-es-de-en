#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname "$0")/.." && pwd)
DIST_DIR="$ROOT_DIR/dist"
BUILD_DIR="$DIST_DIR/chrome"
OUTPUT_ZIP="$DIST_DIR/traductor-es-en-de-chrome.zip"

FILES=(
  background.chrome.js
  background.js
  browser-api.js
  content-script.js
  icons
  manifest.json
  options.html
  options.js
  popup.css
  popup.html
  popup.js
  saved.html
  saved.js
)

node "$ROOT_DIR/scripts/build.mjs" chrome >/dev/null

mkdir -p "$DIST_DIR"
rm -f "$OUTPUT_ZIP"

cd "$BUILD_DIR"
zip -r -X "$OUTPUT_ZIP" "${FILES[@]}"

echo "$OUTPUT_ZIP"
