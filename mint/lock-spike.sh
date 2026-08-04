#!/bin/bash
# Locked-edition contract spike: sentinel state + immutability once stamped.
cd "$(dirname "$0")"
CPK=0xC9B6654E90F2163BC66E209F311DCE02F6E201F4AD922A823C67443FBEAFF6BA
CREATOR=0xC1242210B61A89918C9F17340DB263A4479A0A7E89413B4DEFC6B6396DD054CD
A2=0x3DFF703483AB010881DEF823DD273759D524AAAEDD0FE6E547828EC74197B71F
SCRIPT="LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY($CPK) THEN RETURN TRUE ENDIF RETURN VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)"

jq_status() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d['status'],str(d.get('error',''))[:100])"; }

echo "=== 1. tokencreate with sentinel state"
./rpc.sh "tokencreate name:{\"name\":\"LOCKPROBE\",\"size\":2,\"mode\":\"url\",\"base\":\"https://example.com/x/\",\"ext\":\".png\"} amount:2 decimals:0 script:\"$SCRIPT\" state:{\"0\":\"0\"}" | jq_status

TID=""
for i in $(seq 1 25); do
  TID=$(./rpc.sh 'balance' | python3 -c "
import json,sys
for b in json.load(sys.stdin)['response']:
    t=b['token']
    if isinstance(t,dict) and t.get('name')=='LOCKPROBE': print(b['tokenid'])")
  [ -n "$TID" ] && break; /bin/sleep 20
done
[ -z "$TID" ] && { echo "FAIL: token never appeared"; exit 1; }
echo "tokenid: $TID"

COIN=""; SENT=""
for i in $(seq 1 25); do
  read -r COIN SENT ADDR <<< $(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
cs=json.load(sys.stdin)['response']
if cs:
    c=cs[0]
    s0=next((s['data'] for s in c['state'] if s['port']==0),'MISSING')
    print(c['coinid'], s0, c['address'])")
  [ -n "$COIN" ] && break; /bin/sleep 20
done
echo "mint coin: $COIN | sentinel state0: $SENT | addr: $ADDR"
[ "$SENT" != "0" ] && { echo "FAIL: sentinel state missing on mint coin"; exit 1; }
echo "=== SENTINEL OK"

post_txn() { # id; steps piped via args after
  local ID=$1; shift
  ./rpc.sh "txndelete id:$ID" >/dev/null; ./rpc.sh "txncreate id:$ID" >/dev/null
  for CMDLINE in "$@"; do
    R=$(./rpc.sh "$CMDLINE" | python3 -c "import json,sys;d=json.load(sys.stdin);print('OK' if d['status'] else d.get('error',''))")
    [ "$R" != "OK" ] && echo "  step failed: $R ($CMDLINE)"
  done
  ./rpc.sh "txnbasics id:$ID" >/dev/null
  ./rpc.sh "txnpost id:$ID" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  post:','OK' if d['status'] else d.get('error',''))"
  ./rpc.sh "txndelete id:$ID" >/dev/null
}

if [ "$ADDR" != "$CREATOR" ]; then
  echo "=== 2. move to creator addr (sentinel preserved)"
  post_txn mv "txninput id:mv coinid:$COIN" \
    "txnoutput id:mv amount:2 address:$CREATOR tokenid:$TID storestate:true" \
    "txnstate id:mv port:0 value:0" \
    "txnsign id:mv publickey:auto" "txnsign id:mv publickey:$CPK"
  for i in $(seq 1 25); do
    read -r COIN SENT ADDR <<< $(./rpc.sh "coins relevant:true tokenid:$TID address:$CREATOR" | python3 -c "
import json,sys
cs=json.load(sys.stdin)['response']
if cs:
    c=cs[0]
    s0=next((s['data'] for s in c['state'] if s['port']==0),'MISSING')
    print(c['coinid'], s0, c['address'])")
    [ -n "$COIN" ] && break; /bin/sleep 20
  done
  echo "moved coin: $COIN state0=$SENT"
fi

echo "=== 3. split 2 -> 1+1 (creator path, sentinel outputs)"
post_txn sp "txninput id:sp coinid:$COIN" \
  "txnoutput id:sp amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnoutput id:sp amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnstate id:sp port:0 value:0" \
  "txnsign id:sp publickey:auto"

U1=""; U2=""
for i in $(seq 1 25); do
  read -r U1 U2 <<< $(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
cs=[c for c in json.load(sys.stdin)['response'] if c.get('tokenamount')=='1']
if len(cs)>=2: print(cs[0]['coinid'], cs[1]['coinid'])")
  [ -n "$U2" ] && break; /bin/sleep 20
done
echo "unit coins: $U1 / $U2"
[ -z "$U2" ] && { echo "FAIL: split did not confirm"; exit 1; }
echo "=== SPLIT OK (creator path works with sentinel)"

echo "=== 4. stamp coin1 as item #1"
post_txn st "txninput id:st coinid:$U1" \
  "txnoutput id:st amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnstate id:st port:0 value:1" \
  "txnsign id:st publickey:auto"

S1=""
for i in $(seq 1 25); do
  S1=$(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
for c in json.load(sys.stdin)['response']:
    s0=next((s['data'] for s in c['state'] if s['port']==0),None)
    if s0=='1': print(c['coinid'])")
  [ -n "$S1" ] && break; /bin/sleep 20
done
[ -z "$S1" ] && { echo "FAIL: stamp did not confirm"; exit 1; }
echo "stamped coin: $S1"
echo "=== STAMP OK"

echo "=== 5. IMMUTABILITY TEST: creator re-stamp of stamped coin (state 1 -> 2) MUST FAIL"
post_txn evil "txninput id:evil coinid:$S1" \
  "txnoutput id:evil amount:1 address:$CREATOR tokenid:$TID storestate:true" \
  "txnstate id:evil port:0 value:2" \
  "txnsign id:evil publickey:auto" "txnsign id:evil publickey:$CPK"

START=$(./rpc.sh 'block' | python3 -c "import json,sys;print(json.load(sys.stdin)['response']['block'])")
while true; do
  NOW=$(./rpc.sh 'block' | python3 -c "import json,sys;print(json.load(sys.stdin)['response']['block'])")
  STILL=$(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
print('yes' if any(c['coinid']=='$S1' for c in json.load(sys.stdin)['response']) else 'no')")
  if [ "$STILL" = "no" ]; then echo "!!! IMMUTABILITY BROKEN: creator altered a stamped coin"; exit 1; fi
  [ $((NOW-START)) -ge 5 ] && { echo "=== IMMUTABILITY HOLDS: re-stamp rejected after $((NOW-START)) blocks"; break; }
  /bin/sleep 30
done

echo "=== 6. preserve-transfer of stamped coin to A2 MUST PASS"
post_txn xf "txninput id:xf coinid:$S1" \
  "txnoutput id:xf amount:1 address:$A2 tokenid:$TID storestate:true" \
  "txnstate id:xf port:0 value:1" \
  "txnsign id:xf publickey:auto"
for i in $(seq 1 25); do
  AT2=$(./rpc.sh "coins relevant:true tokenid:$TID address:$A2" | python3 -c "
import json,sys
cs=json.load(sys.stdin)['response']
print(cs[0]['coinid'] if cs else '')")
  [ -n "$AT2" ] && { echo "=== PRESERVE-TRANSFER OK: at A2 as $AT2"; break; }
  /bin/sleep 20
done
[ -z "$AT2" ] && { echo "FAIL: preserve-transfer did not confirm"; exit 1; }

echo ""
echo "=========================================="
echo "LOCKED-EDITION CONTRACT FULLY PROVEN:"
echo " sentinel mint OK / split OK / stamp OK"
echo " creator CANNOT alter stamped identity"
echo " preserve-transfer works"
echo "tokenid: $TID"