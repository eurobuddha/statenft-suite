/* StateNFT mint engine — shared by service.js (background) and the page.
 * ES5 only: service.js runs in Minima's embedded JS engine (no arrow fns,
 * no template literals, no Promises).
 *
 * State machine per collection row, one tick per new block:
 *   CREATE -> MOVE -> SPLIT -> STAMP -> DONE   (ERROR is terminal until retry)
 *
 * Chain facts this code relies on (proven on-chain):
 *  - real tokenid comes from `balance`, not the tokencreate response
 *  - TxPoW limit 64KB: ~3 token outputs/txn; halve outputs on "size too large"
 *  - coins kept at the creator address need only publickey:auto (creator key)
 *  - state is per-transaction: one stamp txn per item
 *  - embedded images: state port 1 = [<base64>] (bracket string, <=20KB proven)
 */

var ENGINE_PENDING = {};      // coinid -> block height when we spent it
var ENGINE_PENDING_TTL = 6;   // re-attempt a spend after this many blocks
var ENGINE_CREATE_TIMEOUT = 20;  // blocks before an unconfirmed mint is retried
var engineBoundTokenids = {};    // tokenids already claimed by a collection row

/* The NFT Graveyard: address of the KISS script "RETURN FALSE" — provably
 * unspendable forever (derived on-node; deterministic; anyone can verify with
 * runscript). Coins sent here are entombed with their identity intact. */
var GRAVEYARD = "0xABA005476D2B3CD7F251B9783E64C124C9670BB358695F04D91B2057BB64CB49";

/* Locked-edition contract (v3.3+): every coin carries state port 0 from birth
 * (0 = unstamped sentinel). The creator bypass works ONLY while s==0; once
 * stamped (s>=1) full-state preservation is the only spend — for everyone,
 * creator included, forever. (Reading an ABSENT state port kills a KISS
 * script, hence the sentinel.) */
/* CRITICAL, proven on-chain: VERIFYOUT's keepstate param only checks the
 * output's store-state FLAG, not state CONTENT. Content immutability needs
 * SAMESTATE. Range is mode-dependent: embed enforces ports 0-1 (index+image),
 * url enforces port 0 (index) — SAMESTATE over an absent port returns FALSE. */
function engineScript(pk, mode) {
  var range = (mode === "url") ? "0 0" : "0 1";
  return "LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY(" + pk + ") THEN RETURN TRUE ENDIF " +
         "RETURN SAMESTATE(" + range + ") AND " +
         "VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)";
}

/* pre-3.3 collections used this shape (creator bypass unconditional) */
/* Definitive StateNFT fingerprint — either enforcement-script generation.
 * Returns the creator pk, or null for any other token. Metadata shape is
 * NEVER enough (any token can carry mode/size); only the script decides. */
function engineStateNftPk(script) {
  var m = ("" + script).match(/^IF SIGNEDBY\((0x[0-9A-Fa-f]+)\) THEN RETURN TRUE ENDIF RETURN VERIFYOUT\(@INPUT GETOUTADDR\(@INPUT\) @AMOUNT @TOKENID TRUE\)$/) ||
          ("" + script).match(/^LET s=PREVSTATE\(0\) IF s EQ 0 AND SIGNEDBY\((0x[0-9A-Fa-f]+)\) THEN RETURN TRUE ENDIF RETURN SAMESTATE\(0 [01]\) AND VERIFYOUT\(@INPUT GETOUTADDR\(@INPUT\) @AMOUNT @TOKENID TRUE\)$/);
  return m ? m[1] : null;
}

function engineScriptLegacy(pk) {
  return "IF SIGNEDBY(" + pk + ") THEN RETURN TRUE ENDIF " +
         "RETURN VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)";
}

/* stamped = state port 0 present AND >= 1 ("0" is the unstamped sentinel,
 * null/absent is legacy-unstamped) */
function engineStamped(coin) {
  var s0 = engineState(coin, 0);
  return (s0 !== null && s0 !== "0") ? s0 : null;
}

function engineSqlEsc(s) { return ("" + s).replace(/'/g, "''"); }

/* Coin state is replayed verbatim into `txnstate ... value:<data>` when we
 * preserve identity. On legacy collections a holder can write ARBITRARY state
 * (the VERIFYOUT keepstate flaw above), and the node parses that command by
 * whitespace - so a crafted value could inject extra parameters. Accept only
 * shapes we ever write: digits, or a [base64] bracket string. */
function engineSafeStateValue(v) {
  v = "" + v;
  if (/^[0-9]+$/.test(v)) { return true; }
  if (/^\[[A-Za-z0-9+/=]*\]$/.test(v)) { return true; }
  return false;
}

function engineCmd(c, ok, fail) {
  MDS.cmd(c, function (res) {
    if (res.status) { ok(res); }
    else { fail((res.error || "cmd failed") + " :: " + c.substring(0, 80)); }
  });
}

function engineEach(arr, fn, done) {
  var i = -1;
  function next() {
    i++;
    if (i >= arr.length) { done(); return; }
    fn(arr[i], next);
  }
  next();
}

/* Columns added after the original schema. Append here - the loop below runs
 * them in order, so a new migration never adds another callback level. */
var ENGINE_MIGRATIONS = [
  "`origin` varchar(16) DEFAULT 'created'",
  "`icon` clob",
  "`webvalidate` varchar(512)",
  "`externalurl` varchar(512)",
  "`iscreator` int DEFAULT 0",
  "`postedat` int DEFAULT 0",
  "`buriedat` int DEFAULT 0",
  "`itemtraits` clob",
  "`splitunits` int DEFAULT -1",
  "`splitretries` int DEFAULT 0"
];

function engineInitTables(cb) {
  MDS.sql(
    "CREATE TABLE IF NOT EXISTS `collections` (" +
    " `id` bigint auto_increment primary key," +
    " `name` varchar(256) NOT NULL," +
    " `description` varchar(1024)," +
    " `mode` varchar(16) NOT NULL," +          // 'embed' | 'url'
    " `size` int NOT NULL," +
    " `base` varchar(512)," +
    " `ext` varchar(16)," +
    " `tokenid` varchar(80)," +
    " `phase` varchar(16) NOT NULL," +
    " `posted` int DEFAULT 0," +
    " `error` varchar(1024)," +
    " `creatoraddr` varchar(80)," +
    " `creatorpk` varchar(80))",
    function () {
      MDS.sql(
        "CREATE TABLE IF NOT EXISTS `items` (" +
        " `id` bigint auto_increment primary key," +
        " `collectionid` bigint NOT NULL," +
        " `idx` int NOT NULL," +
        " `image` clob," +                     // base64 (embed) or URL (url mode)
        " `coinid` varchar(80))",
        function () {
          engineEach(ENGINE_MIGRATIONS, function (col, next) {
            MDS.sql("ALTER TABLE collections ADD COLUMN IF NOT EXISTS " + col, next);
          }, function () { engineBackfillCreator(cb); });
        });
    });
}

/* Backfill iscreator for rows created before the column existed. Idempotent:
 * only touches rows still at 0 that have a creator pubkey recorded. */
function engineBackfillCreator(cb) {
  MDS.sql("SELECT id, creatorpk FROM collections WHERE iscreator=0 " +
          "AND creatorpk<>''", function (res) {
    engineEach(res.rows || [], function (row, next) {
      engineCmd("keys action:list publickey:" + row.CREATORPK, function (kr) {
        var keys = kr.response && kr.response.keys ? kr.response.keys : kr.response;
        var mine = false;
        if (keys && keys.length) {
          for (var i = 0; i < keys.length; i++) {
            if (keys[i].publickey === row.CREATORPK) { mine = true; }
          }
        }
        if (mine) {
          MDS.sql("UPDATE collections SET iscreator=1 WHERE id=" + row.ID, next);
        } else { next(); }
      }, function () { next(); });
    }, function () { if (cb) { cb(); } });
  });
}

/* ---- adoption: rebuild the collection list from the chain ---------------- */
/* A StateNFT collection is recognizable by its token metadata fingerprint
 * (JSON name object carrying `mode` and `size`). Everything needed to resume
 * an interrupted mint is on-chain except embed-mode images for unstamped
 * items - those collections are parked in phase NEEDIMAGES for the UI. */

/* Detect externally-buried collections (e.g. via the CLI): a DONE row whose
 * tokenid has zero coins in this wallet but coins at the graveyard → BURIED. */
function engineDetectBuried(cb) {
  MDS.sql("SELECT id, tokenid FROM collections WHERE phase='DONE' " +
          "AND tokenid<>''", function (res) {
    engineEach(res.rows || [], function (row, next) {
      engineTokenCoins(row.TOKENID, function (mine) {
        if (mine.length > 0) { next(); return; }
        engineCmd("coins tokenid:" + row.TOKENID + " address:" + GRAVEYARD,
          function (gres) {
            if ((gres.response || []).length > 0) {
              MDS.sql("UPDATE collections SET phase='BURIED' WHERE id=" +
                      row.ID, function () {
                MDS.log("StateNFT: collection " + row.ID + " found at the graveyard -> BURIED");
                next();
              });
            } else { next(); }
          }, function () { next(); });
      }, function () { next(); });
    }, function () { if (cb) { cb(); } });
  });
}

function engineAdopt(cb) {
  MDS.sql("SELECT tokenid FROM collections", function (kres) {
    var known = {};
    var krows = kres.rows || [];
    for (var i = 0; i < krows.length; i++) {
      if (krows[i].TOKENID) { known[krows[i].TOKENID] = true; }
    }
    engineCmd("balance", function (bres) {
      var found = [];
      var bal = bres.response || [];
      for (var j = 0; j < bal.length; j++) {
        var t = bal[j].token;
        // candidate filter: JSON metadata with a size; the definitive check
        // (our token script) happens per-candidate in engineAdoptOne
        if (t && typeof t === "object" && t.size && !known[bal[j].tokenid]) {
          found.push({ tokenid: bal[j].tokenid, meta: t });
        }
      }
      if (found.length) { MDS.log("StateNFT adopt: found " + found.length + " collection(s)"); }
      engineCmd("getaddress", function (ares) {
        var myaddr = ares.response.address;
        engineEach(found, function (f, next) {
          engineAdoptOne(f.tokenid, f.meta, myaddr, next);
        }, function () { engineDetectBuried(cb); });
      }, function () { engineDetectBuried(cb); });
    }, function () { if (cb) { cb(); } });
  });
}

function engineAdoptOne(tid, meta, myaddr, done) {
  engineCmd("tokens tokenid:" + tid, function (tres) {
    var script = "" + (tres.response.script || "");
    var pk = engineStateNftPk(script);
    if (!pk) { done(); return; }       // some other token - not ours
    if (!meta.mode) { meta.mode = meta.base ? "url" : "embed"; }
    function finish(iscreator) {
      engineTokenCoins(tid, function (coins) {
        var stamped = {};
        for (var i = 0; i < coins.length; i++) {
          var idx = engineStamped(coins[i]);
          if (idx !== null) { stamped[idx] = true; }
        }
        var count = 0;
        for (var k in stamped) { if (stamped.hasOwnProperty(k)) { count++; } }
        var size = parseInt(meta.size, 10);
        var phase = "DONE";
        if (count < size && iscreator) {
          phase = (meta.mode === "url") ? "MOVE" : "NEEDIMAGES";
        }
        MDS.sql(
          "INSERT INTO collections (name,description,mode,size,base,ext," +
          "tokenid,phase,posted,creatoraddr,creatorpk,origin,icon) VALUES ('" +
          engineSqlEsc(meta.name) + "','" + engineSqlEsc(meta.description || "") +
          "','" + meta.mode + "'," + size + ",'" + engineSqlEsc(meta.base || "") +
          "','" + engineSqlEsc(meta.ext || "") + "','" + tid + "','" + phase +
          "',1,'" + myaddr + "','" + pk + "','adopted','" +
          engineSqlEsc(meta.url || "") + "')",
          function () {
            MDS.sql("UPDATE collections SET iscreator=" + (iscreator ? 1 : 0) +
                    " WHERE tokenid='" + tid + "'", function () {
              MDS.log("StateNFT adopted '" + meta.name + "' phase " + phase);
              done();
            });
          });
      }, function () { done(); });
    }
    if (!pk) { finish(false); return; }
    engineCmd("keys action:list publickey:" + pk, function (kr) {
      var keys = kr.response && kr.response.keys ? kr.response.keys : kr.response;
      var mine = false;
      if (keys && keys.length) {
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].publickey === pk) { mine = true; }
        }
      }
      finish(mine);
    }, function () { finish(false); });
  }, function () { done(); });
}

/* Build a txn from steps, verify it balances, sign, add proofs, post.
 * steps: array of full command strings; txnsign steps run after txncheck. */
function enginePostTxn(txnid, steps, ok, fail) {
  var signs = [];
  var build = [];
  for (var i = 0; i < steps.length; i++) {
    if (steps[i].indexOf("txnsign") === 0) { signs.push(steps[i]); }
    else { build.push(steps[i]); }
  }
  function bail(e) {
    MDS.cmd("txndelete id:" + txnid, function () {});
    fail(e);
  }
  MDS.cmd("txndelete id:" + txnid, function () {
    engineCmd("txncreate id:" + txnid, function () {
      engineEach(build, function (s, next) {
        engineCmd(s, next, bail);
      }, function () {
        engineCmd("txncheck id:" + txnid, function (res) {
          var coins = res.response.coins || [];
          var bad = coins.length === 0;
          for (var j = 0; j < coins.length; j++) {
            if (coins[j].difference !== "0") { bad = true; }
          }
          if (bad) { bail("unbalanced txn " + txnid); return; }
          engineEach(signs, function (s, next) {
            engineCmd(s, next, bail);
          }, function () {
            engineCmd("txnbasics id:" + txnid, function () {
              engineCmd("txnpost id:" + txnid, function () {
                MDS.cmd("txndelete id:" + txnid, function () {});
                ok();
              }, bail);
            }, bail);
          });
        }, bail);
      });
    }, bail);
  });
}

function engineTokenCoins(tid, cb, fail) {
  engineCmd("coins relevant:true tokenid:" + tid, function (res) {
    cb(res.response || []);
  }, fail);
}

function engineState(coin, port) {
  var st = coin.state || [];
  for (var i = 0; i < st.length; i++) {
    if (st[i].port == port) { return "" + st[i].data; }
  }
  return null;
}

function enginePendingOk(coinid, tip) {
  var at = ENGINE_PENDING[coinid];
  if (at !== undefined && tip - at < ENGINE_PENDING_TTL) { return false; }
  return true;
}

function engineMarkPending(coinid, tip) { ENGINE_PENDING[coinid] = tip; }

/* Drop entries older than the TTL so the map cannot grow for the lifetime of
 * the service process. */
function enginePrunePending(tip) {
  for (var cid in ENGINE_PENDING) {
    if (ENGINE_PENDING.hasOwnProperty(cid) &&
        tip - ENGINE_PENDING[cid] >= ENGINE_PENDING_TTL) {
      delete ENGINE_PENDING[cid];
    }
  }
}

function engineSetPhase(row, phase, cb) {
  MDS.log("StateNFT: collection " + row.ID + " -> " + phase);
  MDS.sql("UPDATE collections SET phase='" + phase + "', error='' " +
          "WHERE id=" + row.ID, function () { if (cb) { cb(); } });
}

function engineSetError(row, err, cb) {
  MDS.log("StateNFT: collection " + row.ID + " ERROR " + err);
  MDS.sql("UPDATE collections SET error='" + engineSqlEsc(err) + "' " +
          "WHERE id=" + row.ID, function () { if (cb) { cb(); } });
}

/* ---- phase handlers ------------------------------------------------------ */

function enginePhaseCreate(row, tip, done) {
  engineCmd("balance", function (res) {
    var bal = res.response || [];
    // Identify OUR freshly minted token by identity, not by name: names are
    // not unique (two DLNW tokens have existed here) and anyone can mint a
    // same-named token and send it to us. Require the exact metadata shape AND
    // our own enforcement script, and refuse to bind when it is ambiguous.
    var want = engineScript(row.CREATORPK, row.MODE);
    var candidates = [];
    for (var i = 0; i < bal.length; i++) {
      var t = bal[i].token;
      if (t && typeof t === "object" && t.name === row.NAME &&
          parseInt(t.size, 10) === row.SIZE && t.mode === row.MODE &&
          !engineBoundTokenids[bal[i].tokenid]) {
        candidates.push(bal[i].tokenid);
      }
    }
    var matches = [];   // per-call, so concurrent rows never share this
    engineEach(candidates, function (cand, next) {
      engineCmd("tokens tokenid:" + cand, function (tres) {
        if (("" + (tres.response.script || "")) === want) { matches.push(cand); }
        next();
      }, function () { next(); });
    }, function () {
      if (matches.length > 1) {
        engineSetError(row, "ambiguous mint: " + matches.length +
          " tokens match this collection - resolve manually", done);
        return;
      }
      if (matches.length === 1) {
        var tid = matches[0];
        MDS.sql("UPDATE collections SET tokenid='" + tid + "' WHERE id=" + row.ID,
          function () { engineSetPhase(row, "MOVE", done); });
        return;
      }
      enginePhaseCreatePost(row, tip, done);
    });
  }, function (e) { engineSetError(row, e, done); });
}

/* ---- the joint-budget gate, at the ENGINE — the last line of defense ----
 * The token signature (signtype/signedby/signature, ~8.4KB) lands in the
 * record AFTER tokencreate, invisible to every client-side estimate: 'Math'
 * passed each UI guard at ~10K visible definition, then signing pushed the
 * real record to 18.4K — past the split bound, sealed forever. The engine
 * now measures the TRUE weights before posting anything: sign when it fits,
 * DROP the signature when that alone saves transferability (the locked
 * script already proves the creator via SIGNEDBY — the token signature is
 * redundant provenance), and refuse honestly when even unsigned cannot
 * travel. No UI path can reach tokencreate around this. */
var ENGINE_DEF_WRAPPER = 533;     // fullDef - len(metaJSON), constant on-chain
var ENGINE_DEF_SIGN = 8400;       // measured signtype+signedby+signature weight
var ENGINE_DEF_SPLIT_MAX = 17300; // 3 records + sig under the 64KB split txn
var ENGINE_PAIR_BUDGET = 23000;   // record + largest image, proven transfer point

function engineJointGate(metaLen, maxImg) {
  var unsigned = metaLen + ENGINE_DEF_WRAPPER;
  var signed = unsigned + ENGINE_DEF_SIGN;
  if (signed <= ENGINE_DEF_SPLIT_MAX && signed + maxImg <= ENGINE_PAIR_BUDGET) {
    return { sign: true, error: null };
  }
  if (unsigned <= ENGINE_DEF_SPLIT_MAX && unsigned + maxImg <= ENGINE_PAIR_BUDGET) {
    return { sign: false, error: null };
  }
  return { sign: false, error: "definition " + unsigned + "B + largest image " +
    maxImg + "B breaks the transfer budget (" + ENGINE_PAIR_BUDGET +
    "B) - hosted icon, lighter traits or fewer items" };
}

function enginePhaseCreatePost(row, tip, done) {
  (function () {
    if (row.POSTED == 1) {
      // tokencreate was sent but the token never appeared. It may have been
      // dropped or rejected (txnpost status cannot be trusted), so retry after
      // a grace period instead of waiting forever with no feedback.
      var waited = tip - (parseInt(row.POSTEDAT, 10) || 0);
      if (!row.POSTEDAT || waited < ENGINE_CREATE_TIMEOUT) { done(); return; }
      MDS.sql("UPDATE collections SET posted=0 WHERE id=" + row.ID, function () {
        engineSetError(row, "tokencreate did not confirm within " +
          ENGINE_CREATE_TIMEOUT + " blocks - retrying", done);
      });
      return;
    }
    var meta = {
      name: row.NAME,
      description: row.DESCRIPTION || "",
      mode: row.MODE,
      size: row.SIZE
    };
    if (row.MODE === "url") { meta.base = row.BASE; meta.ext = row.EXT || ".png"; }
    if (row.ICON) {
      // wallet-visible icon: hosted URL as-is, else <artimage> base64 convention
      meta.url = row.ICON.indexOf("http") === 0 ? row.ICON
                                                : "<artimage>" + row.ICON;
    }
    if (row.EXTERNALURL) { meta.external_url = row.EXTERNALURL; }
    // per-item traits ride the token metadata (idx -> attributes), matching
    // the Android engine — the chain is the trait record, not local SQL
    if (row.ITEMTRAITS) {
      try { meta.traits = JSON.parse(row.ITEMTRAITS); } catch (e) {}
    }
    var metaStr = JSON.stringify(meta);
    MDS.sql("SELECT MAX(LENGTH(image)) AS MX FROM items WHERE collectionid=" +
            row.ID, function (res) {
      var maxImg = 0;
      if (res.rows && res.rows.length) {
        maxImg = parseInt(res.rows[0].MX, 10) || 0;
      }
      var gate = engineJointGate(metaStr.length, maxImg);
      if (gate.error) { engineSetError(row, gate.error, done); return; }
      var cmd = "tokencreate name:" + metaStr +
                " amount:" + row.SIZE + " decimals:0" +
                " script:\"" + engineScript(row.CREATORPK, row.MODE) + "\"" +
                " state:{\"0\":\"0\"}";
      if (gate.sign) { cmd += " signtoken:" + row.CREATORPK; }
      else {
        MDS.log("collection " + row.ID + ": token signature dropped to keep " +
                "the lots transferable - the locked script still proves the creator");
      }
      if (row.WEBVALIDATE) { cmd += " webvalidate:" + row.WEBVALIDATE; }
      engineCmd(cmd, function () {
        MDS.sql("UPDATE collections SET posted=1, postedat=" + tip +
                " WHERE id=" + row.ID, done);
      }, function (e) { engineSetError(row, e, done); });
    });
  })();
}

function enginePhaseMove(row, tip, done) {
  engineTokenCoins(row.TOKENID, function (coins) {
    if (coins.length === 0) { done(); return; }    // mint coin not confirmed yet
    var strays = [];
    for (var i = 0; i < coins.length; i++) {
      if (coins[i].address !== row.CREATORADDR) { strays.push(coins[i]); }
    }
    if (strays.length === 0) { engineSetPhase(row, "SPLIT", done); return; }
    engineEach(strays, function (c, next) {
      if (!enginePendingOk(c.coinid, tip)) { next(); return; }
      engineMarkPending(c.coinid, tip);
      enginePostTxn("mv" + row.ID, [
        "txninput id:mv" + row.ID + " coinid:" + c.coinid,
        "txnoutput id:mv" + row.ID + " amount:" + c.tokenamount +
          " address:" + row.CREATORADDR + " tokenid:" + row.TOKENID +
          " storestate:true",
        "txnstate id:mv" + row.ID + " port:0 value:0",
        "txnsign id:mv" + row.ID + " publickey:auto",
        "txnsign id:mv" + row.ID + " publickey:" + row.CREATORPK
      ], next, function (e) { engineSetError(row, e, next); });
    }, done);
  }, function (e) { engineSetError(row, e, done); });
}

function engineSplitCoin(row, coin, k, ok, fail) {
  var n = parseInt(coin.tokenamount, 10);
  if (k > n) { k = n; }
  var id = "sp" + row.ID;
  var steps = ["txninput id:" + id + " coinid:" + coin.coinid];
  for (var i = 0; i < k; i++) {
    steps.push("txnoutput id:" + id + " amount:1 address:" + row.CREATORADDR +
               " tokenid:" + row.TOKENID + " storestate:true");
  }
  if (n - k > 0) {
    steps.push("txnoutput id:" + id + " amount:" + (n - k) +
               " address:" + row.CREATORADDR + " tokenid:" + row.TOKENID +
               " storestate:true");
  }
  steps.push("txnstate id:" + id + " port:0 value:0");   // sentinel: still unstamped
  steps.push("txnsign id:" + id + " publickey:auto");
  enginePostTxn(id, steps, ok, function (e) {
    if (("" + e).indexOf("size too large") !== -1 && k > 1) {
      engineSplitCoin(row, coin, Math.floor(k / 2), ok, fail);
    } else { fail(e); }
  });
}

function enginePhaseSplit(row, tip, done) {
  engineTokenCoins(row.TOKENID, function (coins) {
    var units = 0;
    var bigs = [];
    for (var i = 0; i < coins.length; i++) {
      var amt = parseInt(coins[i].tokenamount, 10);
      if (amt === 1) { units++; }
      else if (amt > 1) { bigs.push(coins[i]); }
    }
    if (units >= row.SIZE && bigs.length === 0) {
      engineSetPhase(row, "STAMP", done); return;
    }
    /* Honest escalation: three pending cycles with no new units means the
     * chain is rejecting the split by consensus (definition too heavy for the
     * 64KB TxPoW even at unit+change) — surface it and stop hammering.
     * Progress resets the counter, so a slow confirmation self-heals. */
    var readyAny = false;
    for (var bi = 0; bi < bigs.length; bi++) {
      if (enginePendingOk(bigs[bi].coinid, tip)) { readyAny = true; break; }
    }
    if (readyAny && bigs.length > 0) {
      var lastUnits = parseInt(row.SPLITUNITS === undefined ? -1 : row.SPLITUNITS, 10);
      var retries = parseInt(row.SPLITRETRIES || 0, 10);
      if (lastUnits >= 0 && units <= lastUnits) {
        retries++;
        if (retries >= 3) {
          MDS.sql("UPDATE collections SET splitretries=" + retries +
                  " WHERE id=" + row.ID, function () {});
          engineSetError(row, "split cannot fit the chain's 64KB transaction cap - " +
            "this token's definition (icon + traits) is too heavy. Bury this " +
            "collection and re-mint with a lighter icon or fewer traits.", done);
          return;
        }
      } else { retries = 0; }
      row.SPLITRETRIES = retries;
      row.SPLITUNITS = units;
      MDS.sql("UPDATE collections SET splitretries=" + retries +
              ", splitunits=" + units + " WHERE id=" + row.ID, function () {});
    }
    /* Every token-carrying output (and the input) embeds the FULL token
     * definition — icon + per-item traits included. A generative collection's
     * definition runs ~11KB, so a fixed 3-unit batch builds ~55KB+ txns that
     * the node accepts and the chain silently rejects — the split would retry
     * forever with no error. Measure the definition once, size the batch. */
    MDS.cmd("tokens tokenid:" + row.TOKENID, function (tres) {
      var defLen = (tres.status && tres.response)
        ? JSON.stringify(tres.response).length : 12000;
      var batch = engineSplitBatch(defLen);
      engineEach(bigs, function (c, next) {
        if (!enginePendingOk(c.coinid, tip)) { next(); return; }
        engineMarkPending(c.coinid, tip);
        engineSplitCoin(row, c, batch, next,
          function (e) { engineSetError(row, e, next); });
      }, done);
    });
  }, function (e) { engineSetError(row, e, done); });
}

/** Unit outputs per split txn such that (k units + change + input) token
 *  definitions stay within ~40KB — 24KB headroom for signature + proofs under
 *  the 64KB TxPoW cap. Legacy ~7KB definitions keep the proven 3-unit batch;
 *  ~11KB generative definitions drop to 1. */
function engineSplitBatch(defLen) {
  var defs = Math.max(1, Math.floor(40000 / Math.max(1, defLen)));
  return Math.max(1, Math.min(3, defs - 2));
}

function enginePhaseStamp(row, tip, done) {
  engineTokenCoins(row.TOKENID, function (coins) {
    var used = {};
    var blanks = [];
    var stamped = [];
    var bigs = 0;
    for (var i = 0; i < coins.length; i++) {
      var idx = engineStamped(coins[i]);
      if (idx !== null) { used[idx] = true; stamped.push(coins[i]); }
      else if (coins[i].tokenamount === "1") { blanks.push(coins[i]); }
      else if (parseInt(coins[i].tokenamount, 10) > 1) { bigs++; }
    }
    // Record stamped coinids on their item rows. Coin state is written by
    // whoever last spent the coin (legacy collections allow rewriting it), so
    // the index is validated as digits before it reaches SQL.
    engineEach(stamped, function (c, next) {
      var idx = engineStamped(c);
      if (!/^[0-9]+$/.test("" + idx)) { next(); return; }
      MDS.sql("UPDATE items SET coinid='" + engineSqlEsc(c.coinid) +
              "' WHERE collectionid=" + row.ID + " AND idx=" + idx, next);
    }, function () {
      var count = 0;
      for (var u in used) { if (used.hasOwnProperty(u)) { count++; } }
      if (count >= row.SIZE) { engineSetPhase(row, "DONE", done); return; }
      // The 'Waiting for blank unit coins' deadlock (2026-08-10): dropped
      // split txns can rewind the chain AFTER the phase advanced on their
      // unconfirmed outputs, leaving unsealed units inside a fat change coin
      // STAMP never looks at. Chain truth wins: go back and finish splitting.
      if (blanks.length === 0 && bigs > 0) {
        MDS.log("collection " + row.ID +
                ": unsplit units found in STAMP - returning to SPLIT");
        engineSetPhase(row, "SPLIT", done);
        return;
      }

      // next free indices
      var free = [];
      for (var n = 1; n <= row.SIZE; n++) {
        if (!used["" + n]) { free.push(n); }
      }
      engineEach(blanks, function (c, next) {
        if (free.length === 0) { next(); return; }
        if (!enginePendingOk(c.coinid, tip)) { next(); return; }
        var idx = free.shift();
        MDS.sql("SELECT image FROM items WHERE collectionid=" + row.ID +
                " AND idx=" + idx, function (res) {
          var img = (res.rows && res.rows.length) ? res.rows[0].IMAGE : "";
          if (row.MODE === "embed" && !img) {
            // Stamping is irreversible under a locked edition: an item stamped
            // without its image would be permanently imageless. Stop this tick
            // and surface the gap once (free is recomputed from the chain on
            // the next tick, so nothing is lost by clearing it here).
            free.length = 0;
            engineSetError(row, "missing image for item #" + idx +
              " - re-supply it to finish this mint", next);
            return;
          }
          var id = "st" + row.ID + "x" + idx;
          var steps = [
            "txninput id:" + id + " coinid:" + c.coinid,
            "txnoutput id:" + id + " amount:1 address:" + row.CREATORADDR +
              " tokenid:" + row.TOKENID + " storestate:true",
            "txnstate id:" + id + " port:0 value:" + idx
          ];
          if (row.MODE === "embed" && img) {
            steps.push("txnstate id:" + id + " port:1 value:[" + img + "]");
          }
          steps.push("txnsign id:" + id + " publickey:auto");
          engineMarkPending(c.coinid, tip);
          enginePostTxn(id, steps, next,
            function (e) { engineSetError(row, e, next); });
        });
      }, done);
    });
  }, function (e) { engineSetError(row, e, done); });
}

/* NEEDIMAGES can go stale: adoption may have counted mid-mint, or another
 * process may have finished the stamping. Re-check the chain each tick and
 * promote to DONE when every index is actually stamped. */
function enginePhaseNeedImages(row, done) {
  engineTokenCoins(row.TOKENID, function (coins) {
    var used = {};
    for (var i = 0; i < coins.length; i++) {
      var idx = engineStamped(coins[i]);
      if (idx !== null) { used[idx] = true; }
    }
    var count = 0;
    for (var k in used) { if (used.hasOwnProperty(k)) { count++; } }
    if (count >= row.SIZE) { engineSetPhase(row, "DONE", done); }
    else { done(); }
  }, function () { done(); });
}

/* BURY: send every owned coin of the collection to the graveyard, one txn per
 * coin (state is per-transaction). Stamped coins go via the preservation path
 * (owner sig only); unstamped coins add the creator sig for the bypass. */
function enginePhaseBury(row, tip, done) {
  engineTokenCoins(row.TOKENID, function (coins) {
    if (coins.length === 0) {
      // record the burial block: the UI grants a 50-block grace at the
      // graveside, then the row leaves the catalogue for good
      MDS.sql("UPDATE collections SET buriedat=" + tip + " WHERE id=" + row.ID,
        function () { engineSetPhase(row, "BURIED", done); });
      return;
    }
    engineEach(coins, function (c, next) {
      if (!enginePendingOk(c.coinid, tip)) { next(); return; }
      engineMarkPending(c.coinid, tip);
      var id = "by" + row.ID;
      var steps = [
        "txninput id:" + id + " coinid:" + c.coinid,
        "txnoutput id:" + id + " amount:" + c.tokenamount +
          " address:" + GRAVEYARD + " tokenid:" + row.TOKENID +
          " storestate:true"
      ];
      var st = c.state || [];
      var unsafe = false;
      for (var i = 0; i < st.length; i++) {
        if (!/^[0-9]+$/.test("" + st[i].port) ||
            !engineSafeStateValue(st[i].data)) { unsafe = true; break; }
        steps.push("txnstate id:" + id + " port:" + st[i].port +
                   " value:" + st[i].data);
      }
      if (unsafe) {
        // malformed/hostile state - bury it stripped rather than replaying it
        steps = [
          "txninput id:" + id + " coinid:" + c.coinid,
          "txnoutput id:" + id + " amount:" + c.tokenamount +
            " address:" + GRAVEYARD + " tokenid:" + row.TOKENID +
            " storestate:false",
          "txnsign id:" + id + " publickey:auto"
        ];
        if (row.CREATORPK) {
          steps.push("txnsign id:" + id + " publickey:" + row.CREATORPK);
        }
        enginePostTxn(id, steps, next,
          function (e) { engineSetError(row, e, next); });
        return;
      }
      steps.push("txnsign id:" + id + " publickey:auto");
      if (engineStamped(c) === null && row.CREATORPK) {
        steps.push("txnsign id:" + id + " publickey:" + row.CREATORPK);
      }
      enginePostTxn(id, steps, next, function (e) {
        if (("" + e).indexOf("size too large") !== -1 && row.CREATORPK) {
          // oversized state (legacy probe coins): creator-bypass stripped
          // burial — legal only under the legacy contract, small txn
          enginePostTxn(id, [
            "txninput id:" + id + " coinid:" + c.coinid,
            "txnoutput id:" + id + " amount:" + c.tokenamount +
              " address:" + GRAVEYARD + " tokenid:" + row.TOKENID +
              " storestate:false",
            "txnsign id:" + id + " publickey:auto",
            "txnsign id:" + id + " publickey:" + row.CREATORPK
          ], next, function (e2) { engineSetError(row, e2, next); });
        } else { engineSetError(row, e, next); }
      });
    }, done);
  }, function (e) { engineSetError(row, e, done); });
}

/* ---- tick ---------------------------------------------------------------- */

function engineTick(cb) {
  engineCmd("block", function (bres) {
    var tip = parseInt(bres.response.block, 10);
    enginePrunePending(tip);
    // tokenids already claimed by a row - keeps CREATE from binding to a token
    // that belongs to another collection
    MDS.sql("SELECT tokenid FROM collections WHERE tokenid<>''", function (bres2) {
      engineBoundTokenids = {};
      var brows = bres2.rows || [];
      for (var b = 0; b < brows.length; b++) { engineBoundTokenids[brows[b].TOKENID] = true; }
      MDS.sql("SELECT * FROM collections WHERE phase<>'DONE' AND phase<>'BURIED'",
        function (res) {
          var rows = (res.rows || []);
          engineEach(rows, function (row, next) {
            row.ID = parseInt(row.ID, 10);
            row.SIZE = parseInt(row.SIZE, 10);
            row.POSTED = parseInt(row.POSTED, 10);
            var ph = row.PHASE;
            if (ph === "CREATE") { enginePhaseCreate(row, tip, next); }
            else if (ph === "MOVE") { enginePhaseMove(row, tip, next); }
            else if (ph === "SPLIT") { enginePhaseSplit(row, tip, next); }
            else if (ph === "STAMP") { enginePhaseStamp(row, tip, next); }
            else if (ph === "NEEDIMAGES") { enginePhaseNeedImages(row, next); }
            else if (ph === "BURY") { enginePhaseBury(row, tip, next); }
            else { next(); }
          }, function () { if (cb) { cb(); } });
        });
    });
  }, function (e) {
    MDS.log("StateNFT tick failed: " + e);
    if (cb) { cb(); }
  });
}
