/* artBox — send a whole collection to one recipient.
 *
 * The chain forbids batching: locked-edition coins enforce SAMESTATE and coin
 * state is per-TRANSACTION, so every coin needs its own identity-preserving
 * txn. This driver turns "send collection" into one queued job: each new
 * block it posts one txn per still-owned coin (statenft's proven transfer
 * shape) until the chain shows none left. txnpost is never trusted — the
 * chain is the only source of truth, exactly like the mint engine.
 *
 * ES5. Loaded by service.js (background, page closed) AND the page.
 * Runtime reuses engine.js globals (enginePostTxn, engineTokenCoins,
 * engineStamped, enginePendingOk/engineMarkPending, engineEach,
 * engineSqlEsc). The pure planners below have no MDS/engine dependency so
 * node can test them standalone.
 */

function sendValidAddress(a) {
  /* 0x / Mx, alphanumeric only — nothing hostile can reach SQL or a txn */
  return /^(0x|Mx)[0-9A-Za-z]{8,}$/.test("" + a);
}

/* local mirror of engineSafeStateValue so this file stands alone under node:
 * only shapes the family ever writes — digits, or a [base64] bracket string */
function sendSafeStateValue(v) {
  v = "" + v;
  if (/^[0-9]+$/.test(v)) { return true; }
  if (/^\[[A-Za-z0-9+/=]*\]$/.test(v)) { return true; }
  return false;
}

/* plan the txn steps for one coin; null = refuse (bad address/hostile state).
 * keepstate TRUE demands the ENTIRE state be recreated — every port verbatim. */
function sendPlanSteps(coin, recipient, tokenid, txnid) {
  if (!sendValidAddress(recipient)) { return null; }
  var steps = [
    "txninput id:" + txnid + " coinid:" + coin.coinid,
    "txnoutput id:" + txnid + " amount:" + coin.tokenamount +
      " address:" + recipient + " tokenid:" + tokenid + " storestate:true"
  ];
  var st = coin.state || [];
  for (var i = 0; i < st.length; i++) {
    if (!/^[0-9]+$/.test("" + st[i].port) || !sendSafeStateValue(st[i].data)) {
      return null;
    }
    steps.push("txnstate id:" + txnid + " port:" + st[i].port +
               " value:" + st[i].data);
  }
  steps.push("txnsign id:" + txnid + " publickey:auto");
  return steps;
}

/* ---------- runtime (MDS + engine globals) ---------- */

function sendInitTable(cb) {
  MDS.sql(
    "CREATE TABLE IF NOT EXISTS `send_queue` (" +
    " `id` bigint auto_increment primary key," +
    " `tokenid` varchar(80) NOT NULL," +
    " `recipient` varchar(80) NOT NULL," +
    " `total` int DEFAULT 0," +
    " `status` varchar(16) NOT NULL," +      // ACTIVE | DONE | ERROR
    " `error` varchar(512)," +
    " `startedat` int DEFAULT 0)", cb);
}

function sendSetStatus(rowId, status, err, cb) {
  MDS.sql("UPDATE send_queue SET status='" + status + "', error='" +
          engineSqlEsc(err || "") + "' WHERE id=" + rowId,
          function () { if (cb) { cb(); } });
}

function sendTick(cb) {
  MDS.cmd("block", function (bres) {
    if (!bres.status) { if (cb) { cb(); } return; }
    var tip = parseInt(bres.response.block, 10);
    MDS.sql("SELECT * FROM send_queue WHERE status='ACTIVE'", function (res) {
      engineEach(res.rows || [], function (row, next) {
        engineTokenCoins(row.TOKENID, function (coins) {
          if (coins.length === 0) {
            MDS.log("Atelier send " + row.ID + ": all coins departed -> DONE");
            sendSetStatus(row.ID, "DONE", "", next);
            return;
          }
          engineEach(coins, function (c, cnext) {
            if (!enginePendingOk(c.coinid, tip)) { cnext(); return; }
            if (engineStamped(c) === null) { cnext(); return; }   // unstamped stays
            var steps = sendPlanSteps(c, row.RECIPIENT, row.TOKENID,
                                      "sd" + row.ID);
            if (!steps) {
              sendSetStatus(row.ID, "ERROR",
                "refusing to transfer coin " + c.coinid.substring(0, 18) +
                "… — malformed state", cnext);
              return;
            }
            engineMarkPending(c.coinid, tip);
            enginePostTxn("sd" + row.ID, steps, cnext, function (e) {
              sendSetStatus(row.ID, "ERROR", e, cnext);
            });
          }, next);
        }, function () { next(); });
      }, function () { if (cb) { cb(); } });
    });
  });
}

/* node-side tests exercise the pure planners only */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { sendValidAddress: sendValidAddress,
                     sendSafeStateValue: sendSafeStateValue,
                     sendPlanSteps: sendPlanSteps };
}
