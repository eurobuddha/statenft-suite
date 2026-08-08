/* sendall.js pure-planner tests — run with: node test/sendall.test.js
 * Both directions per family convention: hostile input refused AND the
 * values the app itself produces still pass. */
var sa = require("../minidapp/sendall.js");

var fails = 0;
function ok(cond, msg) {
  if (cond) { console.log("  ok  " + msg); }
  else { fails++; console.log("FAIL  " + msg); }
}

/* addresses */
ok(sa.sendValidAddress("0xC1242210B61A89918C9F17340DB263A4479A0A7E"),
   "hex address accepted");
ok(sa.sendValidAddress("MxG18HGG6FF41Z6NKPQ0"), "Mx address accepted");
ok(!sa.sendValidAddress("0x12' OR 1=1--"), "SQL-hostile recipient rejected");
ok(!sa.sendValidAddress("Mx<script>"), "markup recipient rejected");
ok(!sa.sendValidAddress("bc1qxyz"), "non-Minima address rejected");
ok(!sa.sendValidAddress("0x1234"), "too-short address rejected");

/* plan for a stamped embed coin: verbatim state replay, order, storestate */
var coin = {
  coinid: "0xC0FFEE01", tokenamount: "1",
  state: [{ port: 0, data: "7" }, { port: 1, data: "[QUJDRA==]" }]
};
var steps = sa.sendPlanSteps(coin, "MxRECIPIENT123456", "0xT0K3N", "sd9");
ok(steps !== null && steps.length === 5, "stamped embed coin plans 5 steps");
ok(steps[0] === "txninput id:sd9 coinid:0xC0FFEE01", "input first");
ok(steps[1] === "txnoutput id:sd9 amount:1 address:MxRECIPIENT123456" +
   " tokenid:0xT0K3N storestate:true", "output preserves amount + storestate");
ok(steps[2] === "txnstate id:sd9 port:0 value:7" &&
   steps[3] === "txnstate id:sd9 port:1 value:[QUJDRA==]",
   "every state port replayed verbatim, in order");
ok(steps[4] === "txnsign id:sd9 publickey:auto", "signed last with auto key");

/* url-mode coin (single state port) still plans */
var urlCoin = { coinid: "0xAB", tokenamount: "1", state: [{ port: 0, data: "3" }] };
ok(sa.sendPlanSteps(urlCoin, "0xC1242210B61A8991", "0xT", "sd1").length === 4,
   "url-mode coin plans input/output/state/sign");

/* refusals */
var hostile = { coinid: "0xAB", tokenamount: "1",
                state: [{ port: 0, data: "7 txnoutput amount:999" }] };
ok(sa.sendPlanSteps(hostile, "MxRECIPIENT123456", "0xT", "sd1") === null,
   "command-injection state refused");
var badPort = { coinid: "0xAB", tokenamount: "1",
                state: [{ port: "0 1", data: "7" }] };
ok(sa.sendPlanSteps(badPort, "MxRECIPIENT123456", "0xT", "sd1") === null,
   "malformed port refused");
ok(sa.sendPlanSteps(coin, "not-an-address", "0xT", "sd1") === null,
   "bad recipient refuses the whole plan");

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURES");
process.exit(fails === 0 ? 0 : 1);
