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

echo "== cli (bury / transfer / mint parity)"
python3 test/test_cli.py || fail=1
echo

if [ "$fail" -eq 0 ]; then
  echo "ALL TESTS PASSED"
else
  echo "TESTS FAILED"
fi
exit $fail
