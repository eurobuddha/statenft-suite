#!/bin/bash
# Locked-edition v2 spike: SAMESTATE content immutability (embed-mode, ports 0-1).
cd "$(dirname "$0")"
CPK=0xC9B6654E90F2163BC66E209F311DCE02F6E201F4AD922A823C67443FBEAFF6BA
CREATOR=0xC1242210B61A89918C9F17340DB263A4479A0A7E89413B4DEFC6B6396DD054CD
A2=0x3DFF703483AB010881DEF823DD273759D524AAAEDD0FE6E547828EC74197B71F
SCRIPT="LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY($CPK) THEN RETURN TRUE ENDIF RETURN SAMESTATE(0 1) AND VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)"
IMG="[dGVzdGltYWdlYmFzZTY0ZGF0YQ==]"

jq_status() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d['status'],str(d.get('error',''))[:100])"; }

post_txn() {
  local ID=$1; shift
  ./rpc.sh "txndelete id:$ID" >/dev/null; ./rpc.sh "txncreate id:$ID" >/dev/null
  for CMDLINE in "$@"; do
    R=$(./rpc.sh "$CMDLINE" | python3 -c "import json,sys;d=json.load(sys.stdin);print('OK' if d['status'] else d.get('error',''))")
    [ "$R" != "OK" ] && echo "  step failed: $R"
  done
  ./rpc.sh "txnbasics id:$ID" >/dev/null
  ./rpc.sh "txnpost id:$ID" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  post:','OK' if d['status'] else d.get('error',''))"
  ./rpc.sh "txndelete id:$ID" >/dev/null
}

wait_gone() { # coinid; waits 5 blocks; echoes moved|held
  local CID=$1
  local START=$(./rpc.sh 'block' | python3 -c "import json,sys;print(json.load(sys.stdin)['response']['block'])")
  while true; do
    local NOW=$(./rpc.sh 'block' | python3 -c "import json,sys;print(json.load(sys.stdin)['response']['block'])")
    local STILL=$(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
print('yes' if any(c['coinid']=='$CID' for c in json.load(sys.stdin)['response']) else 'no')")
    [ "$STILL" = "no" ] && { echo moved; return; }
    [ $((NOW-START)) -ge 5 ] && { echo held; return; }
    /bin/sleep 30
  done
}

echo "=== 1. tokencreate LOCKPROBE2 (SAMESTATE contract)"
./rpc.sh "tokencreate name:{\"name\":\"LOCKPROBE2\",\"size\":2,\"mode\":\"embed\"} amount:2 decimals:0 script:\"$SCRIPT\" state:{\"0\":\"0\"}" | jq_status

TID=""
for i in $(seq 1 25); do
  TID=$(./rpc.sh 'balance' | python3 -c "
import json,sys
for b in json.load(sys.stdin)['response']:
    t=b['token']
    if isinstance(t,dict) and t.get('name')=='LOCKPROBE2': print(b['tokenid'])")
  [ -n "$TID" ] && break; /bin/sleep 20
done
[ -z "$TID" ] && { echo "FAIL: token never appeared"; exit 1; }
echo "tokenid: $TID"

COIN=""; ADDR=""
for i in $(seq 1 25); do
  read -r COIN ADDR <<< $(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
cs=json.load(sys.stdin)['response']
if cs: print(cs[0]['coinid'], cs[0]['address'])")
  [ -n "$COIN" ] && break; /bin/sleep 20
done
echo "mint coin: $COIN at $ADDR"

if [ "$ADDR" != "$CREATOR" ]; then
  echo "=== 2. move to creator"
  post_txn mv2 "txninput id:mv2 coinid:$COIN" \
    "txnoutput id:mv2 amount:2 address:$CREATOR tokenid:$TID storestate:true" \
    "txnstate id:mv2 port:0 value:0" \
    "txnsign id:mv2 publickey:auto" "txnsign id:mv2 publickey:$CPK"
  COIN=""
  for i in $(seq 1 25); do
    COIN=$(./rpc.sh "coins relevant:true tokenid:$TID address:$CREATOR" | python3 -c "
import json,sys
cs=json.load(sys.stdin)['response']
print(cs[0]['coinid'] if cs else '')")
    [ -n "$COIN" ] && break; /bin/sleep 20
  done
fi

echo "=== 3. split"
post_txn sp2 "txninput id:sp2 coinid:$COIN" \
  "txnoutput id:sp2 amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnoutput id:sp2 amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnstate id:sp2 port:0 value:0" \
  "txnsign id:sp2 publickey:auto"
U1=""
for i in $(seq 1 25); do
  U1=$(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
cs=[c for c in json.load(sys.stdin)['response'] if c.get('tokenamount')=='1']
print(cs[0]['coinid'] if len(cs)>=2 else '')")
  [ -n "$U1" ] && break; /bin/sleep 20
done
[ -z "$U1" ] && { echo "FAIL: split"; exit 1; }
echo "=== SPLIT OK"

echo "=== 4. stamp item #1 with index+image"
post_txn st2 "txninput id:st2 coinid:$U1" \
  "txnoutput id:st2 amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnstate id:st2 port:0 value:1" \
  "txnstate id:st2 port:1 value:$IMG" \
  "txnsign id:st2 publickey:auto"
S1=""
for i in $(seq 1 25); do
  S1=$(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
for c in json.load(sys.stdin)['response']:
    s0=next((s['data'] for s in c['state'] if s['port']==0),None)
    if s0=='1': print(c['coinid'])")
  [ -n "$S1" ] && break; /bin/sleep 20
done
[ -z "$S1" ] && { echo "FAIL: stamp"; exit 1; }
echo "=== STAMP OK: $S1"

echo "=== 5a. ATTACK: creator changes index (1->2, image kept)"
post_txn ev1 "txninput id:ev1 coinid:$S1" \
  "txnoutput id:ev1 amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnstate id:ev1 port:0 value:2" \
  "txnstate id:ev1 port:1 value:$IMG" \
  "txnsign id:ev1 publickey:auto" "txnsign id:ev1 publickey:$CPK"
R=$(wait_gone $S1)
[ "$R" = "moved" ] && { echo "!!! BROKEN: index change accepted"; exit 1; }
echo "=== index tamper REJECTED"

echo "=== 5b. ATTACK: creator swaps image (index kept)"
post_txn ev2 "txninput id:ev2 coinid:$S1" \
  "txnoutput id:ev2 amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnstate id:ev2 port:0 value:1" \
  "txnstate id:ev2 port:1 value:[ZXZpbHN3YXBwZWRpbWFnZQ==]" \
  "txnsign id:ev2 publickey:auto" "txnsign id:ev2 publickey:$CPK"
R=$(wait_gone $S1)
[ "$R" = "moved" ] && { echo "!!! BROKEN: image swap accepted"; exit 1; }
echo "=== image swap REJECTED"

echo "=== 6. legit preserve-transfer to A2 (both ports verbatim)"
post_txn xf2 "txninput id:xf2 coinid:$S1" \
  "txnoutput id:xf2 amount:1 address:$A2 tokenid:$TID storestate:true" \
  "txnstate id:xf2 port:0 value:1" \
  "txnstate id:xf2 port:1 value:$IMG" \
  "txnsign id:xf2 publickey:auto"
AT2=""
for i in $(seq 1 25); do
  AT2=$(./rpc.sh "coins relevant:true tokenid:$TID address:$A2" | python3 -c "
import json,sys
cs=json.load(sys.stdin)['response']
print(cs[0]['coinid'] if cs else '')")
  [ -n "$AT2" ] && break; /bin/sleep 20
done
[ -z "$AT2" ] && { echo "FAIL: preserve-transfer rejected (contract too strict?)"; exit 1; }
echo "=== PRESERVE-TRANSFER OK: $AT2"

echo ""
echo "=========================================="
echo "LOCKED-EDITION v2 CONTRACT FULLY PROVEN:"
echo " mint/split/stamp via sentinel OK"
echo " index tamper REJECTED (even creator)"
echo " image swap REJECTED (even creator)"
echo " exact-preserve transfer PASSES"
echo "tokenid: $TID"