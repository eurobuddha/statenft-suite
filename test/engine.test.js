/* Regression tests for minidapp/engine.js — the pure, chain-facing logic:
 * the coin-state guard, stamped/sentinel detection, the enforcement contract
 * shape, and SQL escaping.
 *
 * Every guard is asserted in BOTH directions: hostile input is rejected AND
 * the values the engine itself writes still pass. The contract-shape tests
 * exist because the token script is IMMUTABLE once minted — a silent change to
 * engineScript() would produce collections that the adoption regex no longer
 * recognises and that behave differently on-chain, with no way to fix them.
 *
 * Run: node test/engine.test.js   (no dependencies, no node connection)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "minidapp", "engine.js");
const sandbox = { MDS: { cmd() {}, sql() {}, log() {} } };
vm.runInNewContext(fs.readFileSync(SRC, "utf8"), sandbox, { filename: SRC });
const { engineSafeStateValue, engineStamped, engineScript, engineScriptLegacy,
        engineSqlEsc, GRAVEYARD } = sandbox;

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) { failures++; }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}` +
    (ok ? "" : `\n         expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
}

const CREATOR = "0xC9B6654E90F2163BC66E209F311DCE02F6E201F4AD922A823C67443FBEAFF6BA";

/* ---- coin-state guard -------------------------------------------------- */
/* State is replayed verbatim into `txnstate ... value:<data>`, and the node
 * parses that command by whitespace. On pre-3.3 collections a holder can write
 * arbitrary state, so anything we did not write ourselves must be refused. */
console.log("engineSafeStateValue — hostile state rejected");
check("command parameter injection", engineSafeStateValue("1 port:0 value:99"), false);
check("output address redirect", engineSafeStateValue("1 address:0xEVIL"), false);
check("newline", engineSafeStateValue("1\nport:0 value:2"), false);
check("sql-ish quote", engineSafeStateValue("x' OR 1=1 --"), false);
check("unbracketed base64", engineSafeStateValue("/9j/4AAQSkZJRg=="), false);
check("bracket with spaces", engineSafeStateValue("[abc def]"), false);

console.log("engineSafeStateValue — state the engine writes is accepted");
check("item index", engineSafeStateValue("7"), true);
check("unstamped sentinel", engineSafeStateValue("0"), true);
check("two-digit index", engineSafeStateValue("20"), true);
check("bracketed base64 image", engineSafeStateValue("[/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD]"), true);
check("empty bracket string", engineSafeStateValue("[]"), true);

/* ---- stamped vs sentinel ------------------------------------------------ */
const coin = (s0) => ({ state: s0 === undefined ? [] : [{ port: 0, data: s0 }] });
console.log("engineStamped — sentinel and legacy coins count as unstamped");
check("sentinel 0 is unstamped", engineStamped(coin("0")), null);
check("absent state is unstamped (legacy)", engineStamped(coin()), null);
check("index 1 is stamped", engineStamped(coin("1")), "1");
check("index 20 is stamped", engineStamped(coin("20")), "20");

/* ---- enforcement contract shape ----------------------------------------- */
console.log("engineScript — locked-edition contract is byte-stable");
check("embed mode enforces ports 0-1",
  engineScript(CREATOR, "embed"),
  "LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY(" + CREATOR + ") THEN RETURN TRUE ENDIF " +
  "RETURN SAMESTATE(0 1) AND VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)");
check("url mode enforces port 0 only",
  engineScript(CREATOR, "url").indexOf("SAMESTATE(0 0)") > -1, true);
check("creator bypass is gated on the sentinel",
  engineScript(CREATOR, "embed").indexOf("IF s EQ 0 AND SIGNEDBY") > -1, true);
check("legacy contract kept for adoption of old collections",
  engineScriptLegacy(CREATOR).indexOf("SAMESTATE") === -1, true);

/* Adoption must still recognise both generations; these are the exact regexes
 * from engineAdoptOne. A drift between them and engineScript() would orphan
 * every newly minted collection. */
const RE_NEW = /^LET s=PREVSTATE\(0\) IF s EQ 0 AND SIGNEDBY\((0x[0-9A-Fa-f]+)\) THEN RETURN TRUE ENDIF RETURN SAMESTATE\(0 [01]\) AND VERIFYOUT\(@INPUT GETOUTADDR\(@INPUT\) @AMOUNT @TOKENID TRUE\)$/;
const RE_OLD = /^IF SIGNEDBY\((0x[0-9A-Fa-f]+)\) THEN RETURN TRUE ENDIF RETURN VERIFYOUT\(@INPUT GETOUTADDR\(@INPUT\) @AMOUNT @TOKENID TRUE\)$/;
console.log("adoption fingerprint matches what we mint");
check("embed script is recognised", RE_NEW.test(engineScript(CREATOR, "embed")), true);
check("url script is recognised", RE_NEW.test(engineScript(CREATOR, "url")), true);
check("legacy script is recognised", RE_OLD.test(engineScriptLegacy(CREATOR)), true);
check("creator key is extracted", RE_NEW.exec(engineScript(CREATOR, "embed"))[1], CREATOR);

/* ---- tokencreate metadata: traits ride the token record ------------------ */
/* enginePhaseCreatePost must seal row.ITEMTRAITS into meta.traits — the same
 * convention the Android engine writes, so both clients' viewers read one
 * on-chain shape. Capture the actual tokencreate command via the MDS stub. */
console.log("enginePhaseCreatePost — itemtraits sealed into token metadata");
{
  let captured = "";
  sandbox.MDS.cmd = (c, cb) => {
    if (String(c).indexOf("tokencreate") === 0) { captured = c; }
    cb({ status: true, response: {} });
  };
  sandbox.MDS.sql = (q, cb) => { if (cb) cb({ status: true, rows: [] }); };
  const traits = { "1": [{ trait_type: "Palette", value: "Verm" }],
                   "2": [{ trait_type: "Eyes", value: "Laser" }] };
  sandbox.enginePhaseCreatePost({
    ID: 1, POSTED: 0, NAME: "T", DESCRIPTION: "", MODE: "embed", SIZE: 2,
    CREATORPK: CREATOR, ITEMTRAITS: JSON.stringify(traits)
  }, 100, () => {});
  const metaJson = captured.slice(captured.indexOf("name:") + 5,
                                  captured.indexOf(" amount:"));
  let meta = {};
  try { meta = JSON.parse(metaJson); } catch (e) {}
  check("tokencreate carries a traits map", !!meta.traits, true);
  check("traits survive verbatim", JSON.stringify(meta.traits), JSON.stringify(traits));
  check("malformed itemtraits is dropped, not fatal", (() => {
    let cap2 = "";
    sandbox.MDS.cmd = (c, cb) => { if (String(c).indexOf("tokencreate") === 0) cap2 = c; cb({ status: true, response: {} }); };
    sandbox.enginePhaseCreatePost({ ID: 2, POSTED: 0, NAME: "U", DESCRIPTION: "",
      MODE: "embed", SIZE: 2, CREATORPK: CREATOR, ITEMTRAITS: "{broken" }, 100, () => {});
    return cap2.indexOf("traits") === -1 && cap2.indexOf("tokencreate") === 0;
  })(), true);
  sandbox.MDS.cmd = () => {};
  sandbox.MDS.sql = () => {};
}

/* ---- split batch sizing -------------------------------------------------- */
/* (k units + change + input) full token definitions must fit ~40KB under the
 * 64KB TxPoW cap. A fixed 3-unit batch silently stalled generative mints:
 * their ~11KB definitions (icon + 20 items' traits) built ~55KB txns the
 * chain rejected without an error. */
console.log("engineSplitBatch — outputs sized to the token definition");
check("legacy ~7KB definition keeps the proven 3-unit batch", sandbox.engineSplitBatch(7000), 3);
check("generative ~11KB definition drops to 1 unit + change", sandbox.engineSplitBatch(11079), 1);
check("tiny definition capped at 3", sandbox.engineSplitBatch(500), 3);
check("~10KB definition fits 2", sandbox.engineSplitBatch(10000), 2);
check("degenerate definition still yields 1", sandbox.engineSplitBatch(90000), 1);

/* ---- misc --------------------------------------------------------------- */
console.log("engineSqlEsc / graveyard");
check("single quotes doubled", engineSqlEsc("O'Brien"), "O''Brien");
check("injection payload neutralised", engineSqlEsc("x'; DROP TABLE items--"),
  "x''; DROP TABLE items--");
check("graveyard is the RETURN FALSE address",
  GRAVEYARD, "0xABA005476D2B3CD7F251B9783E64C124C9670BB358695F04D91B2057BB64CB49");

console.log(failures === 0
  ? "\nengine.test.js: all assertions passed"
  : `\nengine.test.js: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
