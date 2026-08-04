#!/bin/bash
# Probe: how many token outputs fit per txn when metadata carries a ~6.5KB icon?
cd "$(dirname "$0")"
CPK=0xC9B6654E90F2163BC66E209F311DCE02F6E201F4AD922A823C67443FBEAFF6BA
CREATOR=0xC1242210B61A89918C9F17340DB263A4479A0A7E89413B4DEFC6B6396DD054CD

TID=""
for i in $(seq 1 20); do
  TID=$(./rpc.sh 'balance' | python3 -c "
import json,sys
for b in json.load(sys.stdin)['response']:
    t=b['token']
    if isinstance(t,dict) and t.get('name')=='ICONPROBE': print(b['tokenid'])")
  [ -n "$TID" ] && break
  /bin/sleep 20
done
[ -z "$TID" ] && { echo "PROBE FAIL: token never appeared"; exit 1; }
echo "probe tokenid: $TID"

COIN=""
for i in $(seq 1 20); do
  COIN=$(./rpc.sh "coins relevant:true tokenid:$TID" | python3 -c "
import json,sys
cs=json.load(sys.stdin)['response']
print(cs[0]['coinid'] if cs else '')")
  [ -n "$COIN" ] && break
  /bin/sleep 20
done
echo "probe coin: $COIN"

for K in 3 2 1; do
  ID=iprobe
  ./rpc.sh "txndelete id:$ID" >/dev/null
  ./rpc.sh "txncreate id:$ID" >/dev/null
  ./rpc.sh "txninput id:$ID coinid:$COIN" >/dev/null
  for j in $(seq 1 $K); do
    ./rpc.sh "txnoutput id:$ID amount:1 address:$CREATOR tokenid:$TID storestate:false" >/dev/null
  done
  REST=$((3-K))
  [ $REST -gt 0 ] && ./rpc.sh "txnoutput id:$ID amount:$REST address:$CREATOR tokenid:$TID storestate:false" >/dev/null
  ./rpc.sh "txnsign id:$ID publickey:auto" >/dev/null
  ./rpc.sh "txnsign id:$ID publickey:$CPK" >/dev/null
  ./rpc.sh "txnbasics id:$ID" >/dev/null
  R=$(./rpc.sh "txnpost id:$ID" | python3 -c "import json,sys;d=json.load(sys.stdin);print('OK' if d['status'] else d.get('error',''))")
  ./rpc.sh "txndelete id:$ID" >/dev/null
  echo "split with $K unit-outputs: $R"
  if [ "$R" = "OK" ]; then echo "RESULT: $K unit outputs fit with 2 sigs + 6.5KB icon metadata"; break; fi
done