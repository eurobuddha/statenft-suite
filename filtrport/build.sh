#!/bin/sh
# Regenerate minidapp/filtr-engine.js from tools/filtr + the filtrport shims.
# Dev-only (needs node/npx); the OUTPUT is the vendored artifact that ships.
set -e
cd "$(dirname "$0")/.."
FILTR_SRC="${FILTR_SRC:-/Users/eurobuddha/Projects/tools/filtr/src}"
[ -d "$FILTR_SRC" ] || { echo "filtr source not found at $FILTR_SRC"; exit 1; }

npx -y esbuild filtrport/entry.ts \
  --bundle \
  --format=iife \
  --global-name=FiltrEngine \
  --target=es2017 \
  --alias:@filtr="$FILTR_SRC" \
  --alias:@="$FILTR_SRC" \
  --outfile=minidapp/filtr-engine.js \
  --banner:js="/* filtr-engine.js — vendored bundle of tools/filtr's WebGL2 engine (MIT)
 * plus the Atelier port shims. DO NOT EDIT BY HAND: regenerate with
 * filtrport/build.sh (see filtrport/renderer.ts header for the patch list).
 * 15 effects + prep grade + 7 post passes + presets; still images only. */"

node --check minidapp/filtr-engine.js
echo "filtr-engine.js rebuilt: $(wc -c < minidapp/filtr-engine.js) bytes"
