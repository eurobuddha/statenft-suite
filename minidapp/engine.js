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
          MDS.sql("ALTER TABLE collections ADD COLUMN IF NOT EXISTS " +
                  "`origin` varchar(16) DEFAULT 'created'",
                  function () {
                    MDS.sql("ALTER TABLE collections ADD COLUMN IF NOT EXISTS " +
                            "`icon` clob",
                            function () {
                              MDS.sql("ALTER TABLE collections ADD COLUMN IF NOT EXISTS " +
                                      "`webvalidate` varchar(512)",
                                      function () {
                                        MDS.sql("ALTER TABLE collections ADD COLUMN IF NOT EXISTS " +
                                                "`externalurl` varchar(512)",
                                                function () {
                                                  MDS.sql("ALTER TABLE collections ADD COLUMN IF NOT EXISTS " +
                                                          "`iscreator` int DEFAULT 0",
                                                          function () { engineBackfillCreator(cb); });
                                                });
                                      });
                            });
                  });
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
    // definitive StateNFT fingerprint: either enforcement script generation
    var m = script.match(/^IF SIGNEDBY\((0x[0-9A-Fa-f]+)\) THEN RETURN TRUE ENDIF RETURN VERIFYOUT\(@INPUT GETOUTADDR\(@INPUT\) @AMOUNT @TOKENID TRUE\)$/) ||
            script.match(/^LET s=PREVSTATE\(0\) IF s EQ 0 AND SIGNEDBY\((0x[0-9A-Fa-f]+)\) THEN RETURN TRUE ENDIF RETURN SAMESTATE\(0 [01]\) AND VERIFYOUT\(@INPUT GETOUTADDR\(@INPUT\) @AMOUNT @TOKENID TRUE\)$/);
    if (!m) { done(); return; }        // some other token - not ours
    var pk = m[1];
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
    var tid = null;
    for (var i = 0; i < bal.length; i++) {
      var t = bal[i].token;
      if (t && typeof t === "object" && t.name === row.NAME) { tid = bal[i].tokenid; }
    }
    if (tid) {
      MDS.sql("UPDATE collections SET tokenid='" + tid + "' WHERE id=" + row.ID,
        function () { engineSetPhase(row, "MOVE", done); });
      return;
    }
    if (row.POSTED == 1) { done(); return; }   // tokencreate already sent - wait
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
    var cmd = "tokencreate name:" + JSON.stringify(meta) +
              " amount:" + row.SIZE + " decimals:0" +
              " script:\"" + engineScript(row.CREATORPK, row.MODE) + "\"" +
              " state:{\"0\":\"0\"}" +
              " signtoken:" + row.CREATORPK;
    if (row.WEBVALIDATE) { cmd += " webvalidate:" + row.WEBVALIDATE; }
    engineCmd(cmd, function () {
      MDS.sql("UPDATE collections SET posted=1 WHERE id=" + row.ID, done);
    }, function (e) { engineSetError(row, e, done); });
  }, function (e) { engineSetError(row, e, done); });
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
    engineEach(bigs, function (c, next) {
      if (!enginePendingOk(c.coinid, tip)) { next(); return; }
      engineMarkPending(c.coinid, tip);
      engineSplitCoin(row, c, 3, next,
        function (e) { engineSetError(row, e, next); });
    }, done);
  }, function (e) { engineSetError(row, e, done); });
}

function enginePhaseStamp(row, tip, done) {
  engineTokenCoins(row.TOKENID, function (coins) {
    var used = {};
    var blanks = [];
    var stamped = [];
    for (var i = 0; i < coins.length; i++) {
      var idx = engineStamped(coins[i]);
      if (idx !== null) { used[idx] = true; stamped.push(coins[i]); }
      else if (coins[i].tokenamount === "1") { blanks.push(coins[i]); }
    }
    // record stamped coinids on their item rows
    engineEach(stamped, function (c, next) {
      MDS.sql("UPDATE items SET coinid='" + c.coinid + "' WHERE collectionid=" +
              row.ID + " AND idx=" + engineState(c, 0), next);
    }, function () {
      var count = 0;
      for (var u in used) { if (used.hasOwnProperty(u)) { count++; } }
      if (count >= row.SIZE) { engineSetPhase(row, "DONE", done); return; }

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
    if (coins.length === 0) { engineSetPhase(row, "BURIED", done); return; }
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
      for (var i = 0; i < st.length; i++) {
        steps.push("txnstate id:" + id + " port:" + st[i].port +
                   " value:" + st[i].data);
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
    MDS.sql("SELECT * FROM collections WHERE phase<>'DONE' AND phase<>'BURIED'", function (res) {
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
  }, function (e) {
    MDS.log("StateNFT tick failed: " + e);
    if (cb) { cb(); }
  });
}
