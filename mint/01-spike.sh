#!/bin/bash
# Phase-0 spike (RECORD of what was proven on-chain 2026-08-04, node v1.0.48.3).
# All six steps were executed live; results below. Re-run pieces manually if
# you ever need to re-verify — this file is documentation-as-script.
#
# Token: SPIKE-TEST  tokenid 0x3DD7DDFC337412F5D33841AE9364AA2D2BD9F2B9E26368FE17E21120C5514C9E
# Script: IF SIGNEDBY(<creator-pk>) THEN RETURN TRUE ENDIF
#         RETURN VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)
#
# PROVEN:
#  1. tokencreate with token script works; real tokenid comes from `balance`/
#     `tokens`, NOT from the tx response's token.tokenid field.
#  2. Script-token coins show sendable:0 forever (wallet treats them as
#     contract-locked) — plain `send` refuses them; manual txns work. This is
#     wallet-level protection on top of script enforcement.
#  3. Split needs TWO signatures: publickey:auto (input address key) AND
#     publickey:<creator-pk> (token script bypass). Outputs to the creator
#     address so later stamps need only one signature.
#  4. Stamping: one txn per coin (state is per-TRANSACTION — all storestate
#     outputs in a txn share it). state port 0 = item index. Parallel posting
#     of stamps for distinct coins confirms in one block.
#  5. Enforcement path: transfer from a NON-creator address, rebuilding the
#     coin with identical state (txnstate + storestate:true), PASSED on-chain.
#     => VERIFYOUT amount:1 (token units) + @AMOUNT compare consistently.
#  6. Attack path: spend WITHOUT recreating state posted "status:true" but was
#     REJECTED on-chain (coin never moved) — identity cannot be stripped.
#
# The real pipeline lives in mint.py / 02-mint.sh; transfers in transfer.py.
echo "This spike already ran; see comments for the proven results."
echo "Pipeline: ./02-mint.sh | Transfers: ./transfer.py"
