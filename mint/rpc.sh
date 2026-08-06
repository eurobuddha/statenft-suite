#!/bin/bash
# Minima RPC helper — usage: ./rpc.sh 'balance tokenid:0x00'
# POSTs the raw command as the request body — no URL-encoding step, and no
# risk of request-line length limits on multi-KB txnstate payloads.
RPC_PORT="${MINIMA_RPC_PORT:-4446}"
CMD="$1"
curl -s -m 60 -X POST --data-binary "$CMD" "http://127.0.0.1:${RPC_PORT}/"
