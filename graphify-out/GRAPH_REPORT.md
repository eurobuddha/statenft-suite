# Graph Report - /Users/eurobuddha/Projects/NFT  (2026-08-04)

## Corpus Check
- Corpus is ~17,340 words - fits in a single context window. You may not need a graph.

## Summary
- 169 nodes · 351 edges · 15 communities (11 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.75)
- Token cost: 49,954 input · 4,300 output

## Community Hubs (Navigation)
- Suite UI & Burial Flow
- Mint Engine State Machine
- Dapp Views & Trust Concepts
- Loupe Item Inspector
- CLI Mint Pipeline
- On-Chain Contract Spikes
- MDS Library Layer
- StateNFT Core Concept
- Graveyard Burial CLI
- Transfer CLI
- Phase-0 Spike Record
- Mint Wrapper Script
- Collections View
- RPC Helper Doc

## God Nodes (most connected - your core abstractions)
1. `fillInspector()` - 13 edges
2. `toast()` - 11 edges
3. `showDetail()` - 11 edges
4. `enginePhaseStamp()` - 11 edges
5. `engineEach()` - 10 edges
6. `enginePhaseBury()` - 10 edges
7. `hashChip()` - 9 edges
8. `refreshDetail()` - 9 edges
9. `renderCards()` - 9 edges
10. `engineCmd()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Transfer Modal` --semantically_similar_to--> `transfer.py`  [INFERRED] [semantically similar]
  minidapp/index.html → README.md
- `Graveyard Address (RETURN FALSE)` --conceptually_related_to--> `StateNFT Token Script (KISS VM)`  [INFERRED]
  minidapp/index.html → README.md
- `Provenance Ledger` --conceptually_related_to--> `StateNFT Token Script (KISS VM)`  [INFERRED]
  minidapp/index.html → README.md
- `Certificate of Identity` --conceptually_related_to--> `Per-Coin State Identity`  [INFERRED]
  minidapp/index.html → README.md
- `Create Collection Wizard` --conceptually_related_to--> `TxPoW 64KB Limit`  [INFERRED]
  minidapp/index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Consensus-Enforced NFT Identity** — readme_token_script, readme_per_coin_state, readme_samestate, readme_locked_editions [EXTRACTED 1.00]
- **Mint Pipeline (create-split-stamp)** — readme_mint_py, readme_02_mint_sh, readme_collection_json, readme_service_js, minidapp_index_mint_progress [INFERRED 0.85]
- **StateNFT Suite UI Views** — minidapp_index_collections_view, minidapp_index_create_wizard, minidapp_index_detail_view, minidapp_index_inspector [EXTRACTED 1.00]

## Communities (15 total, 4 thin omitted)

### Community 0 - "Suite UI & Burial Flow"
Cohesion: 0.11
Nodes (35): attachShield(), buryGo(), checkValidation(), closeBuryModal(), closeModal(), collectionCard(), compressImage(), doTransfer() (+27 more)

### Community 1 - "Mint Engine State Machine"
Cohesion: 0.25
Nodes (25): engineAdopt(), engineAdoptOne(), engineBackfillCreator(), engineCmd(), engineDetectBuried(), engineEach(), engineInitTables(), engineMarkPending() (+17 more)

### Community 2 - "Dapp Views & Trust Concepts"
Cohesion: 0.11
Nodes (23): Bury Modal (The Graveyard), Certificate of Identity, Create Collection Wizard, Detail View (Catalogue Raisonne), Graveyard Address (RETURN FALSE), The Loupe Item Inspector, Mint Progress Rail, Recovered Collection Image Resume (+15 more)

### Community 3 - "Loupe Item Inspector"
Cohesion: 0.25
Nodes (18): closeInspector(), coinImage(), copyText(), fillInspector(), hashChip(), inspectorKeys(), inspectorZoom(), inspNav() (+10 more)

### Community 4 - "CLI Mint Pipeline"
Cohesion: 0.29
Nodes (13): find_token(), main(), post_txn(), Poll fn() until it returns a truthy value., Item index if stamped; None for unstamped ('0' sentinel or no state)., Run build steps, verify balanced, sign/basics/post. Cleans up on error., rpc(), rpc_ok() (+5 more)

### Community 5 - "On-Chain Contract Spikes"
Cohesion: 0.23
Nodes (8): icon-probe.sh script, jq_status(), post_txn(), lock-spike2.sh script, jq_status(), post_txn(), lock-spike.sh script, rpc.sh script

### Community 6 - "MDS Library Layer"
Cohesion: 0.27
Nodes (5): httpPostAsync(), httpPostAsyncPoll(), MDSPostMessage(), PollListener(), postMDSFail()

### Community 7 - "StateNFT Core Concept"
Cohesion: 0.29
Nodes (7): app.js (script include), engine.js (script include), mds.js (script include), StateNFT Suite Page, EuroBuddha Collection (Live Artifact), StateNFT, StateNFT Suite MiniDapp

### Community 8 - "Graveyard Burial CLI"
Cohesion: 1.00
Nodes (3): main(), rpc(), rpc_ok()

### Community 9 - "Transfer CLI"
Cohesion: 1.00
Nodes (3): main(), rpc(), rpc_ok()

## Knowledge Gaps
- **14 isolated node(s):** `01-spike.sh script`, `02-mint.sh script`, `SAMESTATE Immutability`, `01-spike.sh (Phase-0 Spike)`, `02-mint.sh` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `service.js Background Minter` connect `Dapp Views & Trust Concepts` to `StateNFT Core Concept`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `01-spike.sh script`, `02-mint.sh script`, `SAMESTATE Immutability` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Suite UI & Burial Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.1141025641025641 - nodes in this community are weakly interconnected._
- **Should `Dapp Views & Trust Concepts` be split into smaller, more focused modules?**
  _Cohesion score 0.1067193675889328 - nodes in this community are weakly interconnected._