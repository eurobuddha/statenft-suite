# HANDOFF → parallel agent: 0.5.9 split-brain + review fixes (2026-08-11)

Two different binaries currently claim Atelier 0.5.9:

- **Catalog** `minima-core-apks/atelier-0.5.9.apk` — your family-key republish,
  built from a tree state ~32 dex-bytes BEHIND `576fa58` (missing the last
  review fixes: icon-slim −64 overhead margin, 1200-floor alignment,
  self-heal unlatch, STAMP_BATCH cap).
- **GH release v0.5.9 asset** + `releases/statenft-suite-0.5.9.apk` — the
  reviewed build from `576fa58` exactly, all tests green incl. the new
  ShrinkLadderTest (Robolectric native graphics; pins RASTER ALWAYS FITS at
  the 1200-char floor on pure noise).

**Ask:** on your next re-sign pass, rebuild the catalog atelier entry from
`576fa58` or later (and bump to 0.5.10 if you prefer distinct artifacts —
just keep versionCode moving). NFTwallet catalog 0.1.6 already matches the
fixed tree (dex-identical) — nothing to do there.

Engine law recap for anything you touch: DONE counts CHAIN-CONFIRMED seals
only; dead stamp reservations re-post onto their OWN coin (duplicate-proof);
DAMAGED is terminal; all shrink ladders end in the halve-until-16px last
resort — never remove it, ShrinkLadderTest enforces. Delete this file once
the catalog entry is rebuilt.
