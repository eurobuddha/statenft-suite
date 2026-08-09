/* photo.js quantizer + photo-pack integration tests
 * Run: node test/photo.test.js   (no dependencies, no node connection) */
var photo = require("../minidapp/photo.js");
var art = require("../minidapp/art.js");

var fails = 0;
function ok(cond, msg) {
  if (cond) { console.log("  ok  " + msg); }
  else { fails++; console.log("FAIL  " + msg); }
}
function b64(n) { return Math.ceil(n / 3) * 4; }

/* deterministic photo-like 48x48 rgba: smooth gradients + regions + a touch
 * of pseudo-noise (pure function of x,y — no Math.random) */
function syntheticRgba(n) {
  var d = new Array(n * n * 4);
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      var i = (y * n + x) * 4;
      var cx = x - n / 2, cy = y - n * 0.4;
      var head = (cx * cx) / 81 + (cy * cy) / 110 < 1;
      var noise = ((x * 73 + y * 149) % 17) - 8;
      if (head) {
        d[i] = 214 + noise; d[i + 1] = 168 + noise; d[i + 2] = 138 + noise;
      } else if (y > n * 0.72) {
        d[i] = 40 + noise; d[i + 1] = 60 + noise; d[i + 2] = 120 + noise;
      } else {
        d[i] = 30 + x * 2 + noise; d[i + 1] = 90 + y + noise; d[i + 2] = 140 + noise;
      }
      d[i + 3] = 255;
    }
  }
  return d;
}

/* ---- quantizer ---- */

var rgba = syntheticRgba(48);
var q1 = photo.photoQuantize(rgba, 48, 48, 8);
var q2 = photo.photoQuantize(rgba, 48, 48, 8);
ok(JSON.stringify(q1) === JSON.stringify(q2), "quantizer is deterministic");
ok(q1.cols === 48 && q1.rows === 48 && q1.cells.length === 48 * 48,
   "model shape: 48x48 master grid");
ok(q1.palette.length >= 2 && q1.palette.length <= 8,
   "palette within k bound (" + q1.palette.length + " colors)");
var hexOk = true, idxOk = true;
for (var i = 0; i < q1.palette.length; i++) {
  if (!/^#[0-9a-f]{6}$/.test(q1.palette[i])) { hexOk = false; }
}
for (var c = 0; c < q1.cells.length; c++) {
  if (!(q1.cells[c] >= 0 && q1.cells[c] < q1.palette.length)) { idxOk = false; }
}
ok(hexOk, "every palette entry is a #rrggbb hex");
ok(idxOk, "every cell indexes into the palette");

/* identical input colors always land in the same palette slot */
var four = new Array(16 * 16 * 4);
for (var p = 0; p < 16 * 16; p++) {
  var quad = (p % 16 < 8 ? 0 : 1) + (p < 16 * 8 ? 0 : 2);
  var cols = [[220, 40, 40], [40, 220, 40], [40, 40, 220], [220, 220, 40]];
  four[p * 4] = cols[quad][0]; four[p * 4 + 1] = cols[quad][1];
  four[p * 4 + 2] = cols[quad][2]; four[p * 4 + 3] = 255;
}
var qf = photo.photoQuantize(four, 16, 16, 8);
var byColor = {};
var consistent = true;
for (var f = 0; f < 16 * 16; f++) {
  var ckey = four[f * 4] + "," + four[f * 4 + 1] + "," + four[f * 4 + 2];
  if (byColor[ckey] === undefined) { byColor[ckey] = qf.cells[f]; }
  else if (byColor[ckey] !== qf.cells[f]) { consistent = false; }
}
ok(consistent, "same input color always maps to the same index");
ok(qf.palette.length <= 4, "4-color input never invents extra colors (" +
   qf.palette.length + ")");

/* flat single-color photo survives the whole pipeline */
var flat = new Array(48 * 48 * 4);
for (var fl = 0; fl < 48 * 48; fl++) {
  flat[fl * 4] = 120; flat[fl * 4 + 1] = 130; flat[fl * 4 + 2] = 140;
  flat[fl * 4 + 3] = 255;
}
var qflat = photo.photoQuantize(flat, 48, 48, 8);
ok(qflat.palette.length === 1, "flat photo quantizes to a single color");

/* ---- photo pack integration (the real-photo path, not the placeholder) ---- */

var cfg = art.artDefaultConfig("photo");
art.artSetPhoto(q1);

var a = art.artGenerate("photo-int-seed", "1", cfg);
var b = art.artGenerate("photo-int-seed", "1", cfg);
ok(a.svg === b.svg, "photo draw is deterministic");
ok(/^[\x20-\x7E]*$/.test(a.svg), "photo draw is pure ASCII (btoa-safe)");
ok(a.svg.indexOf("NaN") === -1 && a.svg.indexOf("undefined") === -1,
   "no NaN/undefined leaked");

art.artSetPhoto(null);
var ph = art.artGenerate("photo-int-seed", "1", cfg);
art.artSetPhoto(q1);
ok(ph.svg !== a.svg, "loaded photo changes the art vs the placeholder");

/* full forced-variant sweep with the photo loaded: every variant clean and
 * within the 16000 b64 budget */
var bad = 0;
var maxB = 0;
for (var s = 0; s < cfg.slots.length; s++) {
  for (var v = 0; v < cfg.slots[s].variants.length; v++) {
    var solo = art.artDefaultConfig("photo");
    for (var v2 = 0; v2 < solo.slots[s].variants.length; v2++) {
      solo.slots[s].variants[v2].on = (v2 === v);
    }
    var forced = art.artGenerate("photo-force", "x" + s + "v" + v, solo);
    var fb = b64(forced ? forced.svg.length : 0);
    if (fb > maxB) { maxB = fb; }
    if (!forced || forced.svg.indexOf("NaN") !== -1 ||
        forced.svg.indexOf("undefined") !== -1 || fb > 16000) {
      bad++;
      console.log("FAIL  photo variant " + cfg.slots[s].key + "/" +
                  cfg.slots[s].variants[v].name + " (" + fb + "B)");
    }
  }
}
fails += bad;
if (!bad) {
  ok(true, "all variants draw clean within 16000B b64 (largest " + maxB + "B)");
}

/* a 20-item collection from the loaded photo: unique combos, all in budget */
var col = art.artCollection("photo-col-seed", 20, cfg);
ok(col.error === null, "20-item photo collection builds (" + (col.error || "ok") + ")");
var seen = {}, dup = false, over = 0;
for (var ci = 0; ci < col.items.length; ci++) {
  if (seen[col.items[ci].key]) { dup = true; }
  seen[col.items[ci].key] = true;
  if (b64(col.items[ci].bytes) > 16000) { over++; }
}
ok(!dup, "all 20 combos unique");
ok(over === 0, "every item within the 16000B b64 budget");

/* flat photo end-to-end (degenerate 1-color palette) */
art.artSetPhoto(qflat);
var flatDraw = art.artGenerate("photo-flat-seed", "1", cfg);
ok(flatDraw && flatDraw.svg.indexOf("NaN") === -1 &&
   b64(flatDraw.svg.length) <= 16000, "flat photo draws clean");

art.artSetPhoto(null);   // leave no global state behind

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURES");
process.exit(fails === 0 ? 0 : 1);
