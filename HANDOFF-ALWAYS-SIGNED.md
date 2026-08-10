# HANDOFF → all agents: ALWAYS SIGNED, ALWAYS FITS (project law, 2026-08-10)

**User directive, non-negotiable:** every token minted through our apps carries the
creator signature at creation. No unsigned mints. No silent downgrades. Nothing can be
minted that breaks the 64KB cap WITH the signature counted — oversized raster content
is SHRUNK automatically; only unshrinkable content (SVG art) or over-heavy records
refuse, with the real numbers, at design time.

## The law (identical in all three codebases)

```
record R = metaLen + DEF_WRAPPER(533) + DEF_SIGN_WEIGHT(8400)      // sig ALWAYS aboard
(A) split:    metaLen ≤ META_MAX (SPLIT_MAX − 533 − 8400 = 8367)
(B) transfer: imageBudget = PAIR_BUDGET − 533 − 8400 − metaLen
```

- `engineEnvelope`/`imageBudget` is the ONE size authority. UIs compute it FIRST and
  push the budget into the compressors (compressImage/compressBitmap/recompressBase64/
  svgToIconB64/paintB64 — all budget-parameterized).
- `engineJointGate`/`jointGate` returns **sign or error only. The nosign branch is
  DELETED project-wide — never reintroduce it.** Engines append `signtoken:`
  unconditionally; a gate failure is an honest ERROR (unreachable if the UI fitted).
- Single-NFT sign checkboxes are gone (MDS removed; Android chip static; NFTwallet
  locked). Token lanes sign too. Icon fit ladder everywhere: as-picked → slim (2000)
  → none → refuse.

## PAIR_BUDGET recalibration — CRITICAL, read this

**FINAL, PROVEN 2026-08-10** (`mint/pair-budget-spike.sh`, exact-length protocol,
signed 9,935B record, probe token 0xFE900615…): combined record+image of
**20,000 CONFIRMED on-chain; 21,000 / 22,000 / 23,000 / 24,000 all FAILED.**
The old 23000 was never real (the historic 16000-image spike used a ~1K unsigned
record ≈ 17K combined). **PAIR_BUDGET = 19500** (proven pass − 500) is now set in
engine.js, Android MintEngine.java and NFTwallet StateNft.java; the send-time doom
checks compare `def+state > PAIR+1000`. Under it: imageBudget = 10,567 − metaLen.
The photo pack's trace valve is now budget-aware (`ART_PHOTO_MAXRAW` global read by
photoCompose in art.js + asset copy — set by the studio/bridge from the envelope);
the paint capture budget dropped 10200 → 8600. Change NONE of this without a new
ladder run proving a higher ceiling.

## What changed (keep ALL of it)

- MDS: engine.js (envelope + sign-only gate + unconditional signtoken), art-studio.js
  (live SIGNED meter, artMaxSignedItems clamp guidance, icon fit ladder, artTraitsMapFor),
  app.js (reshrinkB64, mintCollection auto-shrink, needImagesBudget for the recovery
  lane, single-NFT always-signed + art auto-shrink, token lane signed + icon slim,
  provenance label explains legacy unsigned), index.html (n-sign checkbox removed).
- Android: MintEngine (META_MAX/imageBudget/jointGate sign-only, defActualLen counts
  the sig, unconditional signtoken), MainActivity (mint-click envelope + createImages
  auto-shrink, handoff icon ladder, singles forced-sign + art shrink, token signed +
  icon slim, static sign chip), StampPlannerTest updated.
- NFTwallet: StateNft (META_MAX/imageBudget/jointGate sign-only, defActualLen + sig),
  MintEngine unconditional signtoken, MintView (collection icon ladder, singles locked
  checkbox + bound both editions cases, token signed + record gate), DefBudgetTest
  updated.

## Physics honestly stated

Signed image room = PAIR − 8933 − metaLen. Light records keep big images; heavy-trait
20-item packs get small images or fewer items — the studio meter says so BEFORE mint.
If PAIR lands at ~21-22K (probe pending), image room shrinks ~1-2K vs the old belief;
the photo pack's 10.9K plates then require metaLen ≤ PAIR − 8933 − 10900 — keep its
sealed-slots trick and hosted/small icons, or reduce its plate valve.

Delete this file once the next release of each app ships with the law intact and the
calibrated PAIR constant.
