#!/usr/bin/env python3
"""Bury an unwanted StateNFT collection: send every owned coin to the
public graveyard (the RETURN FALSE address - provably unspendable forever).

Usage: ./bury.py <tokenid> CONFIRM-<exact collection name> [--force]

Safeguards: the literal CONFIRM-<name> token is required; web-validated
collections are refused without --force. THIS IS IRREVERSIBLE.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request

RPC = "http://127.0.0.1:4446/"
GRAVEYARD = "0xABA005476D2B3CD7F251B9783E64C124C9670BB358695F04D91B2057BB64CB49"


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
    args = [a for a in sys.argv[1:] if a != "--force"]
    force = "--force" in sys.argv
    if len(args) != 2 or not args[1].startswith("CONFIRM-"):
        sys.exit(__doc__)
    tid, confirm_name = args[0], args[1][len("CONFIRM-"):]

    t = rpc_ok(f"tokens tokenid:{tid}")["response"]
    name = t["name"]["name"] if isinstance(t["name"], dict) else str(t["name"])
    if name != confirm_name:
        sys.exit(f"REFUSED: confirm token says '{confirm_name}' but the "
                 f"collection is named '{name}'.")

    v = rpc_ok(f"tokenvalidate tokenid:{tid}")["response"]
    if v.get("web", {}).get("valid") and not force:
        sys.exit("REFUSED: this collection is WEB-VALIDATED (it carries your "
                 "verified shield). If you truly mean it, add --force.")

    coins = rpc_ok(f"coins relevant:true tokenid:{tid}")["response"]
    if not coins:
        sys.exit("Nothing to bury - you hold no coins of this collection.")

    print(f"Burying {len(coins)} coin(s) of '{name}' at the graveyard. "
          f"IRREVERSIBLE. Starting in 5s (Ctrl-C to abort)...")
    time.sleep(5)

    # creator pk (for unstamped-coin bypass under either contract generation)
    m = re.search(r"SIGNEDBY\((0x[0-9A-Fa-f]+)\)", t.get("script", ""))
    creator_pk = m.group(1) if m else None

    for c in coins:
        cid = c["coinid"]
        s0 = next((str(s["data"]) for s in c.get("state", [])
                   if s["port"] == 0), None)
        stamped = s0 is not None and s0 != "0"
        txn = f"bury{int(time.time() * 1000) % 100000}"

        def attempt(preserve):
            rpc(f"txndelete id:{txn}")
            rpc_ok(f"txncreate id:{txn}")
            rpc_ok(f"txninput id:{txn} coinid:{cid}")
            rpc_ok(f"txnoutput id:{txn} amount:{c['tokenamount']} "
                   f"address:{GRAVEYARD} tokenid:{tid} "
                   f"storestate:{'true' if preserve else 'false'}")
            if preserve:
                for s in c.get("state", []):
                    rpc_ok(f"txnstate id:{txn} port:{s['port']} value:{s['data']}")
            rpc_ok(f"txnsign id:{txn} publickey:auto")
            if creator_pk and (not preserve or not stamped):
                rpc_ok(f"txnsign id:{txn} publickey:{creator_pk}")
            rpc_ok(f"txnbasics id:{txn}")
            rpc_ok(f"txnpost id:{txn}")

        # State we cannot safely replay (malformed, or hostile on a legacy
        # collection) is buried stripped rather than echoed back to the node.
        replayable = all(
            re.fullmatch(r"[0-9]+", str(s["port"])) and safe_state_value(s["data"])
            for s in c.get("state", []))
        try:
            if not replayable:
                print(f"  {cid[:18]}... unsafe state - burying stripped")
                attempt(preserve=False)
            else:
                try:
                    attempt(preserve=True)
                except RuntimeError as e:
                    if "size too large" in str(e) and creator_pk:
                        print(f"  {cid[:18]}... oversized state - stripped "
                              f"burial via creator bypass")
                        attempt(preserve=False)
                    else:
                        raise
            print(f"  entombed {cid[:18]}... (item {s0 or 'unstamped'})")
        finally:
            rpc(f"txndelete id:{txn}")

    print("All burial transactions posted. Coins vanish from your wallet as "
          "they confirm; verify with: coins relevant:true tokenid:" + tid)


if __name__ == "__main__":
    main()
