#!/bin/bash
# Minima RPC helper — usage: ./rpc.sh 'balance tokenid:0x00'
# URL-encodes the full command string and GETs it against the node RPC port.
RPC_PORT="${MINIMA_RPC_PORT:-4446}"
CMD="$1"
ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$CMD")
curl -s -m 60 "http://127.0.0.1:${RPC_PORT}/${ENC}"
