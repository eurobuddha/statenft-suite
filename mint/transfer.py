#!/usr/bin/env python3
"""Transfer a StateNFT, preserving its identity (state port 0).

Usage: ./transfer.py <tokenid> <item-index> <recipient-address>

Finds your coin of the collection whose state port 0 == item-index, then
rebuilds it at the recipient with identical state so the token script's
VERIFYOUT(... keepstate TRUE) check passes.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request

RPC = "http://127.0.0.1:4446/"


def rpc(cmd):
    with urllib.request.urlopen(RPC + urllib.parse.quote(cmd), timeout=90) as r:
        return json.load(r)


def rpc_ok(cmd):
    d = rpc(cmd)
    if not d.get("status"):
        raise RuntimeError(f"{cmd[:80]} -> {d.get('error')}")
    return d

def safe_state_value(v):
    """Coin state is replayed verbatim into `txnstate ... value:<data>`. On
    legacy collections a holder can write arbitrary state, and the node parses
    the command by whitespace - so accept only shapes we ever write: digits, or
    a [base64] bracket string."""
    v = str(v)
    return bool(re.fullmatch(r"[0-9]+", v) or re.fullmatch(r"\[[A-Za-z0-9+/=]*\]", v))


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    tid, idx, to = sys.argv[1], sys.argv[2], sys.argv[3]

    coins = rpc_ok(f"coins relevant:true tokenid:{tid}")["response"]
    coin = next((c for c in coins
                 if any(str(s["data"]) == idx and s["port"] == 0
                        for s in c.get("state", []))), None)
    if not coin:
        sys.exit(f"no owned coin with state index {idx}")
    cid = coin["coinid"]
    print(f"item #{idx}: {cid}")

    txn = f"xfer{int(time.time())}"
    try:
        rpc_ok(f"txncreate id:{txn}")
        rpc_ok(f"txninput id:{txn} coinid:{cid}")
        rpc_ok(f"txnoutput id:{txn} amount:1 address:{to} "
               f"tokenid:{tid} storestate:true")
        # the token script demands the ENTIRE state be recreated (keepstate
        # TRUE) - re-issue every state port verbatim (incl. embedded images)
        for s in coin.get("state", []):
            if not re.fullmatch(r"[0-9]+", str(s["port"])) \
                    or not safe_state_value(s["data"]):
                raise RuntimeError(
                    f"refusing to transfer: malformed state at port {s['port']}")
            rpc_ok(f"txnstate id:{txn} port:{s['port']} value:{s['data']}")
        rpc_ok(f"txnsign id:{txn} publickey:auto")
        rpc_ok(f"txnbasics id:{txn}")
        rpc_ok(f"txnpost id:{txn}")
    finally:
        rpc(f"txndelete id:{txn}")

    print("posted - waiting for on-chain confirmation (txnpost status alone "
          "cannot be trusted)...")
    for _ in range(30):
        time.sleep(20)
        cs = rpc_ok(f"coins relevant:true tokenid:{tid}")["response"]
        if not any(c["coinid"] == cid for c in cs):
            print(f"CONFIRMED: item #{idx} transferred to {to}")
            return
        print("  still unspent...")
    sys.exit("NOT CONFIRMED after ~10 min - spend likely rejected by token script")


if __name__ == "__main__":
    main()
