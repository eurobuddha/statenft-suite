#!/usr/bin/env python3
"""Mint a Minima NFT collection: ONE tokenid, per-coin state identity.

Reads collection.json, then:
  1. tokencreate  - N indivisible units, collection metadata, enforcement script
  2. split        - break the minted coin into N single-unit coins (creator-signed)
  3. stamp        - one txn per coin, writing state port 0 = item index (1..N)

Resume-safe: re-running skips completed phases (detected from chain state).
Usage: ./mint.py [collection.json]
"""
import json
import sys
import time
import urllib.parse
import urllib.request

RPC = "http://127.0.0.1:4446/"
POLL_SECS = 20
POLL_MAX = 60  # 60 * 20s = 20 min ceiling per wait


def rpc(cmd):
    url = RPC + urllib.parse.quote(cmd)
    with urllib.request.urlopen(url, timeout=90) as r:
        return json.load(r)


def rpc_ok(cmd):
    d = rpc(cmd)
    if not d.get("status"):
        raise RuntimeError(f"RPC failed: {cmd[:80]} -> {d.get('error')}")
    return d


def wait_for(desc, fn):
    """Poll fn() until it returns a truthy value."""
    for i in range(POLL_MAX):
        v = fn()
        if v:
            return v
        print(f"  waiting for {desc} ({i+1})...", flush=True)
        time.sleep(POLL_SECS)
    raise RuntimeError(f"Timed out waiting for {desc}")


def token_script(creator_pubkey):
    # Locked edition: creator bypass only while unstamped (state 0 == 0);
    # once stamped, SAMESTATE makes content immutable forever. (VERIFYOUT's
    # keepstate only checks the flag, NOT content - proven on-chain.)
    # mint.py is url-mode (stamps port 0 only) -> SAMESTATE(0 0).
    return (f"LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY({creator_pubkey}) "
            f"THEN RETURN TRUE ENDIF "
            f"RETURN SAMESTATE(0 0) AND "
            f"VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)")


def find_token(name, script=None, size=None):
    """Find OUR minted token. Names are not unique (two DLNW tokens have
    existed) and anyone can mint a same-named token and send it to us, so a
    candidate must also carry our exact enforcement script. Ambiguity is an
    error, never a guess."""
    matches = []
    for b in rpc_ok("balance")["response"]:
        t = b.get("token")
        if not isinstance(t, dict) or t.get("name") != name:
            continue
        if size is not None and str(t.get("size")) != str(size):
            continue
        if script is not None:
            on_chain = rpc_ok(f"tokens tokenid:{b['tokenid']}")["response"]
            if (on_chain.get("script") or "") != script:
                continue
        matches.append(b["tokenid"])
    if len(matches) > 1:
        raise RuntimeError(
            f"ambiguous: {len(matches)} tokens named '{name}' match this "
            f"collection - resolve manually before re-running")
    return matches[0] if matches else None


def token_coins(tid):
    return rpc_ok(f"coins relevant:true tokenid:{tid}")["response"]


def state0(coin):
    for s in coin.get("state", []):
        if s["port"] == 0:
            return str(s["data"])
    return None


def stamped_idx(coin):
    """Item index if stamped; None for unstamped ('0' sentinel or no state)."""
    s = state0(coin)
    return s if (s is not None and s != "0") else None


def post_txn(txnid, build_steps):
    """Run build steps, verify balanced, sign/basics/post. Cleans up on error."""
    rpc(f"txndelete id:{txnid}")
    rpc_ok(f"txncreate id:{txnid}")
    try:
        signs = []
        for step in build_steps:
            if step.startswith("txnsign"):
                signs.append(step)      # sign AFTER balance check
            else:
                rpc_ok(step)
        chk = rpc_ok(f"txncheck id:{txnid}")["response"]
        coins = chk.get("coins", [])
        if not coins or any(c["difference"] != "0" for c in coins):
            raise RuntimeError(f"unbalanced txn {txnid}: {coins}")
        for s in signs:
            rpc_ok(s)
        rpc_ok(f"txnbasics id:{txnid}")
        rpc_ok(f"txnpost id:{txnid}")
    finally:
        rpc(f"txndelete id:{txnid}")


def main():
    cfg_path = sys.argv[1] if len(sys.argv) > 1 else "collection.json"
    cfg = json.load(open(cfg_path))
    name, size = cfg["name"], int(cfg["size"])
    creator_pk = cfg["creator_pubkey"]
    creator_addr = cfg["creator_address"]
    script = token_script(creator_pk)

    # ---- Phase 1: tokencreate ----------------------------------------------
    tid = find_token(name, script, size)
    if tid:
        print(f"[1/3] token already exists: {tid}")
    else:
        meta = {
            "name": name,
            "description": cfg.get("description", ""),
            "owner": cfg.get("owner", ""),
            "base": cfg["base"],
            "ext": cfg.get("ext", ".png"),
            "size": size,
        }
        if cfg.get("external_url"):
            meta["external_url"] = cfg["external_url"]
        cmd = (f"tokencreate name:{json.dumps(meta, separators=(',', ':'))} "
               f"amount:{size} decimals:0 script:\"{script}\" "
               f"state:{{\"0\":\"0\"}} "
               f"signtoken:{creator_pk}")
        if cfg.get("webvalidate"):
            cmd += f" webvalidate:{cfg['webvalidate']}"
        print(f"[1/3] minting '{name}' x{size}...")
        rpc_ok(cmd)
        tid = wait_for("token in balance",
                       lambda: find_token(name, script, size))
        print(f"      tokenid: {tid}")
    wait_for("mint coin confirmed", lambda: token_coins(tid))

    # ---- Phase 2a: move mint coin to creator address -------------------------
    # From the creator address, publickey:auto IS the creator key, so every
    # later txn carries ONE signature instead of two (signatures dominate the
    # 64KB TxPoW size limit).
    coins = token_coins(tid)
    stray = [c for c in coins if c["address"] != creator_addr]
    if stray:
        print("[2/3] moving mint coin to creator address...")
        for c in stray:
            n = c["tokenamount"]
            steps = [
                f"txninput id:move coinid:{c['coinid']}",
                f"txnoutput id:move amount:{n} address:{creator_addr} "
                f"tokenid:{tid} storestate:true",
                "txnstate id:move port:0 value:0",
                "txnsign id:move publickey:auto",
                f"txnsign id:move publickey:{creator_pk}",
            ]
            post_txn("move", steps)
        wait_for("move to confirm",
                 lambda: all(c["address"] == creator_addr
                             for c in token_coins(tid)))

    # ---- Phase 2b: split into unit coins ------------------------------------
    print("[2/3] splitting into unit coins...")

    def split_coin(coin, k):
        """Split into k units (+change). Halves k on TxPoW-size errors."""
        n = int(float(coin["tokenamount"]))
        while True:
            k = min(k, n)
            steps = [f"txninput id:split coinid:{coin['coinid']}"]
            for _ in range(k):
                steps.append(f"txnoutput id:split amount:1 address:{creator_addr} "
                             f"tokenid:{tid} storestate:true")
            if n - k:
                steps.append(f"txnoutput id:split amount:{n - k} "
                             f"address:{creator_addr} tokenid:{tid} storestate:true")
            steps.append("txnstate id:split port:0 value:0")
            steps.append("txnsign id:split publickey:auto")
            try:
                print(f"      split {n} -> {k}x1" + (f" + {n - k}" if n - k else ""))
                post_txn("split", steps)
                return
            except RuntimeError as e:
                if "size too large" in str(e) and k > 1:
                    k //= 2
                    print(f"      txn too large, retrying with {k} outputs")
                    continue
                raise

    split_cap = 8
    while True:
        coins = token_coins(tid)
        units = [c for c in coins if c.get("tokenamount") == "1"]
        big = [c for c in coins if int(float(c.get("tokenamount", "0"))) > 1]
        if len(units) >= size and not big:
            break
        if not big:
            time.sleep(POLL_SECS)
            continue
        spent = [c["coinid"] for c in big]
        for c in big:
            split_coin(c, split_cap)
        wait_for("split round to confirm",
                 lambda: not any(x["coinid"] in spent for x in token_coins(tid)))

    # ---- Phase 3: stamp identities ------------------------------------------
    print("[3/3] stamping identities...")
    pending = set()  # coinids with an unconfirmed stamp posted
    while True:
        coins = token_coins(tid)
        used = {stamped_idx(c) for c in coins if stamped_idx(c)}
        if len(used) >= size:
            break
        live = {c["coinid"] for c in coins}
        pending &= live  # a pending coin that vanished has confirmed (spent)
        blank = [c for c in coins if c.get("tokenamount") == "1"
                 and not stamped_idx(c) and c["coinid"] not in pending]
        if not blank:
            print(f"      {len(used)}/{size} stamped, waiting for confirmations...")
            time.sleep(POLL_SECS)
            continue
        nxt = (i for i in range(1, size + 1) if str(i) not in used)
        for c in blank:
            idx = next(nxt, None)
            if idx is None:
                break
            steps = [
                f"txninput id:stamp{idx} coinid:{c['coinid']}",
                f"txnoutput id:stamp{idx} amount:1 address:{creator_addr} "
                f"tokenid:{tid} storestate:true",
                f"txnstate id:stamp{idx} port:0 value:{idx}",
                f"txnsign id:stamp{idx} publickey:auto",
            ]
            print(f"      stamping #{idx} on {c['coinid'][:18]}...")
            post_txn(f"stamp{idx}", steps)
            pending.add(c["coinid"])
        time.sleep(POLL_SECS)

    # ---- Summary -------------------------------------------------------------
    coins = token_coins(tid)
    print(f"\nDONE. Collection '{name}' tokenid: {tid}")
    for c in sorted(coins, key=lambda c: int(stamped_idx(c) or 0)):
        print(f"  #{stamped_idx(c)}  {c['coinid']}  image: {cfg['base']}{stamped_idx(c)}{cfg.get('ext', '.png')}")
    result = {"tokenid": tid, "script": script,
              "items": {stamped_idx(c): c["coinid"] for c in coins}}
    json.dump(result, open("mint-result.json", "w"), indent=2)
    print("written: mint-result.json")


if __name__ == "__main__":
    main()
