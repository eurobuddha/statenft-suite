#!/bin/bash
# Run every regression test. No dependencies, no node connection required.
#   ./test/run.sh
set -u
cd "$(dirname "$0")/.."
fail=0

echo "== syntax"
for f in minidapp/*.js; do
  node --check "$f" || fail=1
done
for f in mint/*.py; do
  python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "$f" || fail=1
done
echo "  ok    all sources parse"
echo

echo "== sanitizers (untrusted chain metadata)"
node test/sanitize.test.js || fail=1
echo

echo "== engine (coin state, contract shape, adoption fingerprint)"
node test/engine.test.js || fail=1
echo

echo "== generative art (19 packs: determinism, uniqueness, byte budget)"
node test/art.test.js || fail=1
echo

echo "== photo intake (median-cut quantizer + photo-pack integration)"
node test/photo.test.js || fail=1
echo

echo "== send queue (pure planners)"
node test/sendall.test.js || fail=1
echo

echo "== art studio (stub DOM: bindings + index.html id cross-check)"
node test/art-studio.test.js || fail=1
echo

echo "== filtr (engine surface + tab bindings + schema/id drift)"
node test/filtr.test.js || fail=1

echo "== hosting (pure-fn parity vs Android + tab id drift)"
node test/hosting.test.js || fail=1
echo

echo "== cli (bury / transfer / mint parity)"
python3 test/test_cli.py || fail=1
echo

echo "== artimage close-tag ownership"
# The engine must only ever write the OPEN <artimage> tag — the page appends
# </artimage> itself; if engine.js started closing it, icons would double-close.
if grep -q '</artimage>' minidapp/engine.js; then
  echo "  FAIL  engine.js writes </artimage> — the page owns the closing tag"
  fail=1
else
  echo "  ok    engine writes open tag; the page owns the closing tag"
fi
echo

echo "== android bridge parity (assets/artstudio mirrors minidapp)"
# The Android app runs art.js/photo.js VERBATIM in a hidden WebView — the same
# seed must draw byte-identical art on both clients. Drift here forks the art.
BRIDGE=android/app/src/main/assets/artstudio
for f in art.js photo.js; do
  if diff -q "minidapp/$f" "$BRIDGE/$f" >/dev/null 2>&1; then
    echo "  ok    $f byte-identical in the Android bridge"
  else
    echo "  FAIL  $f differs between minidapp/ and $BRIDGE — re-copy it"
    fail=1
  fi
done
FBRIDGE=android/app/src/main/assets/filtr
for f in filtr-engine.js filtr.js filtr-tabs.js styles.css; do
  if diff -q "minidapp/$f" "$FBRIDGE/$f" >/dev/null 2>&1; then
    echo "  ok    $f byte-identical in the FILTR WebView assets"
  else
    echo "  FAIL  $f differs between minidapp/ and $FBRIDGE — re-copy it"
    fail=1
  fi
done
echo

echo "== version + cache-busters (dapp.conf / index.html / footer agree)"
VER=$(python3 -c "import json;print(json.load(open('minidapp/dapp.conf'))['version'])")
BUST=$(echo "$VER" | tr -d '.')
NTAG=$(grep -c "?v=" minidapp/index.html)
NGOOD=$(grep -c "?v=$BUST" minidapp/index.html)
if [ "$NTAG" -ne "$NGOOD" ] || [ "$NTAG" -eq 0 ]; then
  echo "  FAIL  dapp.conf $VER wants ?v=$BUST on every tag; $NGOOD of $NTAG match"
  fail=1
else
  echo "  ok    all $NTAG script/css tags carry ?v=$BUST (dapp.conf $VER)"
fi
if grep -q "Atelier v$VER" minidapp/index.html; then
  echo "  ok    footer version stamp reads Atelier v$VER"
else
  echo "  FAIL  footer version stamp does not read Atelier v$VER"
  fail=1
fi
echo

echo "== build artifacts (version-stamped, never overwritten)"
# THE RULE: every build is ONE file, version in the filename, in releases/.
# An unversioned zip at the repo root is a mutable build — forbidden.
if ls ./*.zip >/dev/null 2>&1; then
  echo "  FAIL  unversioned zip at repo root: $(ls ./*.zip) — builds live ONLY in releases/ with the version in the filename"
  fail=1
else
  echo "  ok    no unversioned build at repo root"
fi
# THE RULE, part two: the shipped zip must carry every file index.html loads.
# (4.2.0/4.2.1 shipped WITHOUT filtr.js/filtr-engine.js — dead Filtr tab.)
ZIP="releases/statenft-atelier-mds-$VER.zip"
if [ -f "$ZIP" ]; then
  zmiss=""
  for f in $(grep -o 'src="[^"?]*' minidapp/index.html | sed 's/src="//') \
           $(grep -o 'href="styles[^"?]*' minidapp/index.html | sed 's/href="//'); do
    unzip -l "$ZIP" | awk '{print $4}' | grep -qx "$f" || zmiss="$zmiss $f"
  done
  if [ -n "$zmiss" ]; then
    echo "  FAIL  $ZIP is missing files index.html loads:$zmiss"
    fail=1
  else
    echo "  ok    $ZIP carries every file index.html loads"
  fi
fi
echo

if [ "$fail" -eq 0 ]; then
  echo "ALL TESTS PASSED"
else
  echo "TESTS FAILED"
fi
exit $fail
