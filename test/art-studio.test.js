/* Regression tests for minidapp/art-studio.js — the generative studio UI
 * glue imported from artBox. The bug class this merge risks is ID DRIFT:
 * the studio was ported with every element id renamed (art-*, g-*), so a
 * missed rename means a handler bound to nothing, silently.
 *
 * The harness loads art.js + art-studio.js in a vm sandbox with a stub DOM
 * that RECORDS every getElementById call, then asserts:
 *   1. both files parse and bind without throwing,
 *   2. every id the studio asks for exists in minidapp/index.html,
 *   3. index.html contains no duplicate ids.
 *
 * Run: node test/art-studio.test.js   (no dependencies, no node connection)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MINIDAPP = path.join(__dirname, "..", "minidapp");
const html = fs.readFileSync(path.join(MINIDAPP, "index.html"), "utf8");

let failures = 0;
function check(name, ok, detail) {
  if (!ok) { failures++; }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}` + (ok || !detail ? "" : ` — ${detail}`));
}

/* ---- stub DOM ---------------------------------------------------------- */

const requestedIds = new Set();

function stubElement(depth) {
  depth = depth || 0;
  const el = {
    innerText: "", value: "", className: "", disabled: false,
    style: {}, children: [], rows: [], max: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; },
    removeChild() {}, addEventListener() {},
    querySelector() { return stubElement(depth + 1); },
    querySelectorAll() { return []; },
    getContext() { return { drawImage() {} }; },
    toDataURL() { return "data:image/jpeg;base64,QUJD"; },
    click() {},
  };
  /* like the real DOM, assigning innerHTML materialises children/rows —
   * the studio writes markup then addresses children[i] / rows[i].cells[j] */
  let markup = "";
  Object.defineProperty(el, "innerHTML", {
    get() { return markup; },
    set(v) {
      markup = "" + v;
      el.children = []; el.rows = [];
      if (depth > 4 || !markup) { return; }
      const n = Math.max((markup.match(/</g) || []).length, 1);
      for (let i = 0; i < Math.min(n, 64); i++) {
        const kid = stubElement(depth + 1);
        kid.cells = [stubElement(depth + 2), stubElement(depth + 2), stubElement(depth + 2)];
        el.children.push(kid);
        el.rows.push(kid);
      }
    },
  });
  return el;
}

const documentStub = {
  getElementById(id) { requestedIds.add(id); return stubElement(); },
  createElement() { return stubElement(); },
  getElementsByName() { return []; },
  body: stubElement(),
};

const sandbox = {
  document: documentStub,
  window: {},
  console,
  setTimeout() { return 0; }, clearTimeout() {},
  btoa(s) { return Buffer.from(s, "binary").toString("base64"); },
  atob(s) { return Buffer.from(s, "base64").toString("binary"); },
  Image: function () {},
  Blob: function () {},
  Uint8Array,
  URL: { createObjectURL() { return "blob:x"; }, revokeObjectURL() {} },
  MDS: {
    cmd() {}, sql() {}, log() {},
    comms: { solo() {} },
    keypair: { get(k, cb) { cb({ status: false }); }, set() {} },
  },
  /* app.js globals the studio reuses — minimal stand-ins */
  $: function (id) { return documentStub.getElementById(id); },
  toast() {},
  safeUrl(u) { return /^https:\/\//.test(u) ? u : ""; },
  studioShow() {}, show() {}, loadCollectionList() {},
  engineSqlEsc(s) { return ("" + s).replace(/'/g, "''"); },
};
sandbox.ICON_BUDGET = 6000;

/* ---- 1. parse + bind without throwing ---------------------------------- */

let threw = null;
try {
  for (const f of ["art.js", "art-studio.js"]) {
    const src = fs.readFileSync(path.join(MINIDAPP, f), "utf8");
    vm.runInNewContext(src, sandbox, { filename: f });
  }
} catch (e) { threw = e; }

console.log("art-studio — parse and top-level binding");
check("art.js + art-studio.js load in the stub DOM", threw === null,
      threw && threw.stack && threw.stack.split("\n").slice(0, 2).join(" | "));

check("18 style packs registered", threw === null &&
      Object.keys(sandbox.ART_STYLES || {}).length === 18,
      "got " + Object.keys(sandbox.ART_STYLES || {}).length);

/* exercise the render paths so every runtime id is requested too */
if (threw === null) {
  let renderThrew = null;
  try {
    sandbox.artStudioEnter();
    sandbox.artRenderBudget();
  } catch (e) { renderThrew = e; }
  check("artStudioEnter + artRenderBudget run clean", renderThrew === null,
        renderThrew && renderThrew.message);
}

/* ---- 2. every requested id exists in index.html ------------------------ */

console.log("index.html — id cross-check");
const htmlIds = new Set();
const dupes = [];
for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
  if (htmlIds.has(m[1])) { dupes.push(m[1]); }
  htmlIds.add(m[1]);
}
let missing = [];
for (const id of requestedIds) {
  if (!htmlIds.has(id)) { missing.push(id); }
}
check("every studio-requested id exists in index.html", missing.length === 0,
      "missing: " + missing.join(", "));

/* ---- 3. no duplicate ids ----------------------------------------------- */

check("no duplicate ids in index.html", dupes.length === 0,
      "duplicated: " + dupes.join(", "));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
