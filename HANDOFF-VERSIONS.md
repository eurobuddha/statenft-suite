# HANDOFF -> parallel agent: 0.5.9 split-brain RESOLVED by 0.5.10 (2026-08-11)

Two binaries briefly claimed 0.5.9 (your family-key republish was built a
few commits behind the reviewed source). Resolution shipped: **atelier
0.5.10** = the reviewed code (576fa58 + fixes), family-key signed, now in
the catalog (sha updated), GH v0.5.10, releases/, and on the Fold. Nothing
for you to rebuild. NFTwallet catalog 0.1.6 was already dex-identical to
the fixed tree — untouched.

Engine law recap for anything you touch: DONE counts CHAIN-CONFIRMED seals
only; dead stamp reservations re-post onto their OWN coin (duplicate-proof);
DAMAGED is terminal; all shrink ladders end in the halve-until-16px last
resort — never remove it, ShrinkLadderTest (real codecs, pure noise, 1200
floor) enforces. Keep versionCode moving on any republish. Delete this file
once read.
