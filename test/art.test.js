/* artBox core engine tests — run with: node test/art.test.js
 * Every suite loops over EVERY registered style pack. */
var art = require("../minidapp/art.js");

var fails = 0;
function ok(cond, msg) {
  if (cond) { console.log("  ok  " + msg); }
  else { fails++; console.log("FAIL  " + msg); }
}

var styles = Object.keys(art.ART_STYLES);
console.log("styles under test: " + styles.join(", "));

var svgBySeed = {};   // styleKey -> svg for cross-style comparison

styles.forEach(function (sk) {
  console.log("--- " + sk + " ---");
  var cfg = art.artDefaultConfig(sk);

  /* determinism */
  var a = art.artGenerate("test-seed", "1", cfg);
  var b = art.artGenerate("test-seed", "1", cfg);
  var c = art.artGenerate("other-seed", "1", cfg);
  ok(a.svg === b.svg, sk + ": same seed reproduces byte-identical SVG");
  ok(a.svg !== c.svg, sk + ": different seed changes the art");
  svgBySeed[sk] = a.svg;

  /* structure */
  ok(a.svg.indexOf("<svg ") === 0 && a.svg.slice(-6) === "</svg>",
     sk + ": SVG wrapper present");
  ok(a.svg.indexOf("NaN") === -1 && a.svg.indexOf("undefined") === -1,
     sk + ": no NaN/undefined leaked");
  ok(/^[\x20-\x7E]*$/.test(a.svg), sk + ": pure ASCII (btoa-safe)");
  ok(a.traits.length === cfg.slots.length, sk + ": one trait per slot");
  ok(a.score > 0, sk + ": rarity score computed");

  /* collection: uniqueness + byte budget */
  var col = art.artCollection(sk + "-collection-seed", 48, cfg);
  ok(col.error === null, sk + ": 48-item collection (" + (col.error || "ok") + ")");
  var keys = {};
  var dup = false;
  var maxBytes = 0;
  var over = 0;
  for (var i = 0; i < col.items.length; i++) {
    var it = col.items[i];
    if (keys[it.key]) { dup = true; }
    keys[it.key] = true;
    if (it.bytes > maxBytes) { maxBytes = it.bytes; }
    if (Math.ceil(it.bytes / 3) * 4 > 8192) { over++; }
  }
  ok(!dup, sk + ": all 48 combos unique");
  ok(over === 0, sk + ": every item within 8KB base64 budget");
  var b64max = Math.ceil(maxBytes / 3) * 4;
  console.log("      " + sk + " largest: " + maxBytes + "B raw / " + b64max +
              "B b64" + (maxBytes > 5800 ? "  (!) near budget" : ""));

  /* forced-variant sweep: every variant must draw clean when solo-enabled */
  var bad = 0;
  for (var s = 0; s < cfg.slots.length; s++) {
    for (var v = 0; v < cfg.slots[s].variants.length; v++) {
      var solo = art.artDefaultConfig(sk);
      for (var v2 = 0; v2 < solo.slots[s].variants.length; v2++) {
        solo.slots[s].variants[v2].on = (v2 === v);
      }
      var forced = art.artGenerate("force", "x" + s + "v" + v, solo);
      if (!forced || forced.svg.indexOf("NaN") !== -1 ||
          forced.svg.indexOf("undefined") !== -1 ||
          Math.ceil(forced.svg.length / 3) * 4 > 8192) {
        bad++;
        console.log("FAIL  " + sk + " variant " + cfg.slots[s].key + "/" +
                    cfg.slots[s].variants[v].name);
      }
    }
  }
  fails += bad;
  if (!bad) { ok(true, sk + ": all variants draw clean and within budget"); }

  /* capacity: at least 10x the 20-item mint cap so uniqueness never strains */
  ok(art.artCapacity(cfg) >= 200,
     sk + ": capacity >= 200 (" + art.artCapacity(cfg) + ")");
});

/* stream separation: same seed under two styles must differ */
if (styles.length >= 2) {
  ok(svgBySeed[styles[0]] !== svgBySeed[styles[1]],
     "same seed under different styles yields different art");
}

/* weighted picker respects disabled variants */
var rng = art.artRng("w");
var only = art.artPickWeighted(rng, [
  { name: "A", weight: 100, on: false }, { name: "B", weight: 1 }
]);
ok(only.variant.name === "B", "disabled variants are never picked");

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURES");
process.exit(fails === 0 ? 0 : 1);
