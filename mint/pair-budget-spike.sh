#!/bin/bash
# PAIR-budget spike: find the real ceiling for (record + image) in a transfer.
# A transfer carries the SIGNED token record twice and the image state twice
# (+ the txn signature) under the 64KB TxPoW cap. The shipping constant
# PAIR_BUDGET=23000 was set from one proven point (~8.9K signed record +
# 16000 image); this ladder probes 24K, 25K, 26K, 27K combined and reports
# the highest level whose TRANSFER confirms on-chain (UTXO set is the proof).
#
# Usage: ./pair-budget-spike.sh          (runs the whole ladder)
set -u
cd "$(dirname "$0")"
RPC=./rpc.sh
TXN="pairspike$$"

jqr() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1" 2>/dev/null; }
say() { echo "[pair-spike] $*"; }

STATUS=$($RPC "status" | jqr "d['status']")
[ "$STATUS" != "True" ] && { echo "node not reachable"; exit 1; }

ADDR=$($RPC "getaddress" | jqr "d['response']['address']")
PK=$($RPC "getaddress" | jqr "d['response']['publickey']")
say "address $ADDR"

# 1) find-or-mint the SIGNED probe token with a padded record.
#    Filler sized so the signed record lands near 10K — heavier than any
#    real generative record we permit, making the probe conservative.
FILLER=$(python3 -c "s='QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVph'; print((s*40)[:1200])")
find_tid() { $RPC "balance" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('response',[]):
    t=r.get('token')
    name = t if isinstance(t,str) else (t.get('name') if isinstance(t,dict) else '')
    if name=='PAIRSPIKE': print(r['tokenid']); break
"; }
TID=$(find_tid)
if [ -z "$TID" ]; then
  say "minting signed PAIRSPIKE probe token…"
  $RPC "tokencreate name:{\"name\":\"PAIRSPIKE\",\"filler\":\"$FILLER\"} amount:1 decimals:0 signtoken:$PK" >/dev/null
  for i in $(seq 1 40); do
    sleep 15; TID=$(find_tid); [ -n "$TID" ] && break
    say "waiting for tokencreate… ($i)"
  done
fi
[ -z "$TID" ] && { echo "FAIL: probe token never appeared"; exit 1; }
RECLEN=$($RPC "tokens tokenid:$TID" | python3 -c "import json,sys; print(len(json.dumps(json.load(sys.stdin)['response'])))")
say "token $TID — SIGNED record measures ${RECLEN}B"

coin_id() { $RPC "coins relevant:true tokenid:$TID" | jqr "d['response'][0]['coinid']"; }
state1_len() { $RPC "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for c in d.get('response',[]):
    for s in c.get('state',[]):
        if str(s.get('port'))=='1': print(len(str(s.get('data')))); sys.exit()
print(0)
"; }

post_txn() {
  local id="$1"; shift
  $RPC "txndelete id:$id" >/dev/null
  $RPC "txncreate id:$id" >/dev/null
  local ok=1
  while [ $# -gt 0 ]; do
    local st=$($RPC "$1" | jqr "d['status']")
    [ "$st" != "True" ] && { say "step failed: ${1:0:60}…"; ok=0; break; }
    shift
  done
  if [ $ok = 1 ]; then
    $RPC "txnsign id:$id publickey:auto" >/dev/null
    $RPC "txnbasics id:$id" >/dev/null
    $RPC "txnpost id:$id" >/dev/null
  fi
  $RPC "txndelete id:$id" >/dev/null
}

BEST=0
LEVELS="${LEVELS:-24000 25000 26000 27000}"
for COMBINED in $LEVELS; do
  IMG=$((COMBINED - RECLEN))
  [ "$IMG" -le 0 ] && { say "level $COMBINED skipped (record alone is ${RECLEN}B)"; continue; }
  PAYLOAD=$(python3 -c "b=$IMG; s='QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVph'; p=(s*(b//len(s)+1))[:b]; assert len(p)==b; print(p)")
  say "=== level: record ${RECLEN}B + image ${IMG}B = ${COMBINED}B combined ==="

  COIN=$(coin_id)
  [ -z "$COIN" ] || [ "$COIN" = "None" ] && { echo "FAIL: probe coin lost"; exit 1; }

  # (a0) reset the state to a tiny payload first, so the level stamp (a) is a
  # small single-carry and the TRANSFER (b) is always the biggest txn tested
  if [ "$(state1_len)" -ne 102 ]; then
    TINY=$(python3 -c "print('A'*100)")
    post_txn "${TXN}r" \
      "txninput id:${TXN}r coinid:$COIN" \
      "txnoutput id:${TXN}r amount:1 address:$ADDR tokenid:$TID storestate:true" \
      "txnstate id:${TXN}r port:0 value:1" \
      "txnstate id:${TXN}r port:1 value:[$TINY]"
    OK=0
    for i in $(seq 1 24); do
      sleep 15
      [ "$(state1_len)" -eq 102 ] && { OK=1; break; }
    done
    [ $OK = 0 ] && { echo "FAIL: reset stamp never confirmed"; exit 1; }
    COIN=$(coin_id)
  fi

  # (a) stamp to this level (single carry of the new payload)
  post_txn "${TXN}a" \
    "txninput id:${TXN}a coinid:$COIN" \
    "txnoutput id:${TXN}a amount:1 address:$ADDR tokenid:$TID storestate:true" \
    "txnstate id:${TXN}a port:0 value:1" \
    "txnstate id:${TXN}a port:1 value:[$PAYLOAD]"
  OK=0
  for i in $(seq 1 24); do
    sleep 15
    [ "$(state1_len)" -eq "$((IMG + 2))" ] && { OK=1; break; }
  done
  [ $OK = 0 ] && { say "LEVEL ${COMBINED}: stamp never confirmed — ceiling reached"; break; }

  # (b) THE TEST: transfer at this level (record x2 + image x2 + sig)
  COIN=$(coin_id)
  post_txn "${TXN}b" \
    "txninput id:${TXN}b coinid:$COIN" \
    "txnoutput id:${TXN}b amount:1 address:$ADDR tokenid:$TID storestate:true" \
    "txnstate id:${TXN}b port:0 value:1" \
    "txnstate id:${TXN}b port:1 value:[$PAYLOAD]"
  OK=0
  for i in $(seq 1 24); do
    sleep 15
    NOW=$(coin_id)
    [ -n "$NOW" ] && [ "$NOW" != "None" ] && [ "$NOW" != "$COIN" ] && \
      [ "$(state1_len)" -eq "$((IMG + 2))" ] && { OK=1; break; }
  done
  if [ $OK = 1 ]; then
    say "LEVEL ${COMBINED}: TRANSFER CONFIRMED"
    BEST=$COMBINED
    [ "${DESCEND:-0}" = "1" ] && break   # first pass from above = the ceiling
  else
    say "LEVEL ${COMBINED}: transfer did NOT confirm"
    [ "${DESCEND:-0}" != "1" ] && break
  fi
done

if [ "$BEST" -gt 0 ]; then
  echo "PAIR PASS: highest confirmed combined level = ${BEST}B (record ${RECLEN}B signed)"
  echo "PAIR RECOMMEND: PAIR_BUDGET = $((BEST - 1500)) (ceiling minus margin)"
else
  echo "PAIR INCONCLUSIVE: no level above 23000 confirmed — keep PAIR_BUDGET 23000"
fi
