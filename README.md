# StateNFT — Minima NFT collections with ONE tokenid, many images

> **v2 — full suite**: the "StateNFT Suite" MiniDapp (uid `0x2E22FE01…`) now
> creates, mints, views and transfers collections entirely in-app. Two image
> modes: **embedded on-chain** (upload → auto-compressed thumbnail stored in
> each coin's state port 1, ≤8KB base64 so transfers fit the 64KB TxPoW cap
> (raised to 16000 b64 after the 2026-08-05 spike proof — see v4.1.5) —
> transfers carry the image twice: input-coin proof + recreated output state)
> or **hosted URLs**. Minting runs in `service.js` on every new block, so it
> continues with the page closed, self-heals transient errors, and resumes
> from chain state. E2E proven: 3-item embedded collection tokenid
> `0x3C451D33…`, incl. a two-hop transfer (bypass + enforcement path) with the
> embedded image intact at the destination.

Proven on-chain (mainnet node v1.0.48.3, 2026-08-04). A collection of NFTs that
all share a single Minima tokenid, where each coin carries its own image
identity — enforced by consensus so it survives transfers and cannot be
stripped or forged.

> **v3.3 — Locked editions.** New collections use a hardened contract:
> every coin is born with sentinel state `0`; the creator bypass works only
> while unstamped; once stamped, `SAMESTATE` makes the identity content
> immutable **against everyone, creator included** — proven on-chain (index
> tamper and image swap by the creator were both rejected by consensus;
> exact-preserve transfers pass). Discovered en route: `VERIFYOUT`'s
> keepstate parameter checks only the store-state FLAG, not content — so
> pre-3.3 collections (incl. DLNW) prevent identity *removal* but a holder
> could *rewrite* state on coins they hold. Remedy for old collections:
> re-mint as a locked edition.

> **v4.1.5 — Photo Cartoon.** Atelier's Studio № 4 gains a 19th style pack:
> pick a real photo (camera or gallery) and it is center-cropped, quantized
> to 8 flat colors and cartoonized into a tiny pixel SVG — entirely
> on-device; the original photo never leaves the page. The cartoon becomes
> the base for a whole collection: grid 48/40/32, five palette re-lights
> (Natural/Poster/Duotone/Mono/Invert), backgrounds, edge ink, overlays —
> all deterministic and swept by tests. The generative art budget rises to
> 16000 b64 per item (the transfer-proven envelope); the 18 original packs
> stay tuned and test-swept at 8192.

## How it works

Minima tokens are colored coins: token metadata (name/url/description) is fixed
at `tokencreate` for every coin of the tokenid, so per-NFT images cannot live
there. Instead:

1. **One `tokencreate amount:N decimals:0`** → N indivisible units, one tokenid.
   Metadata holds collection-level data: `base` image URL, `ext`, `size`.
2. **Per-coin state = identity.** Each unit coin carries state port 0 = item
   index (1..N). Image URL = `base + index + ext`.
3. **Token script** (immutable, validates every spend of every coin):

   ```
   IF SIGNEDBY(<creator-pubkey>) THEN RETURN TRUE ENDIF
   RETURN VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)
   ```

   Non-creator spends must recreate the coin at the same output index with the
   same amount, tokenid and **identical state** (`keepstate TRUE`). Identity
   travels with the coin; a spend that strips it is rejected by the chain.

### Proven properties (Phase-0 spike, `mint/01-spike.sh`)
- Identity-preserving transfer from a non-creator address: **passes**.
- State-stripping spend: posts with `status:true` but is **rejected on-chain**
  (coin never moves) — never trust `txnpost` status alone.
- Script-token coins show `sendable:0` in the wallet — plain `send` refuses
  them, which protects users from accidentally invalid transfers. All moves go
  through manual txns (MiniDapp / `transfer.py`).
- State is per-TRANSACTION, not per-output → stamping N identities takes N
  transactions (one coin each; parallel-safe).
- TxPoW has a 64KB limit; ~3 token-carrying outputs + 1 signature per txn is
  the practical ceiling. `mint.py` splits adaptively and keeps coins at the
  creator address so one signature covers both coin and token script.

## Tests

```bash
./test/run.sh          # syntax, sanitizers, engine, CLI parity
```

No dependencies and no node connection required. The guards around untrusted
chain metadata and coin state are asserted in **both** directions: hostile
input is rejected *and* the values the app itself writes still pass. That
pairing exists because a release once shipped a sanitizer which blocked every
attack and also silently blocked every legitimate `data:` image URI, degrading
all on-chain artwork to placeholders for two versions. The suite is
mutation-checked - reintroducing that bug, removing the coin-state guard, or
reverting the CLI to name-only token lookup each make it fail.

## Layout

```
mint/
  rpc.sh           curl helper for node RPC (port 4446)
  collection.json  collection config (name, size, base URL, creator keys)
  mint.py          full pipeline: tokencreate -> split -> stamp (resume-safe)
  02-mint.sh       wrapper: ./02-mint.sh [collection.json]
  transfer.py      identity-preserving transfer CLI
  01-spike.sh      record of the on-chain proof
  mint-result.json output of the last mint (tokenid + coinids per item)
minidapp/          "StateNFT Gallery" MiniDapp (installed uid 0x2E22FE01..)
statenft-gallery.mds.zip
```

## Live artifacts

- Test collection **EuroBuddha Collection** (5 items):
  tokenid `0x12310F9E928A36AFA4C8EE6C4E37D7DDC0353E7727CB4F630254F2E56F934293`
- Spike token SPIKE-TEST (3 items, throwaway):
  tokenid `0x3DD7DDFC337412F5D33841AE9364AA2D2BD9F2B9E26368FE17E21120C5514C9E`

## Using it

```bash
# mint a new collection: edit mint/collection.json, then
cd mint && ./02-mint.sh

# transfer item 3 to someone
./transfer.py <tokenid> 3 MxRECIPIENT...

# gallery: open "StateNFT Gallery" in the MiniHub, paste the tokenid
```

Host images at `<base>1.png ... <base>N.png`. The gallery falls back to a
generated placeholder when an image is unreachable.

## Caveats

- The creator key can bypass enforcement forever (it's the mint/stamp escape
  hatch) — the standard "trust the minter" assumption.
- Receivers only see full detail if their node tracks the token; `tokens
  action:import/export` can share token data.
- Third parties' wallets cannot send these NFTs with plain `send` — by design.
  They need this dapp (or any tool that rebuilds state) to transfer.
