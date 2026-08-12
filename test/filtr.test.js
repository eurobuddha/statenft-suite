/* Regression tests for minidapp/filtr.js + filtr-engine.js — the FILTR image
 * editor tab. Same bug class as the art-studio harness: ID DRIFT (a handler
 * bound to a missing element fails silently), plus SCHEMA DRIFT (a control
 * writing a settings key the engine never reads).
 *
 * Loads the REAL engine bundle and the tab UI in a vm sandbox with a
 * recording stub DOM, then asserts: both load and bind clean, every id the
 * tab requests exists in index.html, the control schema matches the engine's
 * settings tree, and the pure engine surface behaves (freshSettings /
 * applyPreset / hexToVec3).
 *
 * Run: node test/filtr.test.js   (no dependencies, no node connection)
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
    innerText: "", value: "", className: "", disabled: false, width: 0, height: 0,
    style: {}, children: [], files: [], offsetWidth: 40, offsetHeight: 20,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
    appendChild(c) { el.children.push(c); return c; },
    removeChild() {}, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return ""; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    querySelector() { return stubElement(depth + 1); },
    querySelectorAll() { return []; },
    getContext() {
      return { drawImage() {}, fillRect() {}, getImageData() { return { data: new Uint8Array(4) }; },
               putImageData() {}, measureText() { return { width: 10 }; },
               beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
               ellipse() {}, rect() {}, closePath() {}, fill() {}, stroke() {},
               save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
               fillText() {}, strokeText() {} };
    },
    toDataURL() { return "data:image/png;base64,QUJD"; },
    toBlob(cb) { cb(null); },
    clientWidth: 800, clientHeight: 600,
  };
  let markup = "";
  Object.defineProperty(el, "innerHTML", {
    get() { return markup; },
    set(v) { markup = "" + v; el.children = []; },
  });
  return el;
}

const documentStub = {
  getElementById(id) { requestedIds.add(id); return stubElement(); },
  createElement() { return stubElement(); },
  querySelectorAll() { return []; },
  addEventListener() {},
  body: stubElement(),
};

const sandbox = {
  document: documentStub,
  window: { addEventListener() {}, removeEventListener() {} },
  console,
  setTimeout() { return 0; }, clearTimeout() {},
  btoa(s) { return Buffer.from(s, "binary").toString("base64"); },
  atob(s) { return Buffer.from(s, "base64").toString("binary"); },
  Image: function () {}, Blob: function () {}, FileReader: function () {},
  Uint8Array, Float32Array, Uint8ClampedArray, ImageData: function () {},
  URL: { createObjectURL() { return "blob:x"; }, revokeObjectURL() {} },
  prompt() { return null; },
  performance: { now() { return 0; } },
  requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
  MDS: { cmd() {}, sql() {}, log() {}, comms: { solo() {} },
         keypair: { get(k, cb) { cb({ status: false }); }, set() {} } },
  /* app.js / art-studio.js globals the tab reuses */
  $: (id) => documentStub.getElementById(id),
  toast() {}, show() {}, studioShow() {}, loadCollectionList() {},
  artStudioEnter() {}, artPhotoIntake() {}, nftArtShow() {},
  downloadBlob() {}, engineSqlEsc(s) { return s; }, safeUrl(u) { return u; },
  NFT_ART: "", ARTIMAGE_BUDGET: 9000,
};
sandbox.self = sandbox;

/* ---- 1. engine + tab load clean ---------------------------------------- */

let threw = null;
try {
  for (const f of ["filtr-engine.js", "filtr.js", "filtr-sheet.js"]) {
    const src = fs.readFileSync(path.join(MINIDAPP, f), "utf8");
    vm.runInNewContext(src, sandbox, { filename: f });
  }
} catch (e) { threw = e; }

console.log("filtr — parse and top-level binding");
check("filtr-engine.js + filtr.js + filtr-sheet.js load in the stub DOM", threw === null,
      threw && threw.stack && threw.stack.split("\n").slice(0, 2).join(" | "));

/* ---- 2. pure engine surface -------------------------------------------- */

const E = sandbox.FiltrEngine;
check("engine exports the API", threw === null && !!E &&
      typeof E.freshSettings === "function" && typeof E.applyPreset === "function");

if (E) {
  const s = E.freshSettings();
  check("freshSettings: active is 'none'", s.active === "none");
  check("freshSettings: global adjust group present",
        !!s.adjust && s.adjust.gamma === 1 && s.adjust.brightness === 0);
  check("14 built-in presets", E.BUILTIN_PRESETS.length === 14,
        "got " + E.BUILTIN_PRESETS.length);
  const p = E.applyPreset(E.BUILTIN_PRESETS[0].id, s);
  check("applyPreset returns a full tree with adjust preserved",
        !!p.post && !!p.adjust && p.active !== undefined);
  check("hexToVec3 works", JSON.stringify(E.hexToVec3("#ff0000")) === "[1,0,0]");

  /* ---- 3. schema drift: every control key exists in the settings tree ---- */
  const FX = sandbox.FILTR_FX;
  check("FILTR_FX covers 15 effects + none", Array.isArray(FX) && FX.length === 16,
        "got " + (FX && FX.length));
  let missing = [];
  for (const fx of FX || []) {
    if (fx.id === "none") continue;
    if (!s[fx.id]) { missing.push(fx.id + " (whole group)"); continue; }
    for (const c of fx.c) {
      if (!(c.k in s[fx.id])) { missing.push(fx.id + "." + c.k); }
    }
  }
  check("every effect control maps to an engine setting", missing.length === 0,
        "missing: " + missing.join(", "));
  let missA = [];
  for (const c of sandbox.FILTR_ADJUST || []) {
    if (!(c.k in s.adjust)) { missA.push("adjust." + c.k); }
  }
  check("every adjustment maps to the global grade", missA.length === 0,
        "missing: " + missA.join(", "));
  let missP = [];
  for (const pd of sandbox.FILTR_POST || []) {
    if (!s.post[pd.id]) { missP.push(pd.id); continue; }
    for (const c of pd.c) {
      if (!(c.k in s.post[pd.id])) { missP.push(pd.id + "." + c.k); }
    }
  }
  check("every post control maps to a post setting", missP.length === 0,
        "missing: " + missP.join(", "));
}

/* ---- 4. every requested id exists in index.html ------------------------ */

console.log("index.html — id cross-check");
const htmlIds = new Set();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) { htmlIds.add(m[1]); }
let missingIds = [];
for (const id of requestedIds) {
  if (!htmlIds.has(id)) { missingIds.push(id); }
}
check("every filtr-requested id exists in index.html", missingIds.length === 0,
      "missing: " + missingIds.join(", "));

console.log(failures === 0 ? "\nfiltr.test.js: all assertions passed"
                           : `\nfiltr.test.js: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
