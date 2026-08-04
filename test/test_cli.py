#!/usr/bin/env python3
"""Regression tests for the CLI tools (mint/bury.py, mint/transfer.py).

The CLIs replay coin state into `txnstate ... value:<data>` exactly as the
MiniDapp engine does, so they carry the same guard and it must behave
identically — a divergence between the two would be silent. As in the JS
tests, every guard is asserted in BOTH directions.

Run: python3 test/test_cli.py   (no dependencies, no node connection)
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "mint"))

import bury            # noqa: E402
import transfer        # noqa: E402
import mint as minter  # noqa: E402

FAILURES = []


def check(name, actual, expected):
    ok = actual == expected
    if not ok:
        FAILURES.append(name)
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}"
          + ("" if ok else f"\n         expected {expected!r}, got {actual!r}"))


HOSTILE = [
    ("command parameter injection", "1 port:0 value:99"),
    ("output address redirect", "1 address:0xEVIL"),
    ("newline", "1\nport:0 value:2"),
    ("sql-ish quote", "x' OR 1=1 --"),
    ("unbracketed base64", "/9j/4AAQSkZJRg=="),
    ("bracket with spaces", "[abc def]"),
]
LEGITIMATE = [
    ("item index", "7"),
    ("unstamped sentinel", "0"),
    ("two-digit index", "20"),
    ("bracketed base64 image", "[/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD]"),
    ("empty bracket string", "[]"),
]

print("bury.safe_state_value — hostile state rejected")
for name, value in HOSTILE:
    check(name, bury.safe_state_value(value), False)

print("bury.safe_state_value — state the tools write is accepted")
for name, value in LEGITIMATE:
    check(name, bury.safe_state_value(value), True)

print("transfer.safe_state_value — identical behaviour (no drift)")
for name, value in HOSTILE + LEGITIMATE:
    check(f"agrees on {name}",
          transfer.safe_state_value(value), bury.safe_state_value(value))

print("mint.token_script — contract matches the MiniDapp engine")
CREATOR = "0xC9B6654E90F2163BC66E209F311DCE02F6E201F4AD922A823C67443FBEAFF6BA"
script = minter.token_script(CREATOR)
check("creator bypass gated on the unstamped sentinel",
      "IF s EQ 0 AND SIGNEDBY(" in script, True)
check("content immutability via SAMESTATE", "SAMESTATE(0 0)" in script, True)
check("output preservation via VERIFYOUT",
      "VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)" in script, True)
check("single line (the node rejects stray newlines)", "\n" in script, False)

print("mint.stamped_idx — sentinel and legacy coins count as unstamped")


def coin(*state):
    return {"state": [{"port": p, "data": d} for p, d in state]}


check("sentinel 0 is unstamped", minter.stamped_idx(coin((0, "0"))), None)
check("absent state is unstamped", minter.stamped_idx(coin()), None)
check("index 4 is stamped", minter.stamped_idx(coin((0, "4"))), "4")

print("mint.find_token — signature demands identity, not just a name")
# Guards the bug that bound a collection row to a same-named foreign token
# (two DLNW tokens have existed in this wallet).
import inspect  # noqa: E402
params = list(inspect.signature(minter.find_token).parameters)
check("takes script and size", params[:3], ["name", "script", "size"])
src = inspect.getsource(minter.find_token)
check("raises on ambiguity instead of guessing", "ambiguous" in src, True)
check("compares the on-chain script", 'on_chain.get("script")' in src, True)

if FAILURES:
    print(f"\ntest_cli.py: {len(FAILURES)} FAILED -> {', '.join(FAILURES)}")
    sys.exit(1)
print("\ntest_cli.py: all assertions passed")
