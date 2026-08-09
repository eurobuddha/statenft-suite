# HANDOFF → the 0.4.9 agent: the JOINT transfer budget (read before releasing)

**From the session that shipped 0.4.2–0.4.6 / MDS 4.1.2–4.1.4 · 2026-08-09 evening.**

## Why this commit exists

Your photo-pack budget raise (`b511d74`, images 8192 → 16000) reopened the
unsendable-NFT bug through the second term of a constraint neither of us had
written down. The user's collection **"Random"** (MDS 4.1.5, photo pack) is
sealed and permanently untransferable — verified on-chain:

- token record (definition): **14,587 B** — icon + traits, immutable
- image states: 12,122–14,850 B
- a sealed transfer carries the record TWICE and the image TWICE + ~12K sig
- → every lot computes to **65–71KB against the 64KB TxPoW cap**

The 16000 image budget was only ever spike-proven beside a ~7K record. The
14.5K generative record beside 12–15K images was never possible.

## The rule (now enforced in this commit, both clients)

```
defActual + maxImageB64  ≤  23000     // proven on-chain point: 7000 + 16000
defActual                ≤  17300     // split bound (3 records + sig at unit+change)
defActual = len(exact tokencreate metadata JSON) + 533   // measured wrapper, no estimates
```

`533` is `fullDef − len(metaJSON)`, constant across every collection on this
chain. The old estimate-based `estimatedDefLen/DEF_BUDGET (10500)` is GONE.

## What this commit changed (keep all of it in 0.4.9)

- `MintEngine.java`: `TRANSFER_PAIR_BUDGET/DEF_WRAPPER/DEF_SPLIT_MAX`,
  `defActualLen(Meta, traits)`, `jointBudgetError(def, maxImg)`.
- `MainActivity.java`: `sendArtToCollection` slims the icon (4000) or refuses
  using the joint model; the collection-mint click has a final exact gate.
- `AirdropEngine.java`: fetches the record weight once per job (`deflen`) and
  FAILs untransferable entries honestly instead of posting doomed txns.
- `minidapp/art-studio.js`: `artExactMeta/artDefActual/artJointBudgetError`
  replace the estimator; mint guard slims (3500) or refuses with real numbers.
- `minidapp/app.js`: upload lane joint gate in `mintCollection`; `doTransfer`
  pre-checks `2·(def+state)+12000 ≤ 64000` and names burial as the only exit
  for pre-guard victims (Random, both 20-item Minima PUNKS, gretfd are dead).
- `minidapp/sendall.js`: queue rows ERROR honestly when every sealed lot is
  untransferable.
- `StampPlannerTest.java`: joint-model fixtures (Random refuses, spike passes).

## Consequences for YOUR packs

16000-char images now require records ≤ 7000 — i.e. hosted or auto-slimmed
icons and light traits. The guard auto-slims the icon first and only refuses
when that isn't enough, with the real numbers in the message. If the photo
pack wants both fat images AND fat traits, something has to give — that's
chain physics, not policy.

## Versioning (updated after your 0.4.9 / MDS 4.1.7 landed mid-flight)

- Your `aa67a5e` (0.4.9 + MDS 4.1.7, on-device cartoonification) shipped
  WITHOUT this rule — those builds can still mint untransferable lots when a
  heavy record meets 16000-char images. The rule ships in **Android 0.4.10 +
  MDS 4.1.8** (this commit; both archived in releases/, MDS installed on the
  :4446 node). Your next release starts from 0.4.10 / 4.1.8 (?v=418) —
  rebase on this commit and keep every guard.
- NFTwallet still runs the old estimator — port the joint model there in its
  next release (its 16000 images sit exactly at the proven point with ~7.5K
  records, so it's borderline, not broken).

Delete this file once your next release ships on top of 0.4.10/4.1.8 with the rule intact.
