/* Regression tests for minidapp/hosting.js — the Hosting feature's MiniDapp
 * side. Two jobs:
 *   1. PARITY: the pure helpers (slug / fillTemplate / publicUrl / parseKuboAdd)
 *      must agree byte-for-byte with the Android Hosting.java, so both clients
 *      build the same URLs and name plates the same way. Both test suites read
 *      the SAME fixtures (test/fixtures/hosting/parity.json).
 *   2. ID DRIFT: every element id hosting.js binds to must exist in index.html.
 *
 * Run: node test/hosting.test.js   (no dependencies, no node connection)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MINIDAPP = path.join(__dirname, "..", "minidapp");
const html = fs.readFileSync(path.join(MINIDAPP, "index.html"), "utf8");
const fixtures = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "hosting", "parity.json"), "utf8"));

let failures = 0;
function check(name, ok, detail) {
  if (!ok) { failures++; }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}` + (ok || !detail ? "" : ` — ${detail}`));
}

/* ---- load hosting.js in a sandbox -------------------------------------- */

const requestedIds = new Set();
const sandbox = {
  MDS: { keypair: { get() {}, set() {} }, net: { GET() {} } },
  document: { getElementById(id) { requestedIds.add(id); return null; } },
  console, Blob: function () {}, FormData: function () {}, FileReader: function () {},
  fetch() { return Promise.resolve({ ok: true, text: () => Promise.resolve(""), json: () => Promise.resolve({}) }); },
  btoa(s) { return Buffer.from(s, "binary").toString("base64"); },
  Date, Math,
};
sandbox.self = sandbox;

let threw = null;
try {
  vm.runInNewContext(fs.readFileSync(path.join(MINIDAPP, "hosting.js"), "utf8"), sandbox, { filename: "hosting.js" });
} catch (e) { threw = e; }

console.log("hosting.js — parse and top-level binding");
check("hosting.js loads clean", threw === null, threw && threw.message);
const H = sandbox.HOSTING;
check("exposes the HOSTING API", !!H && typeof H.slug === "function"
  && typeof H.fillTemplate === "function" && typeof H.publicUrl === "function"
  && typeof H.parseKuboAdd === "function");

/* ---- 1. parity against the shared fixtures ----------------------------- */

if (H) {
  console.log("parity — slug (shared with HostingTest.java)");
  for (const c of fixtures.slug) check(`slug(${JSON.stringify(c.in)})`, H.slug(c.in) === c.out,
    `got ${JSON.stringify(H.slug(c.in))}, want ${JSON.stringify(c.out)}`);

  console.log("parity — fillTemplate");
  for (const c of fixtures.template) check(`tpl ${c.tpl}`, H.fillTemplate(c.tpl, c.tokens) === c.out,
    `got ${JSON.stringify(H.fillTemplate(c.tpl, c.tokens))}`);

  console.log("parity — publicUrl");
  for (let i = 0; i < fixtures.publicUrl.length; i++) {
    const c = fixtures.publicUrl[i];
    const p = { type: c.type }; p[c.type] = c.cfg;
    check(`${c.type}#${i}`, H.publicUrl(p, c.path, c.isDir) === c.out,
      `got ${JSON.stringify(H.publicUrl(p, c.path, c.isDir))}, want ${JSON.stringify(c.out)}`);
  }

  console.log("parity — parseKuboAdd");
  for (let i = 0; i < fixtures.kuboAdd.length; i++) {
    const c = fixtures.kuboAdd[i];
    check(`kubo#${i}`, H.parseKuboAdd(c.ndjson, c.dirName) === c.out,
      `got ${JSON.stringify(H.parseKuboAdd(c.ndjson, c.dirName))}, want ${JSON.stringify(c.out)}`);
  }
}

/* ---- 2. every id hosting.js requests exists in index.html -------------- */

console.log("index.html — id cross-check");
const htmlIds = new Set();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) { htmlIds.add(m[1]); }
const missing = [];
for (const id of requestedIds) if (!htmlIds.has(id)) missing.push(id);
check("every hosting-requested id exists in index.html", missing.length === 0,
  "missing: " + missing.join(", "));

console.log(failures === 0 ? "\nhosting.test.js: all assertions passed"
                           : `\nhosting.test.js: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
