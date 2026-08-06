#!/bin/bash
# Image-budget spike: prove a STATE_IMG_BUDGET-char embedded image survives a
# TRANSFER (image rides twice: input proof + output state) under the 64KB
# TxPoW cap. Run against the local node; success criterion is the UTXO set
# (coin moved), never txnpost status.
#
# Usage: ./image-budget-spike.sh [budget_chars]   (default 12000)
set -u
cd "$(dirname "$0")"
BUDGET="${1:-12000}"
RPC=./rpc.sh
TXN="imgspike$$"

jqr() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1" 2>/dev/null; }

say() { echo "[spike] $*"; }

STATUS=$($RPC "status" | jqr "d['status']")
[ "$STATUS" != "True" ] && { echo "node not reachable"; exit 1; }

ADDR=$($RPC "getaddress" | jqr "d['response']['address']")
say "address $ADDR"

# deterministic base64 filler, repeated enough to cover any budget
PAYLOAD=$(python3 -c "b=$BUDGET; s='QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVph'; print((s*(b//len(s)+1))[:b])")
[ ${#PAYLOAD} -ne "$BUDGET" ] && { echo "FAIL: payload generator produced ${#PAYLOAD} chars"; exit 1; }
say "payload ${#PAYLOAD} chars"

# 1) find (or mint) a dedicated 1-unit plain test token
TID=$($RPC "balance" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('response',[]):
    t=r.get('token')
    name = t if isinstance(t,str) else (t.get('name') if isinstance(t,dict) else '')
    if name=='IMGSPIKE': print(r['tokenid']); break
")
if [ -z "$TID" ]; then
  say "minting IMGSPIKE test token…"
  $RPC "tokencreate name:IMGSPIKE amount:1 decimals:0" >/dev/null
  for i in $(seq 1 40); do
    sleep 15
    TID=$($RPC "balance" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('response',[]):
    t=r.get('token')
    name = t if isinstance(t,str) else (t.get('name') if isinstance(t,dict) else '')
    if name=='IMGSPIKE': print(r['tokenid']); break
")
    [ -n "$TID" ] && break
    say "waiting for tokencreate… ($i)"
  done
fi
[ -z "$TID" ] && { echo "FAIL: test token never appeared"; exit 1; }
say "token $TID"

coin_id() { $RPC "coins relevant:true tokenid:$TID" | jqr "d['response'][0]['coinid']" ; }
coin_state1_len() { $RPC "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for c in d.get('response',[]):
    for s in c.get('state',[]):
        if str(s.get('port'))=='1': print(len(str(s.get('data')))); sys.exit()
print(0)
"; }

COIN=$(coin_id)
for i in $(seq 1 40); do
  [ -n "$COIN" ] && [ "$COIN" != "None" ] && break
  sleep 15; COIN=$(coin_id)
done
[ -z "$COIN" ] || [ "$COIN" = "None" ] && { echo "FAIL: no coin for test token"; exit 1; }
say "coin $COIN"

post_txn() { # $1 txn-id, then eval remaining commands in order
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
    local st=$($RPC "txnpost id:$id" | jqr "d['status']")
    say "txnpost status $st (UTXO set is the real proof)"
  fi
  $RPC "txndelete id:$id" >/dev/null
  return 0
}

# 2) stamp the coin with the big state (single carry)
CUR_LEN=$(coin_state1_len)
if [ "$CUR_LEN" -lt "$BUDGET" ]; then
  say "stamping coin with $BUDGET-char state (single carry)…"
  post_txn "${TXN}a" \
    "txninput id:${TXN}a coinid:$COIN" \
    "txnoutput id:${TXN}a amount:1 address:$ADDR tokenid:$TID storestate:true" \
    "txnstate id:${TXN}a port:0 value:1" \
    "txnstate id:${TXN}a port:1 value:[$PAYLOAD]"
  STAMPED=0
  for i in $(seq 1 40); do
    sleep 15
    L=$(coin_state1_len)
    [ "$L" -ge "$BUDGET" ] && { STAMPED=1; break; }
    say "waiting for stamp to confirm… ($i, state len $L)"
  done
  [ $STAMPED = 0 ] && { echo "FAIL: stamp ($BUDGET chars, single carry) never confirmed"; exit 1; }
  say "STAMP CONFIRMED — $BUDGET chars fit a single-carry txn"
else
  say "coin already stamped with $CUR_LEN chars"
fi

# 3) THE REAL TEST: transfer the stamped coin (image rides twice)
COIN=$(coin_id)
ADDR2=$($RPC "getaddress" | jqr "d['response']['address']")
say "transferring stamped coin (double carry) to ${ADDR2}"
post_txn "${TXN}b" \
  "txninput id:${TXN}b coinid:$COIN" \
  "txnoutput id:${TXN}b amount:1 address:$ADDR2 tokenid:$TID storestate:true" \
  "txnstate id:${TXN}b port:0 value:1" \
  "txnstate id:${TXN}b port:1 value:[$PAYLOAD]"

for i in $(seq 1 40); do
  sleep 15
  NOW=$(coin_id)
  if [ -n "$NOW" ] && [ "$NOW" != "None" ] && [ "$NOW" != "$COIN" ]; then
    L=$(coin_state1_len)
    if [ "$L" -ge "$BUDGET" ]; then
      echo "PASS: $BUDGET-char state survived a TRANSFER (coin $COIN -> $NOW, state intact, $L chars)"
      exit 0
    fi
  fi
  say "waiting for transfer to confirm… ($i)"
done
echo "FAIL: transfer of $BUDGET-char state did not confirm within the window"
exit 1
