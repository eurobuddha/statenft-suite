/* artBox generative core v2 — deterministic SVG art engine, style-pack registry.
 *
 * Every pack: parametric GENERATORS seeded per item, a weighted TRAIT POOL
 * (slots of variants with rarity weights), and the shared COMPOSER that
 * assembles unique, rarity-scored tokens.
 *
 * ES5 only, pure (no MDS, no DOM) — shared by the page and the node tests.
 * Everything is driven by (collectionSeed, itemSalt): same inputs, same SVG,
 * byte for byte. Items embed on-chain, so every item must stay under
 * ~5.8KB raw ASCII (8192 bytes base64).
 *
 * Packs live in ART_STYLES; each defines label, optional palettes (falls back
 * to the shared ART_PALETTES), slots() and compose(seed, salt, key, chosen, P).
 */

/* ---------- seeded randomness (xmur3 + mulberry32) ---------- */

function artSeed(str) {
  var h = 1779033703 ^ str.length;
  for (var i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function artRng(seedStr) {
  var a = artSeed(seedStr);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function artRange(rng, min, max) { return min + rng() * (max - min); }
function artInt(rng, min, max) { return Math.floor(artRange(rng, min, max + 1)); }
function artPick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

/* weighted pick over enabled variants; returns {variant, p} */
function artPickWeighted(rng, variants) {
  var live = [];
  var total = 0;
  for (var i = 0; i < variants.length; i++) {
    if (variants[i].on === false) { continue; }
    live.push(variants[i]);
    total += variants[i].weight;
  }
  if (live.length === 0 || total <= 0) { return null; }
  var roll = rng() * total;
  var acc = 0;
  for (var j = 0; j < live.length; j++) {
    acc += live[j].weight;
    if (roll < acc) { return { variant: live[j], p: live[j].weight / total }; }
  }
  return { variant: live[live.length - 1], p: live[live.length - 1].weight / total };
}

/* compact numbers for SVG: one decimal / integer */
function N(x) { return Math.round(x * 10) / 10; }
function I(x) { return Math.round(x); }

/* every pack derives its draw streams this way; the style key in the stream
 * keeps packs decorrelated even under the same collection seed */
function artDrawRng(seed, styleKey, part, salt) {
  return artRng(seed + "|" + styleKey + "|draw|" + part + "|" + salt);
}

/* ---------- shared palettes ----------
 * bg0/bg1 background pair, body main fill, body2 shade, accent features,
 * ink dark detail, glow bright highlight. Packs may define their own lists
 * with the same keys. */

var ART_PALETTES = [
  { name: "Dusk Neon",  weight: 16, bg0: "#171032", bg1: "#311b56", body: "#ff6ec7", body2: "#c94d9e", accent: "#25e2ff", ink: "#140b22", glow: "#ffe66d" },
  { name: "Ocean",      weight: 16, bg0: "#0a1c30", bg1: "#123a5c", body: "#3fa7ff", body2: "#2b7cc4", accent: "#ff8c69", ink: "#071522", glow: "#aef1ff" },
  { name: "Mint Frost", weight: 14, bg0: "#0d2426", bg1: "#14413d", body: "#5ce8b6", body2: "#3cba8e", accent: "#f2f7f5", ink: "#0a1d1b", glow: "#c8ffe8" },
  { name: "Solar",      weight: 14, bg0: "#241407", bg1: "#4a2410", body: "#ff9d3c", body2: "#d67518", accent: "#ffe14d", ink: "#1c0f04", glow: "#fff2b3" },
  { name: "Sakura",     weight: 12, bg0: "#2a1226", bg1: "#4c1f42", body: "#ffa8c9", body2: "#e07ba4", accent: "#fdf3f7", ink: "#220d1c", glow: "#ffd9e8" },
  { name: "Acid",       weight: 10, bg0: "#101208", bg1: "#1e2410", body: "#b8f235", body2: "#8cc21b", accent: "#f24fd8", ink: "#0c0e05", glow: "#eaffb3" },
  { name: "Ember",      weight: 8,  bg0: "#230b0b", bg1: "#451312", body: "#ff5f45", body2: "#cc3f2c", accent: "#ffc84a", ink: "#1a0707", glow: "#ffd9a8" },
  { name: "Mono",       weight: 5,  bg0: "#101014", bg1: "#232329", body: "#d7d7de", body2: "#a3a3ad", accent: "#ff3b30", ink: "#0b0b0e", glow: "#ffffff" },
  { name: "Gold",       weight: 3,  bg0: "#0c0a06", bg1: "#211a0c", body: "#e8c15a", body2: "#b8923a", accent: "#f7ecd2", ink: "#0a0805", glow: "#fff7dd" },
  { name: "Hologram",   weight: 2,  bg0: "#0b0d1c", bg1: "#1c1040", body: "#7df1e4", body2: "#c17bf0", accent: "#ff7bd5", ink: "#080a16", glow: "#eafcff" }
];

function paletteVariants(list) {
  var v = [];
  for (var i = 0; i < list.length; i++) {
    v.push({ name: list[i].name, weight: list[i].weight });
  }
  return v;
}

function artPaletteByName(name, list) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].name === name) { return list[i]; }
  }
  return list[0];
}

/* ---------- shared backgrounds / trims (reused across packs) ---------- */

function bgPlain(rng, P) {
  return "<rect width='512' height='512' fill='" + P.bg0 + "'/>";
}

function bgWash(rng, P) {
  var cy = N(artRange(rng, 120, 240));
  var r = N(artRange(rng, 300, 420));
  return "<defs><radialGradient id='bgw' cx='.5' cy='" + N(cy / 512) +
    "' r='" + N(r / 512) + "'><stop offset='0' stop-color='" + P.bg1 +
    "'/><stop offset='1' stop-color='" + P.bg0 + "'/></radialGradient></defs>" +
    "<rect width='512' height='512' fill='url(#bgw)'/>";
}

function bgDots(rng, P) {
  var step = artInt(rng, 26, 40);
  var r = N(artRange(rng, 2, 4.5));
  return "<defs><pattern id='bgd' width='" + step + "' height='" + step +
    "' patternUnits='userSpaceOnUse'><circle cx='" + N(step / 2) + "' cy='" +
    N(step / 2) + "' r='" + r + "' fill='" + P.bg1 + "'/></pattern></defs>" +
    "<rect width='512' height='512' fill='" + P.bg0 + "'/>" +
    "<rect width='512' height='512' fill='url(#bgd)'/>";
}

function bgRings(rng, P) {
  var n = artInt(rng, 5, 8);
  var gap = artInt(rng, 34, 48);
  var s = "<rect width='512' height='512' fill='" + P.bg0 + "'/><g fill='none' stroke='" +
          P.bg1 + "' stroke-width='" + artInt(rng, 8, 16) + "'>";
  for (var i = 1; i <= n; i++) {
    s += "<circle cx='256' cy='256' r='" + (i * gap) + "' opacity='" +
         N(0.9 - i * 0.09) + "'/>";
  }
  return s + "</g>";
}

function bgGrid(rng, P) {
  var step = artInt(rng, 32, 56);
  return "<defs><pattern id='bgg' width='" + step + "' height='" + step +
    "' patternUnits='userSpaceOnUse'><path d='M" + step + " 0H0V" + step +
    "' fill='none' stroke='" + P.bg1 + "' stroke-width='1.5'/></pattern></defs>" +
    "<rect width='512' height='512' fill='" + P.bg0 + "'/>" +
    "<rect width='512' height='512' fill='url(#bgg)'/>";
}

function fxFrame(rng, P) {
  var m = artInt(rng, 14, 22);
  var t = artInt(rng, 16, 26);
  return "<rect x='" + m + "' y='" + m + "' width='" + (512 - 2 * m) +
    "' height='" + (512 - 2 * m) + "' fill='none' stroke='" + P.glow +
    "' stroke-width='2' opacity='0.7'/>" +
    "<g stroke='" + P.glow + "' stroke-width='4'>" +
    "<path d='M" + m + " " + (m + t) + "V" + m + "H" + (m + t) + "'/>" +
    "<path d='M" + (512 - m - t) + " " + m + "H" + (512 - m) + "V" + (m + t) + "'/>" +
    "<path d='M" + (512 - m) + " " + (512 - m - t) + "V" + (512 - m) + "H" +
    (512 - m - t) + "'/>" +
    "<path d='M" + (m + t) + " " + (512 - m) + "H" + m + "V" + (512 - m - t) + "'/>" +
    "</g>";
}

var ART_BG = { Plain: bgPlain, Wash: bgWash, Dots: bgDots, Rings: bgRings, Grid: bgGrid };

/* ======================================================================
 * PACK: geo — bauhaus / suprematist composition
 * ====================================================================== */

function geoSlots() {
  return [
    { key: "layout", label: "Layout", variants: [
      { name: "Grid-3", weight: 26 }, { name: "Grid-2", weight: 20 },
      { name: "Band", weight: 18 }, { name: "Orbit", weight: 18 },
      { name: "Scatter", weight: 18 } ] },
    { key: "forms", label: "Forms", variants: [
      { name: "Circles", weight: 24 }, { name: "Triangles", weight: 20 },
      { name: "Bars", weight: 20 }, { name: "Arcs", weight: 18 },
      { name: "Mixed", weight: 18 } ] },
    { key: "density", label: "Density", variants: [
      { name: "Minimal", weight: 30 }, { name: "Balanced", weight: 45 },
      { name: "Busy", weight: 25 } ] },
    { key: "focal", label: "Focal", variants: [
      { name: "None", weight: 30 }, { name: "Disc", weight: 28 },
      { name: "Wedge", weight: 22 }, { name: "Ring", weight: 20 } ] },
    { key: "texture", label: "Texture", variants: [
      { name: "None", weight: 45 }, { name: "Stripes", weight: 30 },
      { name: "Dots", weight: 25 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Paper", weight: 38 }, { name: "Split", weight: 32 },
      { name: "Wash", weight: 30 } ] }
  ];
}

/* one geometric primitive centered (cx,cy), size s, color c */
function geoShape(rng, kind, cx, cy, s, c) {
  var h = s / 2;
  if (kind === "circle") {
    return "<circle cx='" + I(cx) + "' cy='" + I(cy) + "' r='" + I(h) +
           "' fill='" + c + "'/>";
  }
  if (kind === "ring") {
    return "<circle cx='" + I(cx) + "' cy='" + I(cy) + "' r='" + I(h * 0.86) +
           "' fill='none' stroke='" + c + "' stroke-width='" + I(s * 0.14) + "'/>";
  }
  if (kind === "semi") {
    var a = artInt(rng, 0, 3) * 90;
    return "<path d='M" + I(cx - h) + " " + I(cy) + "A" + I(h) + " " + I(h) +
           " 0 0 1 " + I(cx + h) + " " + I(cy) + "Z' fill='" + c +
           "' transform='rotate(" + a + " " + I(cx) + " " + I(cy) + ")'/>";
  }
  if (kind === "quarter") {
    var q = artInt(rng, 0, 3) * 90;
    return "<path d='M" + I(cx) + " " + I(cy) + "L" + I(cx + h) + " " + I(cy) +
           "A" + I(h) + " " + I(h) + " 0 0 0 " + I(cx) + " " + I(cy - h) +
           "Z' fill='" + c + "' transform='rotate(" + q + " " + I(cx) + " " +
           I(cy) + ")'/>";
  }
  if (kind === "triangle") {
    var rot = artInt(rng, 0, 11) * 30;
    var pts = [];
    for (var i = 0; i < 3; i++) {
      var t = (rot * Math.PI / 180) + i * 2.0944 - Math.PI / 2;
      pts.push(I(cx + Math.cos(t) * h) + "," + I(cy + Math.sin(t) * h));
    }
    return "<polygon points='" + pts.join(" ") + "' fill='" + c + "'/>";
  }
  if (kind === "bar") {
    var ba = artInt(rng, 0, 11) * 15;
    return "<rect x='" + I(cx - h) + "' y='" + I(cy - s * 0.14) + "' width='" +
           I(s) + "' height='" + I(s * 0.28) + "' fill='" + c +
           "' transform='rotate(" + ba + " " + I(cx) + " " + I(cy) + ")'/>";
  }
  /* arc */
  var aa = artInt(rng, 0, 7) * 45;
  return "<path d='M" + I(cx - h) + " " + I(cy) + "A" + I(h) + " " + I(h) +
         " 0 0 1 " + I(cx + h) + " " + I(cy) + "' fill='none' stroke='" + c +
         "' stroke-width='" + I(Math.max(6, s * 0.12)) +
         "' stroke-linecap='round' transform='rotate(" + aa + " " + I(cx) +
         " " + I(cy) + ")'/>";
}

var GEO_FAMS = {
  Circles: ["circle", "ring", "semi"],
  Triangles: ["triangle", "quarter", "triangle"],
  Bars: ["bar", "bar", "ring"],
  Arcs: ["arc", "semi", "arc"],
  Mixed: ["circle", "triangle", "bar", "arc", "semi", "quarter", "ring"]
};

function geoCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "place", salt);
  var s;

  if (chosen.background === "Wash") {
    s = bgWash(artDrawRng(seed, key, "bg", salt), P);
  } else if (chosen.background === "Split") {
    var y1 = artInt(rng, 60, 300);
    var y2 = artInt(rng, 212, 452);
    s = "<rect width='512' height='512' fill='" + P.bg0 + "'/>" +
        "<path d='M0 512L0 " + y1 + "L512 " + y2 + "L512 512Z' fill='" +
        P.bg1 + "'/>";
  } else {
    s = bgPlain(rng, P);
  }

  var counts = { Minimal: [3, 5], Balanced: [6, 9], Busy: [10, 14] };
  var k = artInt(rng, counts[chosen.density][0], counts[chosen.density][1]);
  var fam = GEO_FAMS[chosen.forms];
  var cols = [P.body, P.accent, P.body2, P.glow];

  /* positions per layout */
  var pos = [];
  var i, t;
  if (chosen.layout === "Grid-3" || chosen.layout === "Grid-2") {
    var anchors = chosen.layout === "Grid-3" ? [85, 256, 427] : [170, 342];
    var cells = [];
    for (i = 0; i < anchors.length; i++) {
      for (var j = 0; j < anchors.length; j++) { cells.push([anchors[i], anchors[j]]); }
    }
    /* Fisher-Yates on the draw stream */
    for (i = cells.length - 1; i > 0; i--) {
      var sw = Math.floor(rng() * (i + 1));
      var tmp = cells[i]; cells[i] = cells[sw]; cells[sw] = tmp;
    }
    for (i = 0; i < k; i++) {
      var cell = cells[i % cells.length];
      pos.push([cell[0] + artRange(rng, -14, 14), cell[1] + artRange(rng, -14, 14),
                artRange(rng, 60, chosen.layout === "Grid-3" ? 120 : 160)]);
    }
  } else if (chosen.layout === "Band") {
    var th = artPick(rng, [30, 45, 60]) * Math.PI / 180;
    for (i = 0; i < k; i++) {
      t = -230 + (460 / Math.max(1, k - 1)) * i + artRange(rng, -14, 14);
      var lat = artRange(rng, -30, 30);
      pos.push([256 + Math.cos(th) * t - Math.sin(th) * lat,
                256 + Math.sin(th) * t + Math.cos(th) * lat,
                artRange(rng, 50, 110)]);
    }
  } else if (chosen.layout === "Orbit") {
    var orad = artRange(rng, 150, 190);
    s += "<circle cx='256' cy='256' r='" + I(orad) +
         "' fill='none' stroke='" + P.bg1 +
         "' stroke-width='1.5' stroke-dasharray='5 7'/>";
    var a0 = artRange(rng, 0, 6.283);
    for (i = 0; i < k; i++) {
      var ang = a0 + i * 2.39996;
      var rr = orad + artRange(rng, -12, 12);
      pos.push([256 + Math.cos(ang) * rr, 256 + Math.sin(ang) * rr,
                artRange(rng, 44, 84)]);
    }
  } else { /* Scatter */
    for (i = 0; i < k; i++) {
      pos.push([artRange(rng, 80, 432), artRange(rng, 80, 432),
                artRange(rng, 50, 140)]);
    }
  }

  /* one large anchor element on non-orbit layouts */
  if (chosen.layout !== "Orbit" && pos.length) { pos[0][2] = artRange(rng, 140, 180); }
  /* draw large -> small so small sits on top */
  pos.sort(function (a, b) { return b[2] - a[2]; });

  var texId = "";
  if (chosen.texture !== "None") {
    var tc = chosen.texture === "Stripes"
      ? "<path d='M0 6L6 0' stroke='" + P.body2 + "' stroke-width='2'/>"
      : "<circle cx='3' cy='3' r='1.4' fill='" + P.body2 + "'/>";
    s += "<defs><pattern id='tx' width='6' height='6' patternUnits='userSpaceOnUse'>" +
         "<rect width='6' height='6' fill='" + P.bg1 + "'/>" + tc +
         "</pattern></defs>";
    texId = "url(#tx)";
  }

  for (i = 0; i < pos.length; i++) {
    var kind = artPick(rng, fam);
    var c = (i === 0 && texId) ? texId : cols[i % cols.length];
    s += geoShape(rng, kind, pos[i][0], pos[i][1], pos[i][2], c);
  }

  if (chosen.focal !== "None") {
    var fs = artRange(rng, 44, 72);
    if (chosen.focal === "Disc") {
      s += "<circle cx='256' cy='256' r='" + I(fs / 2) + "' fill='" + P.glow +
           "' opacity='0.92'/>";
    } else if (chosen.focal === "Wedge") {
      s += geoShape(rng, "quarter", 256, 256, fs * 1.4, P.glow);
    } else {
      s += "<circle cx='256' cy='256' r='" + I(fs / 2) + "' fill='none' stroke='" +
           P.glow + "' stroke-width='6'/>";
    }
  }
  return s;
}

/* ======================================================================
 * PACK: mandala — dihedral D_k rosettes
 * ====================================================================== */

function mandalaSlots() {
  return [
    { key: "symmetry", label: "Symmetry", variants: [
      { name: "6-fold", weight: 22 }, { name: "8-fold", weight: 26 },
      { name: "12-fold", weight: 22 }, { name: "16-fold", weight: 18 },
      { name: "24-fold", weight: 12 } ] },
    { key: "reflect", label: "Rotation", variants: [
      { name: "Mirrored", weight: 55 }, { name: "Pinwheel", weight: 45 } ] },
    { key: "rings", label: "Rings", variants: [
      { name: "Sparse", weight: 26 }, { name: "Balanced", weight: 36 },
      { name: "Rich", weight: 26 }, { name: "Dense", weight: 12 } ] },
    { key: "motif", label: "Motif", variants: [
      { name: "Petal", weight: 26 }, { name: "Lens", weight: 20 },
      { name: "Geometric", weight: 20 }, { name: "Dot Chain", weight: 18 },
      { name: "Thorn", weight: 16 } ] },
    { key: "core", label: "Core", variants: [
      { name: "Disc", weight: 30 }, { name: "Ring", weight: 26 },
      { name: "Star", weight: 24 }, { name: "Eye", weight: 20 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Wash", weight: 40 }, { name: "Rings", weight: 32 },
      { name: "Dots", weight: 28 } ] },
    { key: "rim", label: "Rim", variants: [
      { name: "None", weight: 50 }, { name: "Halo", weight: 30 },
      { name: "Double", weight: 20 } ] }
  ];
}

var MANDALA_K = { "6-fold": 6, "8-fold": 8, "12-fold": 12, "16-fold": 16, "24-fold": 24 };
var MANDALA_R = { Sparse: 3, Balanced: 4, Rich: 5, Dense: 6 };

/* one motif on the +x ray at radius r; asym skews control points for C_k */
function mandalaMotif(rng, kind, r, w2, h, c, op, asym) {
  var cx = 256 + r;
  var topW = w2 * (1 - asym);
  var botW = w2 * (1 + asym);
  if (kind === "Petal") {
    return "<path d='M" + N(cx - h) + " 256Q" + N(cx) + " " + N(256 - topW) +
      " " + N(cx + h) + " 256Q" + N(cx) + " " + N(256 + botW) + " " +
      N(cx - h) + " 256Z' fill='" + c + "' opacity='" + op + "'/>";
  }
  if (kind === "Lens") {
    return "<ellipse cx='" + N(cx) + "' cy='256' rx='" + N(h) + "' ry='" +
      N(w2 * 0.8) + "' fill='" + c + "' opacity='" + op + "'" +
      (asym ? " transform='rotate(" + N(asym * 28) + " " + N(cx) + " 256)'" : "") +
      "/>";
  }
  if (kind === "Geometric") {
    return "<polygon points='" + N(cx - h) + ",256 " + N(cx) + "," +
      N(256 - topW) + " " + N(cx + h) + ",256 " + N(cx) + "," + N(256 + botW) +
      "' fill='" + c + "' opacity='" + op + "'/>";
  }
  if (kind === "Dot Chain") {
    var rr = N(Math.max(2.5, w2 * 0.42));
    return "<g fill='" + c + "' opacity='" + op + "'>" +
      "<circle cx='" + N(cx - h * 0.7) + "' cy='256' r='" + N(rr * 0.7) + "'/>" +
      "<circle cx='" + N(cx) + "' cy='" + N(256 - asym * w2 * 0.5) + "' r='" + rr + "'/>" +
      "<circle cx='" + N(cx + h * 0.7) + "' cy='256' r='" + N(rr * 0.7) + "'/></g>";
  }
  /* Thorn */
  return "<polygon points='" + N(cx - h) + "," + N(256 - topW) + " " +
    N(cx + h) + ",256 " + N(cx - h) + "," + N(256 + botW) + "' fill='" + c +
    "' opacity='" + op + "'/>";
}

function mandalaCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "geom", salt);
  var k = MANDALA_K[chosen.symmetry];
  var nR = MANDALA_R[chosen.rings];
  var s = ART_BG[chosen.background](artDrawRng(seed, key, "bg", salt), P);

  var r0 = artRange(rng, 44, 60);
  var rMax = artRange(rng, 200, 228);
  var step = (rMax - r0) / Math.max(1, nR - 1);
  var fill = artRange(rng, 0.72, 0.95);
  var asym = chosen.reflect === "Pinwheel" ? artRange(rng, 0.15, 0.45) : 0;
  var cols = [P.body, P.accent, P.glow, P.body2];

  /* low symmetry counts leave sparse rings - lengthen motifs to compensate */
  var boost = k <= 8 ? 1.35 : 1;
  var slice = "";
  for (var i = 0; i < nR; i++) {
    var r = r0 + i * step;
    var w2 = Math.min(34, r * Math.sin(Math.PI / k) * fill);
    var h = (artRange(rng, 0.5, 0.9) * step * 0.62 + w2 * 0.4) * boost;
    slice += mandalaMotif(rng, chosen.motif, r, w2, h, cols[i % 4],
                          N(0.95 - i * 0.05), asym);
  }
  s += "<defs><g id='s'>" + slice + "</g></defs>";
  for (var u = 0; u < k; u++) {
    s += "<use href='#s' transform='rotate(" + N(360 * u / k) + " 256 256)'/>";
  }

  /* core medallion */
  var cr = r0 * 0.62;
  if (chosen.core === "Disc") {
    s += "<circle cx='256' cy='256' r='" + N(cr) + "' fill='" + P.glow +
         "'/><circle cx='256' cy='256' r='" + N(cr * 0.45) + "' fill='" +
         P.accent + "'/>";
  } else if (chosen.core === "Ring") {
    s += "<circle cx='256' cy='256' r='" + N(cr) + "' fill='none' stroke='" +
         P.glow + "' stroke-width='5'/><circle cx='256' cy='256' r='" +
         N(cr * 0.55) + "' fill='none' stroke='" + P.accent + "' stroke-width='3'/>";
  } else if (chosen.core === "Star") {
    var sp = "";
    for (var st = 0; st < 8; st++) {
      var a1 = st * Math.PI / 4;
      var a2 = a1 + Math.PI / 8;
      sp += (st ? "L" : "M") + N(256 + Math.cos(a1) * cr) + " " +
            N(256 + Math.sin(a1) * cr) + "L" + N(256 + Math.cos(a2) * cr * 0.42) +
            " " + N(256 + Math.sin(a2) * cr * 0.42);
    }
    s += "<path d='" + sp + "Z' fill='" + P.glow + "'/>";
  } else { /* Eye */
    s += "<ellipse cx='256' cy='256' rx='" + N(cr) + "' ry='" + N(cr * 0.6) +
         "' fill='" + P.glow + "'/><circle cx='256' cy='256' r='" +
         N(cr * 0.34) + "' fill='" + P.ink + "'/><circle cx='" +
         N(256 + cr * 0.12) + "' cy='" + N(256 - cr * 0.12) + "' r='" +
         N(cr * 0.1) + "' fill='#fff'/>";
  }

  if (chosen.rim !== "None") {
    s += "<circle cx='256' cy='256' r='" + N(rMax + 12) +
         "' fill='none' stroke='" + P.accent + "' stroke-width='2' opacity='0.8'/>";
    if (chosen.rim === "Double") {
      s += "<circle cx='256' cy='256' r='" + N(rMax + 20) +
           "' fill='none' stroke='" + P.body2 + "' stroke-width='1.5' opacity='0.6'/>";
    }
  }
  return s;
}

/* ======================================================================
 * PACK: pixel — sprite grids with mirror symmetries
 * ====================================================================== */

function pixelSlots() {
  return [
    { key: "res", label: "Resolution", variants: [
      { name: "16", weight: 35 }, { name: "24", weight: 40 },
      { name: "32", weight: 25 } ] },
    { key: "symmetry", label: "Symmetry", variants: [
      { name: "Mirror", weight: 40 }, { name: "Quad", weight: 25 },
      { name: "Totem", weight: 20 }, { name: "Chaos", weight: 15 } ] },
    { key: "mask", label: "Mask", variants: [
      { name: "Core", weight: 32 }, { name: "Column", weight: 24 },
      { name: "Diamond", weight: 22 }, { name: "Field", weight: 22 } ] },
    { key: "density", label: "Density", variants: [
      { name: "Sparse", weight: 30 }, { name: "Medium", weight: 45 },
      { name: "Dense", weight: 25 } ] },
    { key: "coloring", label: "Coloring", variants: [
      { name: "Duo", weight: 30 }, { name: "Trio", weight: 40 },
      { name: "Spark", weight: 30 } ] },
    { key: "outline", label: "Outline", variants: [
      { name: "None", weight: 50 }, { name: "Ink", weight: 50 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Plain", weight: 36 }, { name: "Wash", weight: 34 },
      { name: "Grid", weight: 30 } ] }
  ];
}

/* horizontal run-length merge of one color index into a compact path */
function pxRuns(cells, cols, rows, ci) {
  var d = "";
  for (var y = 0; y < rows; y++) {
    var x = 0;
    while (x < cols) {
      if (cells[y * cols + x] === ci) {
        var w = 1;
        while (x + w < cols && cells[y * cols + x + w] === ci) { w++; }
        d += "M" + x + " " + y + "h" + w + "v1h-" + w + "z";
        x += w;
      } else { x++; }
    }
  }
  return d;
}

/* deterministic byte safety valve: if a draw comes out too heavy, redraw with
 * a thinner field (fresh stream per attempt, so retries stay reproducible) */
function pixelCompose(seed, salt, key, chosen, P) {
  var out = null;
  for (var attempt = 0; attempt < 3; attempt++) {
    out = pixelDraw(seed, salt + (attempt ? "|thin" + attempt : ""), key,
                    chosen, P, Math.pow(0.78, attempt));
    if (out.length <= 5300) { return out; }
  }
  return out;
}

function pixelDraw(seed, salt, key, chosen, P, thin) {
  var rng = artDrawRng(seed, key, "cells", salt);
  var crng = artDrawRng(seed, key, "color", salt);
  var n = parseInt(chosen.res, 10);
  var sym = chosen.symmetry;
  var cols = (sym === "Mirror" || sym === "Quad") ? n / 2 : n;
  var rows = (sym === "Totem" || sym === "Quad") ? n / 2 : n;
  var p = { Sparse: 0.42, Medium: 0.52, Dense: 0.62 }[chosen.density] * thin;
  /* full 32-grid with no symmetry reuse is the byte worst case - thin it */
  if (sym === "Chaos" && n === 32) { p *= 0.78; }
  var cx = n / 2, cy = n / 2;
  var dmax = Math.sqrt(cx * cx + cy * cy);

  function mask(x, y) {
    if (chosen.mask === "Core") {
      var dx = x - cx, dy = y - cy;
      var d = Math.sqrt(dx * dx + dy * dy) / dmax;
      return 1 - d * d;
    }
    if (chosen.mask === "Column") { return 1 - Math.abs(x - cx) / cx * 0.8; }
    if (chosen.mask === "Diamond") {
      return Math.max(0, 1 - (Math.abs(x - cx) + Math.abs(y - cy)) / dmax);
    }
    return 0.9;
  }

  /* 1) on/off field (row-major, deterministic) */
  var on = [];
  var x, y, i;
  for (y = 0; y < rows; y++) {
    for (x = 0; x < cols; x++) { on.push(rng() < p * mask(x, y) ? 1 : 0); }
  }
  /* 2) two smoothing passes: grow clumps (birth>=3), keep connected cells
   * (survive with any neighbour). Clumps = longer runs = fewer path bytes,
   * and connected masses read as sprites instead of noise. */
  var sm = on;
  for (var pass = 0; pass < 2; pass++) {
    var src = sm;
    sm = src.slice();
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        var cnt = 0;
        if (x > 0 && src[y * cols + x - 1]) { cnt++; }
        if (x < cols - 1 && src[y * cols + x + 1]) { cnt++; }
        if (y > 0 && src[(y - 1) * cols + x]) { cnt++; }
        if (y < rows - 1 && src[(y + 1) * cols + x]) { cnt++; }
        sm[y * cols + x] = src[y * cols + x] ? (cnt >= 1 ? 1 : 0) : (cnt >= 3 ? 1 : 0);
      }
    }
  }
  /* 3) colors: cell value 1..4 indexes palette list */
  var pal = chosen.coloring === "Duo" ? [P.body, P.body2]
          : chosen.coloring === "Trio" ? [P.body, P.body2, P.accent]
          : [P.body, P.body2, P.accent, P.glow];
  var wts = chosen.coloring === "Duo" ? [0.62, 1]
          : chosen.coloring === "Trio" ? [0.55, 0.8, 1]
          : [0.52, 0.76, 0.94, 1];
  var cells = [];
  for (i = 0; i < sm.length; i++) {
    if (!sm[i]) { cells.push(0); continue; }
    var roll = crng();
    var ci = 1;
    while (ci <= wts.length && roll > wts[ci - 1]) { ci++; }
    cells.push(Math.min(ci, pal.length));
  }
  /* 4) ink outline: off-cells 4-adjacent to on-cells */
  var INK = pal.length + 1;
  if (chosen.outline === "Ink") {
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        if (cells[y * cols + x]) { continue; }
        var adj = (x > 0 && cells[y * cols + x - 1] >= 1 && cells[y * cols + x - 1] < INK) ||
                  (x < cols - 1 && cells[y * cols + x + 1] >= 1 && cells[y * cols + x + 1] < INK) ||
                  (y > 0 && cells[(y - 1) * cols + x] >= 1 && cells[(y - 1) * cols + x] < INK) ||
                  (y < rows - 1 && cells[(y + 1) * cols + x] >= 1 && cells[(y + 1) * cols + x] < INK);
        if (adj) { cells[y * cols + x] = INK; }
      }
    }
    pal.push(P.ink);
  }

  var s = chosen.background === "Wash" ? bgWash(artDrawRng(seed, key, "bg", salt), P)
        : chosen.background === "Grid" ? bgGrid(artDrawRng(seed, key, "bg", salt), P)
        : bgPlain(rng, P);

  var body = "";
  for (i = 0; i < pal.length; i++) {
    var d = pxRuns(cells, cols, rows, i + 1);
    if (d) { body += "<path fill='" + pal[i] + "' d='" + d + "'/>"; }
  }
  var S = N(384 / n);
  s += "<g transform='translate(64 64) scale(" + S +
       ")' shape-rendering='crispEdges'>";
  if (sym === "Chaos") {
    s += body;
  } else {
    s += "<g id='h'>" + body + "</g>";
    if (sym === "Mirror" || sym === "Quad") {
      s += "<use href='#h' transform='matrix(-1 0 0 1 " + n + " 0)'/>";
    }
    if (sym === "Totem" || sym === "Quad") {
      s += "<use href='#h' transform='matrix(1 0 0 -1 0 " + n + ")'/>";
    }
    if (sym === "Quad") {
      s += "<use href='#h' transform='matrix(-1 0 0 -1 " + n + " " + n + ")'/>";
    }
  }
  return s + "</g>";
}

/* ======================================================================
 * PACK: phyllo — golden-angle spirals (Vogel model)
 * ====================================================================== */

function phylloSlots() {
  return [
    { key: "count", label: "Seeds", variants: [
      { name: "120", weight: 30 }, { name: "150", weight: 40 },
      { name: "180", weight: 30 } ] },
    { key: "element", label: "Element", variants: [
      { name: "Dot", weight: 36 }, { name: "Ray", weight: 26 },
      { name: "Seed", weight: 18 }, { name: "Duotone", weight: 20 } ] },
    { key: "ramp", label: "Size ramp", variants: [
      { name: "Bloom", weight: 34 }, { name: "Core", weight: 28 },
      { name: "Pulse", weight: 22 }, { name: "Even", weight: 16 } ] },
    { key: "connector", label: "Connector", variants: [
      { name: "None", weight: 40 }, { name: "Fermat", weight: 22 },
      { name: "Arms-8", weight: 20 }, { name: "Arms-13", weight: 18 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Wash", weight: 45 }, { name: "Plain", weight: 30 },
      { name: "Rings", weight: 25 } ] }
  ];
}

function phylloCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "seeds", salt);
  var n = parseInt(chosen.count, 10);
  var c = 224 / Math.sqrt(n);
  var phase = artRange(rng, 0, 6.28318);
  var GA = 2.39996323;

  var pts = [];
  var i;
  for (i = 1; i <= n; i++) {
    var th = i * GA + phase;
    var r = c * Math.sqrt(i);
    var u = i / n;
    var sz = chosen.ramp === "Bloom" ? 2 + 8 * Math.pow(u, 1.2)
           : chosen.ramp === "Core" ? 10 - 8 * Math.pow(u, 0.9)
           : chosen.ramp === "Pulse" ? 5.5 + 3.5 * Math.sin(6 * Math.PI * u)
           : 5;
    /* quantize size to bands so dots pack into few stroked paths */
    var band = sz <= 3 ? 2 : sz <= 5 ? 4 : sz <= 7 ? 6 : sz <= 9 ? 8 : 10;
    var col = chosen.element === "Duotone"
      ? (i % 2 ? P.body : P.accent)
      : (r < 75 ? P.glow : r < 150 ? P.body : P.accent);
    pts.push({ x: I(256 + Math.cos(th) * r), y: I(256 + Math.sin(th) * r),
               th: th, band: band, col: col });
  }

  var s = ART_BG[chosen.background](artDrawRng(seed, key, "bg", salt), P);

  /* connectors underneath */
  if (chosen.connector !== "None") {
    var m = chosen.connector === "Fermat" ? 1
          : chosen.connector === "Arms-8" ? 8 : 13;
    s += "<g fill='none' stroke='" + P.body2 + "' stroke-width='1.5' opacity='0.55'>";
    for (var j = 0; j < m; j++) {
      var d = "";
      for (i = j; i < n; i += m) {
        d += (d ? "L" : "M") + pts[i].x + " " + pts[i].y;
      }
      s += "<path d='" + d + "'/>";
    }
    s += "</g>";
  }

  /* dots as stroked path caps: one path per (band,color) */
  var groups = {};
  for (i = 0; i < n; i++) {
    var pt = pts[i];
    var gk = pt.band + "|" + pt.col;
    if (!groups[gk]) { groups[gk] = ""; }
    if (chosen.element === "Ray") {
      var len = pt.band * 1.7;
      groups[gk] += "M" + pt.x + " " + pt.y + "L" +
        I(pt.x + Math.cos(pt.th) * len) + " " + I(pt.y + Math.sin(pt.th) * len);
    } else {
      groups[gk] += "M" + pt.x + " " + pt.y + "h.5";
    }
  }
  var cap = chosen.element === "Seed" ? "square" : "round";
  for (var gk2 in groups) {
    if (!groups.hasOwnProperty(gk2)) { continue; }
    var parts = gk2.split("|");
    var w = chosen.element === "Ray" ? Math.max(1.5, parts[0] * 0.45) : parts[0];
    s += "<path fill='none' stroke='" + parts[1] + "' stroke-width='" + N(w) +
         "' stroke-linecap='" + cap + "' d='" + groups[gk2] + "'/>";
  }
  return s;
}

/* ======================================================================
 * PACK: curves — spirograph / rose / Lissajous / harmonograph / superformula
 * ====================================================================== */

function curvesSlots() {
  return [
    { key: "family", label: "Family", variants: [
      { name: "Spirograph", weight: 26 }, { name: "Rose", weight: 22 },
      { name: "Lissajous", weight: 20 }, { name: "Harmonograph", weight: 18 },
      { name: "Superformula", weight: 14 } ] },
    { key: "layers", label: "Layers", variants: [
      { name: "Solo", weight: 34 }, { name: "Echo", weight: 36 },
      { name: "Duet", weight: 30 } ] },
    { key: "ink", label: "Ink", variants: [
      { name: "Fine", weight: 32 }, { name: "Bold", weight: 34 },
      { name: "Neon", weight: 34 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Wash", weight: 44 }, { name: "Grid", weight: 28 },
      { name: "Dots", weight: 28 } ] },
    { key: "trim", label: "Trim", variants: [
      { name: "None", weight: 58 }, { name: "Frame", weight: 42 } ] }
  ];
}

/* sample one parametric curve; returns {d, closed} with integer coords */
function curveSample(rng, family, maxPts) {
  var pts = [];
  var i, t, x, y;
  function emit(px, py, A) {
    pts.push(I(256 + px * A) + " " + I(256 + py * A));
  }
  if (family === "Spirograph") {
    var RR = artPick(rng, [[7, 3], [8, 3], [7, 4], [9, 4], [11, 5], [12, 5], [13, 6], [11, 3]]);
    var a = RR[0] / RR[1];
    var m = artRange(rng, 0.55, 1.55);
    var A = 215 / ((a - 1) + m);
    var revs = RR[1];
    var per = Math.floor(maxPts / revs);
    for (i = 0; i <= revs * per; i++) {
      t = (i / per) * Math.PI * 2;
      emit((a - 1) * Math.cos(t) + m * Math.cos((a - 1) * t),
           (a - 1) * Math.sin(t) - m * Math.sin((a - 1) * t), A);
    }
    return { pts: pts, closed: true };
  }
  if (family === "Rose") {
    var pq = artPick(rng, [[3, 1], [4, 1], [5, 1], [7, 1], [3, 2], [5, 2], [5, 3], [7, 2], [7, 3], [4, 3]]);
    var kk = pq[0] / pq[1];
    var thMax = (pq[0] * pq[1]) % 2 === 1 ? Math.PI * pq[1] : Math.PI * 2 * pq[1];
    var np = Math.min(maxPts, 320);
    for (i = 0; i <= np; i++) {
      t = (i / np) * thMax;
      var rr = Math.cos(kk * t);
      emit(rr * Math.cos(t), rr * Math.sin(t), 215);
    }
    return { pts: pts, closed: true };
  }
  if (family === "Lissajous") {
    var ab = artPick(rng, [[3, 2], [5, 4], [4, 3], [5, 2], [7, 4], [7, 6]]);
    var del = artPick(rng, [Math.PI / 2, Math.PI / 4, Math.PI / 6]);
    var nl = Math.min(maxPts, 320);
    for (i = 0; i <= nl; i++) {
      t = (i / nl) * Math.PI * 2;
      emit(Math.sin(ab[0] * t + del), Math.sin(ab[1] * t), 215);
    }
    return { pts: pts, closed: true };
  }
  if (family === "Harmonograph") {
    var f1 = artInt(rng, 2, 6), f2 = artInt(rng, 2, 6);
    var f3 = artInt(rng, 2, 6), f4 = artInt(rng, 2, 6);
    var eps = artRange(rng, 0.005, 0.02);
    var lam = artRange(rng, 0.05, 0.12);
    var p1 = artRange(rng, 0, 6.283), p2 = artRange(rng, 0, 6.283);
    var p3 = artRange(rng, 0, 6.283), p4 = artRange(rng, 0, 6.283);
    var A = 215 / 1.5;
    for (i = 0; i <= maxPts; i++) {
      t = (i / maxPts) * Math.PI * 8;
      var damp = Math.exp(-lam * t);
      emit((Math.sin((f1 + eps) * t + p1) + 0.5 * Math.sin(f3 * t + p3)) * damp,
           (Math.sin(f2 * t + p2) + 0.5 * Math.sin(f4 * t + p4)) * damp, A);
    }
    return { pts: pts, closed: false };
  }
  /* Superformula (Gielis), a=b=1 */
  var mm = artPick(rng, [5, 6, 7, 8, 10, 12]);
  var nn = artPick(rng, [[0.5, 8, 8], [1, 4, 4], [2, 7, 7], [0.4, 12, 15],
                         [1, 1, 6], [3, 6, 6], [0.7, 3, 10]]);
  var raw = [];
  var rMax = 0;
  var ns = Math.min(maxPts, 200);
  for (i = 0; i <= ns; i++) {
    t = (i / ns) * Math.PI * 2;
    var r1 = Math.pow(
      Math.pow(Math.abs(Math.cos(mm * t / 4)), nn[1]) +
      Math.pow(Math.abs(Math.sin(mm * t / 4)), nn[2]), -1 / nn[0]);
    if (r1 > rMax) { rMax = r1; }
    raw.push([r1 * Math.cos(t), r1 * Math.sin(t)]);
  }
  var sc = 210 / rMax;
  for (i = 0; i < raw.length; i++) { emit(raw[i][0], raw[i][1], sc); }
  return { pts: pts, closed: true, isSuper: true };
}

function curvePath(sample) {
  return "M" + sample.pts.join("L") + (sample.closed ? "Z" : "");
}

function curvesCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "curve", salt);
  var s = ART_BG[chosen.background === "Grid" ? "Grid" :
                 chosen.background === "Dots" ? "Dots" : "Wash"](
            artDrawRng(seed, key, "bg", salt), P);

  var main = curveSample(rng, chosen.family, chosen.layers === "Duet" ? 220 : 340);
  s += "<defs><path id='c1' d='" + curvePath(main) + "'/></defs>";

  var fillAttr = main.isSuper ? " fill='" + P.accent + "' fill-opacity='0.12'"
                              : " fill='none'";

  /* echo copies underneath (moire interference) */
  if (chosen.layers === "Echo") {
    var ne = artInt(rng, 2, 3);
    for (var e = 1; e <= ne; e++) {
      s += "<use href='#c1'" + fillAttr + " stroke='" +
           (e % 2 ? P.body2 : P.accent) + "' stroke-width='1.2' opacity='" +
           N(0.55 - e * 0.12) + "' transform='rotate(" +
           N(e * artRange(rng, 4, 12)) + " 256 256)'/>";
    }
  }
  if (chosen.layers === "Duet") {
    var second = curveSample(artDrawRng(seed, key, "duet", salt),
                             chosen.family, 140);
    s += "<path d='" + curvePath(second) + "' fill='none' stroke='" + P.body2 +
         "' stroke-width='1.5' opacity='0.65'/>";
  }
  if (main.isSuper) {
    /* nested shrinking copies */
    s += "<use href='#c1' fill='none' stroke='" + P.body2 +
         "' stroke-width='1.5' opacity='0.7' transform='translate(97.3 97.3) scale(0.62)'/>";
    s += "<use href='#c1' fill='none' stroke='" + P.glow +
         "' stroke-width='1.5' opacity='0.8' transform='translate(158.7 158.7) scale(0.38)'/>";
  }

  /* main ink pass on top */
  if (chosen.ink === "Neon") {
    s += "<use href='#c1'" + fillAttr + " stroke='" + P.glow +
         "' stroke-width='7' opacity='0.22' stroke-linecap='round'/>";
    s += "<use href='#c1' fill='none' stroke='" + P.accent +
         "' stroke-width='2'/>";
  } else if (chosen.ink === "Bold") {
    s += "<use href='#c1'" + fillAttr + " stroke='" + P.body +
         "' stroke-width='3'/>";
  } else {
    s += "<use href='#c1'" + fillAttr + " stroke='" + P.glow +
         "' stroke-width='1.5'/>";
  }

  if (chosen.trim === "Frame") {
    s += fxFrame(artDrawRng(seed, key, "trim", salt), P);
  }
  return s;
}

/* ======================================================================
 * PACK: truchet — emergent arc mazes on an integer tile grid
 * ====================================================================== */

function truchetSlots() {
  return [
    { key: "grid", label: "Grid", variants: [
      { name: "8", weight: 28 }, { name: "10", weight: 28 },
      { name: "12", weight: 26 }, { name: "14", weight: 18 } ] },
    { key: "tiles", label: "Tiles", variants: [
      { name: "Arcs", weight: 40 }, { name: "Diagonals", weight: 22 },
      { name: "Quarter Fans", weight: 20 }, { name: "Arcs+Dots", weight: 18 } ] },
    { key: "symmetry", label: "Symmetry", variants: [
      { name: "None", weight: 30 }, { name: "Mirror", weight: 26 },
      { name: "Rot2", weight: 24 }, { name: "Quad", weight: 20 } ] },
    { key: "stroke", label: "Stroke", variants: [
      { name: "Fine", weight: 28 }, { name: "Bold", weight: 46 },
      { name: "Heavy", weight: 26 } ] },
    { key: "color", label: "Color", variants: [
      { name: "Mono", weight: 32 }, { name: "Duo", weight: 42 },
      { name: "Glow", weight: 26 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Plain", weight: 45 }, { name: "Wash", weight: 30 },
      { name: "Dots", weight: 25 } ] }
  ];
}

function truchetCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "tiles", salt);
  var n = parseInt(chosen.grid, 10);
  var sw = { Fine: 0.28, Bold: 0.45, Heavy: 0.7 }[chosen.stroke];
  var cA = chosen.color === "Mono" ? P.body
         : chosen.color === "Duo" ? P.body : P.glow;
  var cB = chosen.color === "Mono" ? P.body
         : chosen.color === "Duo" ? P.accent : P.accent;

  var s = ART_BG[chosen.background === "Wash" ? "Wash" :
                 chosen.background === "Dots" ? "Dots" : "Plain"](
            artDrawRng(seed, key, "bg", salt), P);

  /* tile defs in 2x2 grid units; stroke/fill live on the defs */
  var defA, defB;
  var att = " fill='none' stroke-width='" + sw + "' stroke-linecap='round'";
  if (chosen.tiles === "Diagonals") {
    defA = "<path id='a' d='M0 2L2 0'" + att + " stroke='" + cA + "'/>";
    defB = "<path id='b' d='M0 0L2 2'" + att + " stroke='" + cB + "'/>";
  } else if (chosen.tiles === "Quarter Fans") {
    defA = "<path id='a' d='M0 1A1 1 0 0 0 1 0L0 0ZM1 2A1 1 0 0 1 2 1L2 2Z' fill='" + cA + "'/>";
    defB = "<path id='b' d='M1 0A1 1 0 0 1 2 1L2 0ZM0 1A1 1 0 0 0 1 2L0 2Z' fill='" + cB + "'/>";
  } else {
    defA = "<path id='a' d='M0 1A1 1 0 0 0 1 0M1 2A1 1 0 0 1 2 1'" + att +
           " stroke='" + cA + "'/>";
    defB = "<path id='b' d='M1 0A1 1 0 0 1 2 1M0 1A1 1 0 0 0 1 2'" + att +
           " stroke='" + cB + "'/>";
    if (chosen.tiles === "Arcs+Dots") {
      /* dot lives INSIDE def #a: appears on ~half the tiles at zero marginal
       * bytes (a separate per-tile use blew the budget at 14x14) */
      defA = "<g id='a'>" + defA.replace("id='a' ", "") +
             "<circle cx='1' cy='1' r='.22' fill='" + cB + "'/></g>";
    }
  }
  s += "<defs>" + defA + defB + "</defs>";

  var cols = (chosen.symmetry === "Mirror" || chosen.symmetry === "Quad") ? n / 2 : n;
  var rows = (chosen.symmetry === "Rot2" || chosen.symmetry === "Quad") ? n / 2 : n;
  var W = 2 * n;

  var body = "";
  for (var j = 0; j < rows; j++) {
    var row = "<g transform='translate(0 " + (2 * j) + ")'>";
    for (var i = 0; i < cols; i++) {
      row += "<use href='#" + (rng() < 0.5 ? "a" : "b") + "' x='" + (2 * i) + "'/>";
    }
    body += row + "</g>";
  }

  s += "<g transform='scale(" + N(512 / W) + ")'>";
  if (chosen.symmetry === "None") {
    s += body;
  } else {
    s += "<g id='q'>" + body + "</g>";
    if (chosen.symmetry === "Mirror") {
      s += "<use href='#q' transform='matrix(-1 0 0 1 " + W + " 0)'/>";
    } else if (chosen.symmetry === "Rot2") {
      s += "<use href='#q' transform='matrix(-1 0 0 -1 " + W + " " + W + ")'/>";
    } else {
      s += "<use href='#q' transform='matrix(-1 0 0 1 " + W + " 0)'/>" +
           "<use href='#q' transform='matrix(1 0 0 -1 0 " + W + ")'/>" +
           "<use href='#q' transform='matrix(-1 0 0 -1 " + W + " " + W + ")'/>";
    }
  }
  return s + "</g>";
}

/* ======================================================================
 * PACK: mondrian — neoplastic grids (seeded BSP)
 * ====================================================================== */

var MONDRIAN_PALETTES = [
  { name: "Classic", weight: 50, paper: "#f4f1ea", line: "#161511",
    cols: ["#d40920", "#1356a2", "#f7d842"] },
  { name: "Warm", weight: 22, paper: "#f5ecdf", line: "#2a1d12",
    cols: ["#c8401f", "#e2872c", "#e8c33c"] },
  { name: "Cool", weight: 20, paper: "#eef0f2", line: "#1a2028",
    cols: ["#1b4f8a", "#3c8ea8", "#8fb8c9"] },
  { name: "Inverted", weight: 8, paper: "#14120e", line: "#e8e2d2",
    cols: ["#e33b4e", "#3c7edb", "#f2d24b"] }
];

function mondrianSlots() {
  return [
    { key: "depth", label: "Subdivision", variants: [
      { name: "Calm", weight: 32 }, { name: "Lively", weight: 44 },
      { name: "Boogie", weight: 24 } ] },
    { key: "line", label: "Line weight", variants: [
      { name: "Fine", weight: 28 }, { name: "Bold", weight: 46 },
      { name: "Heavy", weight: 26 } ] },
    { key: "balance", label: "Color balance", variants: [
      { name: "Paper-led", weight: 46 }, { name: "Primary-led", weight: 40 },
      { name: "Saturated", weight: 14 } ] },
    { key: "form", label: "Form", variants: [
      { name: "Rectilinear", weight: 85 }, { name: "Diamond", weight: 15 } ] }
  ];
}

function mondrianCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "bsp", salt);
  var depth = { Calm: 3, Lively: 4, Boogie: 5 }[chosen.depth];
  var lw = { Fine: 3, Bold: 6, Heavy: 10 }[chosen.line];
  var colorP = { "Paper-led": 0.3, "Primary-led": 0.5, Saturated: 0.75 }[chosen.balance];

  var leaves = [];
  function split(x, y, w, h, d) {
    if (d === 0 || (w < 100 && h < 100) || (d < depth - 1 && rng() < 0.18)) {
      leaves.push([x, y, w, h]);
      return;
    }
    var vert = w > h ? true : h > w ? false : rng() < 0.5;
    var ratio = artPick(rng, [0.33, 0.5, 0.62, 0.67]);
    if (vert) {
      split(x, y, w * ratio, h, d - 1);
      split(x + w * ratio, y, w * (1 - ratio), h, d - 1);
    } else {
      split(x, y, w, h * ratio, d - 1);
      split(x, y + h * ratio, w, h * (1 - ratio), d - 1);
    }
  }
  split(0, 0, 512, 512, depth);

  var body = "";
  for (var i = 0; i < leaves.length; i++) {
    var L = leaves[i];
    var fillc = rng() < colorP ? artPick(rng, P.cols) : P.paper;
    body += "<rect x='" + I(L[0]) + "' y='" + I(L[1]) + "' width='" +
            I(L[2]) + "' height='" + I(L[3]) + "' fill='" + fillc +
            "' stroke='" + P.line + "' stroke-width='" + lw + "'/>";
  }

  var s = "<rect width='512' height='512' fill='" + P.paper + "'/>";
  if (chosen.form === "Diamond") {
    s += "<g transform='rotate(45 256 256) scale(0.68) translate(120.5 120.5)'>" +
         body + "</g>" +
         /* diamond outer edge */
         "<rect x='75' y='75' width='362' height='362' fill='none' stroke='" +
         P.line + "' stroke-width='" + lw + "' transform='rotate(45 256 256)'/>";
  } else {
    s += body +
         "<rect x='" + (lw / 2) + "' y='" + (lw / 2) + "' width='" + (512 - lw) +
         "' height='" + (512 - lw) + "' fill='none' stroke='" + P.line +
         "' stroke-width='" + lw + "'/>";
  }
  return s;
}

/* ======================================================================
 * PACK: miro — biomorphic constellations on warm fields
 * ====================================================================== */

var MIRO_PALETTES = [
  { name: "Cream", weight: 38, field: "#f0e8d4", red: "#d2202f",
    yellow: "#ecc02b", blue: "#1c5aa6", green: "#3a7d44", black: "#16130f" },
  { name: "Sand", weight: 26, field: "#e6d5ae", red: "#c33a24",
    yellow: "#e0a92c", blue: "#28527d", green: "#4a7c3f", black: "#1a150e" },
  { name: "Sky", weight: 22, field: "#dde8ea", red: "#d63333",
    yellow: "#eec73e", blue: "#174f92", green: "#357a52", black: "#131519" },
  { name: "Night", weight: 14, field: "#1c2030", red: "#e04545",
    yellow: "#f2cf4a", blue: "#4a8ad4", green: "#59a06a", black: "#0c0d12" }
];

function miroSlots() {
  return [
    { key: "density", label: "Density", variants: [
      { name: "Airy", weight: 34 }, { name: "Lively", weight: 44 },
      { name: "Crowded", weight: 22 } ] },
    { key: "motifs", label: "Motifs", variants: [
      { name: "Blobs", weight: 24 }, { name: "Stars", weight: 20 },
      { name: "Eyes", weight: 18 }, { name: "Crescents", weight: 16 },
      { name: "Mixed", weight: 22 } ] },
    { key: "connector", label: "Connectors", variants: [
      { name: "None", weight: 34 }, { name: "Meander", weight: 38 },
      { name: "Web", weight: 28 } ] },
    { key: "lead", label: "Accent lead", variants: [
      { name: "Red-led", weight: 38 }, { name: "Blue-led", weight: 32 },
      { name: "Balanced", weight: 30 } ] }
  ];
}

/* harmonic blob: r(t) = R(1 + a1 sin(3t+p1) + a2 sin(5t+p2)) */
function miroBlob(rng, cx, cy, R, c) {
  var a1 = artRange(rng, 0.08, 0.22);
  var a2 = artRange(rng, 0.05, 0.16);
  var p1 = artRange(rng, 0, 6.283);
  var p2 = artRange(rng, 0, 6.283);
  var pts = [];
  for (var i = 0; i < 26; i++) {
    var t = (i / 26) * Math.PI * 2;
    var r = R * (1 + a1 * Math.sin(3 * t + p1) + a2 * Math.sin(5 * t + p2));
    pts.push(I(cx + Math.cos(t) * r) + "," + I(cy + Math.sin(t) * r));
  }
  return "<polygon points='" + pts.join(" ") + "' fill='" + c + "'/>";
}

function miroStar(rng, cx, cy, R, c) {
  var s = "<g stroke='" + c + "' stroke-width='" + N(Math.max(2.5, R * 0.09)) +
          "' stroke-linecap='round'>";
  var arms = artInt(rng, 3, 4);
  for (var i = 0; i < arms; i++) {
    var t = (i / arms) * Math.PI + artRange(rng, -0.1, 0.1);
    s += "<line x1='" + I(cx - Math.cos(t) * R) + "' y1='" +
         I(cy - Math.sin(t) * R) + "' x2='" + I(cx + Math.cos(t) * R) +
         "' y2='" + I(cy + Math.sin(t) * R) + "'/>";
  }
  return s + "</g>";
}

function miroCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "motifs", salt);
  var counts = { Airy: [4, 6], Lively: [7, 10], Crowded: [11, 14] };
  var k = artInt(rng, counts[chosen.density][0], counts[chosen.density][1]);
  var lead = chosen.lead === "Red-led" ? [P.red, P.red, P.blue, P.yellow]
           : chosen.lead === "Blue-led" ? [P.blue, P.blue, P.red, P.green]
           : [P.red, P.blue, P.yellow, P.green];

  var s = "<rect width='512' height='512' fill='" + P.field + "'/>";

  /* scatter positions with a light repulsion pass */
  var pos = [];
  for (var i = 0; i < k; i++) {
    var best = null;
    var bestD = -1;
    for (var trial = 0; trial < 4; trial++) {
      var px = artRange(rng, 70, 442);
      var py = artRange(rng, 70, 442);
      var dmin = 9999;
      for (var q = 0; q < pos.length; q++) {
        var dx = px - pos[q][0], dy = py - pos[q][1];
        var d = dx * dx + dy * dy;
        if (d < dmin) { dmin = d; }
      }
      if (dmin > bestD) { bestD = dmin; best = [px, py]; }
    }
    pos.push(best);
  }

  /* meander lines underneath: a smooth random walk, not a zigzag */
  if (chosen.connector === "Meander") {
    for (var mIdx = 0; mIdx < artInt(rng, 1, 2); mIdx++) {
      var wy = artRange(rng, 120, 392);
      var d2 = "M" + I(artRange(rng, -20, 40)) + " " + I(wy);
      var px2 = 0;
      while (px2 < 512) {
        var seg = artRange(rng, 110, 180);
        var wy2 = Math.max(60, Math.min(452, wy + artRange(rng, -110, 110)));
        d2 += "Q" + I(px2 + seg * 0.5) + " " +
              I(wy + artRange(rng, -50, 50)) + " " + I(px2 + seg) + " " + I(wy2);
        px2 += seg;
        wy = wy2;
      }
      s += "<path d='" + d2 + "' fill='none' stroke='" + P.black +
           "' stroke-width='2.5'/>";
    }
  } else if (chosen.connector === "Web" && pos.length > 2) {
    s += "<g stroke='" + P.black + "' stroke-width='1.8'>";
    for (var w = 0; w < Math.min(4, pos.length - 1); w++) {
      s += "<line x1='" + I(pos[w][0]) + "' y1='" + I(pos[w][1]) + "' x2='" +
           I(pos[w + 1][0]) + "' y2='" + I(pos[w + 1][1]) + "'/>";
    }
    s += "</g>";
  }

  var fams = { Blobs: ["blob", "blob", "dot"], Stars: ["star", "star", "dot"],
               Eyes: ["eye", "eye", "dot"], Crescents: ["cres", "cres", "dot"],
               Mixed: ["blob", "star", "eye", "cres", "dot"] };
  var fam = fams[chosen.motifs];

  for (var m = 0; m < k; m++) {
    var kind = artPick(rng, fam);
    var cx = pos[m][0], cy = pos[m][1];
    var R = artRange(rng, 24, m === 0 ? 88 : 62);
    /* the anchor motif is always a big black shape - Miro gravity */
    var c = (m === 0) ? P.black
          : (rng() < 0.4 ? P.black : artPick(rng, lead));
    if (kind === "blob") { s += miroBlob(rng, cx, cy, R, c); }
    else if (kind === "star") { s += miroStar(rng, cx, cy, R, P.black); }
    else if (kind === "eye") {
      s += "<ellipse cx='" + I(cx) + "' cy='" + I(cy) + "' rx='" + I(R) +
           "' ry='" + I(R * 0.55) + "' fill='none' stroke='" + P.black +
           "' stroke-width='3'/><circle cx='" + I(cx) + "' cy='" + I(cy) +
           "' r='" + I(Math.max(3, R * 0.22)) + "' fill='" +
           artPick(rng, lead) + "'/>";
    } else if (kind === "cres") {
      /* crescent: full disc + field-colored overlap disc */
      var off = R * 0.42;
      var oa = artRange(rng, 0, 6.283);
      s += "<circle cx='" + I(cx) + "' cy='" + I(cy) + "' r='" + I(R * 0.8) +
           "' fill='" + c + "'/><circle cx='" + I(cx + Math.cos(oa) * off) +
           "' cy='" + I(cy + Math.sin(oa) * off) + "' r='" + I(R * 0.74) +
           "' fill='" + P.field + "'/>";
    } else {
      s += "<circle cx='" + I(cx) + "' cy='" + I(cy) + "' r='" +
           I(Math.max(5, R * 0.3)) + "' fill='" + artPick(rng, lead) + "'/>";
    }
  }
  /* Miro's sprinkle: a few small pure-color dots always */
  for (var sp = 0; sp < artInt(rng, 2, 4); sp++) {
    s += "<circle cx='" + I(artRange(rng, 50, 462)) + "' cy='" +
         I(artRange(rng, 50, 462)) + "' r='" + I(artRange(rng, 4, 9)) +
         "' fill='" + artPick(rng, lead) + "'/>";
  }
  return s;
}

/* ======================================================================
 * PACK: kandinsky — concentric-circle grids + free compositions
 * ====================================================================== */

var KANDINSKY_PALETTES = [
  { name: "Bauhaus", weight: 45, paper: "#e8ddc4",
    cells: ["#31404f", "#8f2d1f", "#c6a72e", "#5b6b4a", "#7d3c58", "#243b52"],
    rings: ["#d8433b", "#2b5d8c", "#e0b52c", "#e8ddc4", "#3c7d5a", "#8f4f8a", "#1c1a16"] },
  { name: "Primary", weight: 25, paper: "#efe9dc",
    cells: ["#26426e", "#a03028", "#caa32c", "#3e5c42", "#5c3a63", "#20303c"],
    rings: ["#e33b30", "#2660a8", "#efc326", "#efe9dc", "#42a06a", "#12100e"] },
  { name: "Dusk", weight: 18, paper: "#2a2733",
    cells: ["#3a3547", "#54324a", "#2f4a5c", "#5c4a2f", "#463c5c", "#333d33"],
    rings: ["#e86a5c", "#6ab8e8", "#f2cf5a", "#c988e0", "#7de0b0", "#efe9dc"] },
  { name: "Pastel", weight: 12, paper: "#f2ede4",
    cells: ["#c9d6e8", "#e8cfc9", "#e8e2c2", "#cfe0d0", "#ddd0e6", "#e6d8c4"],
    rings: ["#8fa8d4", "#d48f8f", "#c9b84a", "#8fc4a0", "#a88fd4", "#4a4740"] },
  { name: "Ivory", weight: 10, paper: "#f5f1e8",
    cells: ["#e8e2d2", "#ddd6c2", "#e2dcc9", "#d5cfba", "#e6e0cf", "#d0c9b2"],
    rings: ["#c0392b", "#2c5f9e", "#d9a92c", "#3a7d5c", "#7a4a8f", "#26221c"] },
  { name: "Terra", weight: 8, paper: "#4a3527",
    cells: ["#5c4433", "#6e523c", "#54382a", "#66493a", "#48332a", "#705a42"],
    rings: ["#e2a03c", "#c95f3c", "#e8d5a0", "#8fb86a", "#d4826a", "#f0e2c9"] }
];

function kandinskySlots() {
  return [
    { key: "mode", label: "Mode", variants: [
      { name: "Circle Grid", weight: 55 }, { name: "Free", weight: 45 } ] },
    { key: "grid", label: "Grid", variants: [
      { name: "3x3", weight: 40 }, { name: "4x3", weight: 35 },
      { name: "5x4", weight: 25 } ] },
    { key: "rings", label: "Rings", variants: [
      { name: "Few", weight: 34 }, { name: "Many", weight: 42 },
      { name: "Nested", weight: 24 } ] },
    { key: "overlay", label: "Overlay", variants: [
      { name: "None", weight: 44 }, { name: "Lines", weight: 30 },
      { name: "Arcs", weight: 26 } ] }
  ];
}

function kandinskyCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "comp", salt);
  var s = "<rect width='512' height='512' fill='" + P.paper + "'/>";
  var i, j, r;

  if (chosen.mode === "Circle Grid") {
    var gx = chosen.grid === "3x3" ? 3 : chosen.grid === "4x3" ? 4 : 5;
    var gy = chosen.grid === "5x4" ? 4 : 3;
    var cw = 512 / gx;
    var ch = 512 / gy;
    var nr = chosen.rings === "Few" ? [3, 4]
           : chosen.rings === "Many" ? [5, 6] : [7, 8];
    for (j = 0; j < gy; j++) {
      for (i = 0; i < gx; i++) {
        s += "<rect x='" + I(i * cw) + "' y='" + I(j * ch) + "' width='" +
             Math.ceil(cw) + "' height='" + Math.ceil(ch) + "' fill='" +
             artPick(rng, P.cells) + "'/>";
        var cx = i * cw + cw / 2 + artRange(rng, -6, 6);
        var cy = j * ch + ch / 2 + artRange(rng, -6, 6);
        var rMax = Math.min(cw, ch) * artRange(rng, 0.36, 0.46);
        var k2 = artInt(rng, nr[0], nr[1]);
        /* byte cap: many small cells cannot also carry many rings */
        k2 = Math.min(k2, gx * gy >= 20 ? 4 : gx * gy >= 12 ? 6 : 8);
        for (r = k2; r >= 1; r--) {
          s += "<circle cx='" + I(cx) + "' cy='" + I(cy) + "' r='" +
               I(rMax * r / k2) + "' fill='" + artPick(rng, P.rings) + "'/>";
        }
      }
    }
  } else {
    /* free composition: big translucent discs, rules, arcs, small accents */
    var nD = artInt(rng, 3, 5);
    for (i = 0; i < nD; i++) {
      s += "<circle cx='" + I(artRange(rng, 110, 402)) + "' cy='" +
           I(artRange(rng, 110, 402)) + "' r='" + I(artRange(rng, 46, 130)) +
           "' fill='" + artPick(rng, P.rings) + "' opacity='" +
           N(artRange(rng, 0.55, 0.9)) + "'/>";
    }
    var ink = P.rings[P.rings.length - 1];
    s += "<g stroke='" + ink + "' stroke-width='3'>";
    var nL = artInt(rng, 2, 4);
    for (i = 0; i < nL; i++) {
      var a = artRange(rng, 0, Math.PI);
      var mx = artRange(rng, 130, 382);
      var my = artRange(rng, 130, 382);
      var len = artRange(rng, 150, 260);
      s += "<line x1='" + I(mx - Math.cos(a) * len) + "' y1='" +
           I(my - Math.sin(a) * len) + "' x2='" + I(mx + Math.cos(a) * len) +
           "' y2='" + I(my + Math.sin(a) * len) + "'/>";
    }
    s += "</g>";
    for (i = 0; i < artInt(rng, 2, 4); i++) {
      s += "<circle cx='" + I(artRange(rng, 90, 422)) + "' cy='" +
           I(artRange(rng, 90, 422)) + "' r='" + I(artRange(rng, 7, 18)) +
           "' fill='" + artPick(rng, P.rings) + "'/>";
    }
  }

  if (chosen.overlay === "Lines") {
    var ink2 = P.rings[P.rings.length - 1];
    s += "<g stroke='" + ink2 + "' stroke-width='1.5' opacity='0.65'>";
    for (i = 0; i < 3; i++) {
      var a2 = artRange(rng, 0, Math.PI);
      s += "<line x1='" + I(256 - Math.cos(a2) * 300) + "' y1='" +
           I(256 - Math.sin(a2) * 300) + "' x2='" + I(256 + Math.cos(a2) * 300) +
           "' y2='" + I(256 + Math.sin(a2) * 300) + "'/>";
    }
    s += "</g>";
  } else if (chosen.overlay === "Arcs") {
    var ink3 = P.rings[0];
    s += "<g fill='none' stroke='" + ink3 + "' stroke-width='2.5' opacity='0.7'>";
    for (i = 0; i < artInt(rng, 2, 3); i++) {
      var ax = artRange(rng, 100, 412);
      var ay = artRange(rng, 100, 412);
      var ar = artRange(rng, 60, 150);
      s += "<path d='M" + I(ax - ar) + " " + I(ay) + "A" + I(ar) + " " + I(ar) +
           " 0 0 1 " + I(ax + ar) + " " + I(ay) + "'/>";
    }
    s += "</g>";
  }
  return s;
}

/* ======================================================================
 * PACK: matisse — cut-outs (organic paper shapes on bold fields)
 * ====================================================================== */

var MATISSE_PALETTES = [
  { name: "Jazz", weight: 30, paper: "#171512", paper2: "#1d3a8f",
    shapes: ["#f2c53d", "#e8622c", "#f5f0e2", "#c92f2f"] },
  { name: "Lagoon", weight: 26, paper: "#0f3f72", paper2: "#1b6b5a",
    shapes: ["#f5f0e2", "#f2a83c", "#e2582c", "#8fd0b8"] },
  { name: "Snail", weight: 24, paper: "#f0e9d8", paper2: "#e2d5b8",
    shapes: ["#d2352c", "#2c6bb8", "#3a8f5c", "#e8a02c", "#8f4a9e"] },
  { name: "Blue Nude", weight: 20, paper: "#f2efe6", paper2: "#e6e2d4",
    shapes: ["#1d3f8f", "#2c55a8", "#16306b"] }
];

function matisseSlots() {
  return [
    { key: "composition", label: "Composition", variants: [
      { name: "Scatter", weight: 40 }, { name: "Column", weight: 30 },
      { name: "Burst", weight: 30 } ] },
    { key: "family", label: "Shapes", variants: [
      { name: "Algae", weight: 30 }, { name: "Leaves", weight: 26 },
      { name: "Stars", weight: 22 }, { name: "Mixed", weight: 22 } ] },
    { key: "count", label: "Count", variants: [
      { name: "Few", weight: 32 }, { name: "Several", weight: 42 },
      { name: "Many", weight: 26 } ] },
    { key: "field", label: "Field", variants: [
      { name: "Whole", weight: 40 }, { name: "Half", weight: 34 },
      { name: "Corner", weight: 26 } ] }
  ];
}

/* organic cut-out: lobed radial polygon (paper-scissors edge) */
function matisseCut(rng, kind, cx, cy, R, rot, c) {
  var pts = [];
  var i, t, r;
  if (kind === "algae") {
    var lobes = artInt(rng, 4, 7);
    for (i = 0; i < 34; i++) {
      t = (i / 34) * Math.PI * 2;
      r = R * (0.5 + 0.5 * Math.pow(Math.abs(Math.sin(lobes * t / 2)), 0.65)) *
          (1 + artRange(rng, -0.05, 0.05));
      pts.push(I(cx + Math.cos(t + rot) * r) + "," + I(cy + Math.sin(t + rot) * r));
    }
  } else if (kind === "leaf") {
    /* pointed leaf via two quadratics, drawn as dense polygon for jitter */
    for (i = 0; i < 22; i++) {
      t = (i / 22) * Math.PI * 2;
      var lw = Math.sin(t / 2);
      r = R * (0.25 + 0.75 * Math.abs(Math.sin(t / 2)));
      var lx = R * Math.cos(t) * 0.95;
      var ly = R * 0.42 * Math.sin(t) * lw * 1.6;
      pts.push(I(cx + lx * Math.cos(rot) - ly * Math.sin(rot)) + "," +
               I(cy + lx * Math.sin(rot) + ly * Math.cos(rot)));
    }
  } else {
    /* 4-point matisse star (concave) */
    for (i = 0; i < 8; i++) {
      t = (i / 8) * Math.PI * 2 + rot;
      r = i % 2 === 0 ? R : R * artRange(rng, 0.3, 0.42);
      pts.push(I(cx + Math.cos(t) * r) + "," + I(cy + Math.sin(t) * r));
    }
  }
  return "<polygon points='" + pts.join(" ") + "' fill='" + c + "'/>";
}

function matisseCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "cut", salt);
  var s = "<rect width='512' height='512' fill='" + P.paper + "'/>";
  if (chosen.field === "Half") {
    s += rng() < 0.5
      ? "<rect width='256' height='512' fill='" + P.paper2 + "'/>"
      : "<rect y='256' width='512' height='256' fill='" + P.paper2 + "'/>";
  } else if (chosen.field === "Corner") {
    s += "<path d='M512 0V512H0Z' fill='" + P.paper2 + "'/>";
  }

  var counts = { Few: [4, 6], Several: [7, 10], Many: [11, 14] };
  var k = artInt(rng, counts[chosen.count][0], counts[chosen.count][1]);
  var fams = { Algae: ["algae", "algae", "leaf"], Leaves: ["leaf", "leaf", "algae"],
               Stars: ["star", "star", "leaf"], Mixed: ["algae", "leaf", "star"] };
  var fam = fams[chosen.family];

  for (var m = 0; m < k; m++) {
    var kind = artPick(rng, fam);
    var R = artRange(rng, 34, m === 0 ? 96 : 70);
    var cx, cy, rot;
    if (chosen.composition === "Column") {
      var colX = m % 2 === 0 ? 160 : 352;
      cx = colX + artRange(rng, -40, 40);
      cy = 60 + (Math.floor(m / 2) / Math.max(1, Math.ceil(k / 2) - 1)) * 392 +
           artRange(rng, -20, 20);
      rot = artRange(rng, -0.4, 0.4);
    } else if (chosen.composition === "Burst") {
      var ba = (m / k) * Math.PI * 2 + artRange(rng, -0.2, 0.2);
      var br = artRange(rng, 60, 190);
      cx = 256 + Math.cos(ba) * br;
      cy = 256 + Math.sin(ba) * br;
      rot = ba;
    } else {
      cx = artRange(rng, 70, 442);
      cy = artRange(rng, 70, 442);
      rot = artRange(rng, 0, 6.283);
    }
    s += matisseCut(rng, kind, cx, cy, R, rot, artPick(rng, P.shapes));
  }
  return s;
}

/* ======================================================================
 * PACK: escher — interlocking translation tessellation (p1)
 * ====================================================================== */

function escherSlots() {
  return [
    { key: "lattice", label: "Lattice", variants: [
      { name: "Square", weight: 60 }, { name: "Diagonal", weight: 40 } ] },
    { key: "cells", label: "Cells", variants: [
      { name: "5", weight: 34 }, { name: "6", weight: 40 },
      { name: "8", weight: 26 } ] },
    { key: "morph", label: "Morph", variants: [
      { name: "Subtle", weight: 45 }, { name: "Bold", weight: 55 } ] },
    { key: "scheme", label: "Scheme", variants: [
      { name: "Two-tone", weight: 40 }, { name: "Tri-tone", weight: 34 },
      { name: "Outline", weight: 18 }, { name: "Impossible", weight: 8 } ] }
  ];
}

/* The Escher move: displace one edge and give its OPPOSITE edge the identical
 * displacement, so the tile still fills the plane by pure translation. */
function escherCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "tile", salt);
  var n = parseInt(chosen.cells, 10);
  var T = 512 / n;
  var amp = (chosen.morph === "Subtle" ? 0.16 : 0.3) * T;

  /* edge displacement profiles: k interior points, dy for top/bottom,
   * dx for left/right */
  function profile() {
    var kpts = artInt(rng, 2, 4);
    var p = [];
    for (var i = 1; i <= kpts; i++) {
      p.push([i / (kpts + 1), artRange(rng, -amp, amp)]);
    }
    return p;
  }
  var pTop = profile();
  var pLeft = profile();

  /* tile path in local coords (0,0)-(T,T) */
  var d = "M0 0";
  var i;
  for (i = 0; i < pTop.length; i++) {
    d += "L" + N(pTop[i][0] * T) + " " + N(pTop[i][1]);
  }
  d += "L" + N(T) + " 0";
  for (i = 0; i < pLeft.length; i++) {
    d += "L" + N(T + pLeft[i][1]) + " " + N(pLeft[i][0] * T);
  }
  d += "L" + N(T) + " " + N(T);
  for (i = pTop.length - 1; i >= 0; i--) {
    d += "L" + N(pTop[i][0] * T) + " " + N(T + pTop[i][1]);
  }
  d += "L0 " + N(T);
  for (i = pLeft.length - 1; i >= 0; i--) {
    d += "L" + N(pLeft[i][1]) + " " + N(pLeft[i][0] * T);
  }
  d += "Z";

  var s = "<rect width='512' height='512' fill='" + P.bg0 + "'/>";
  var inner = "<defs><path id='t' d='" + d + "'/></defs>";
  var outline = chosen.scheme === "Outline";
  var cols3 = [P.body, P.accent, P.body2];

  /* group uses by color so each use carries only x/y (byte-critical) */
  var buckets = {};
  for (var y = -1; y <= n; y++) {
    for (var x = -1; x <= n; x++) {
      var fill;
      if (outline) { fill = "outline"; }
      else if (chosen.scheme === "Tri-tone") {
        fill = cols3[((x % 3) + (y % 3) * 2 + 6) % 3];
      } else {
        fill = (x + y) % 2 === 0 ? P.body : P.accent;
      }
      if (!buckets[fill]) { buckets[fill] = ""; }
      buckets[fill] += "<use href='#t' x='" + N(x * T) + "' y='" + N(y * T) + "'/>";
    }
  }
  for (var bk in buckets) {
    if (!buckets.hasOwnProperty(bk)) { continue; }
    inner += bk === "outline"
      ? "<g fill='none' stroke='" + P.glow + "' stroke-width='1.5'>" +
        buckets[bk] + "</g>"
      : "<g fill='" + bk + "'>" + buckets[bk] + "</g>";
  }
  if (chosen.scheme === "Impossible") {
    /* subdued tiling + Penrose triangle centerpiece */
    inner = "<g opacity='0.22'>" + inner + "</g>";
    var R = 150;
    var v = [];
    for (i = 0; i < 3; i++) {
      var a = -Math.PI / 2 + i * 2.0944;
      v.push([256 + Math.cos(a) * R, 256 + Math.sin(a) * R]);
    }
    var w = 34;
    var pcols = [P.body, P.accent, P.glow];
    for (i = 0; i < 3; i++) {
      var A = v[i], B = v[(i + 1) % 3], C = v[(i + 2) % 3];
      /* beam A->B, mitered to suggest impossible weave */
      var ux = (B[0] - A[0]), uy = (B[1] - A[1]);
      var L = Math.sqrt(ux * ux + uy * uy);
      ux /= L; uy /= L;
      var nx2 = -uy, ny2 = ux;
      var e = w * 1.35;
      inner += "<polygon points='" +
        I(A[0] - ux * e) + "," + I(A[1] - uy * e) + " " +
        I(B[0] + ux * e) + "," + I(B[1] + uy * e) + " " +
        I(B[0] + ux * e + nx2 * w) + "," + I(B[1] + uy * e + ny2 * w) + " " +
        I(A[0] - ux * e * 0.25 + nx2 * w) + "," + I(A[1] - uy * e * 0.25 + ny2 * w) +
        "' fill='" + pcols[i] + "'/>";
    }
  }

  if (chosen.lattice === "Diagonal") {
    s += "<g transform='rotate(45 256 256) scale(1.45)' transform-origin='256 256'>" +
         inner + "</g>";
  } else {
    s += inner;
  }
  return s;
}

/* ======================================================================
 * PACK: opart — Riley-style optical fields
 * ====================================================================== */

var OPART_PALETTES = [
  { name: "Blackwhite", weight: 48, a: "#141414", b: "#f5f2ea" },
  { name: "Inverse", weight: 24, a: "#f5f2ea", b: "#141414" },
  { name: "Crimson", weight: 12, a: "#c41e1e", b: "#f5f0e6" },
  { name: "Cobalt", weight: 10, a: "#1d3fa8", b: "#f2f0e8" },
  { name: "Duotone", weight: 6, a: "#141414", b: "#e8b83c" }
];

function opartSlots() {
  return [
    { key: "field", label: "Field", variants: [
      { name: "Waves", weight: 34 }, { name: "Checker", weight: 24 },
      { name: "Moire", weight: 22 }, { name: "Zigzag", weight: 20 } ] },
    { key: "frequency", label: "Frequency", variants: [
      { name: "Low", weight: 45 }, { name: "High", weight: 55 } ] },
    { key: "warp", label: "Warp", variants: [
      { name: "Gentle", weight: 50 }, { name: "Strong", weight: 50 } ] },
    { key: "tilt", label: "Tilt", variants: [
      { name: "None", weight: 46 }, { name: "Quarter", weight: 30 },
      { name: "Diagonal", weight: 24 } ] }
  ];
}

function opartCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "field", salt);
  var s = "<rect width='512' height='512' fill='" + P.b + "'/>";
  var hi = chosen.frequency === "High";
  var strong = chosen.warp === "Strong";
  var i, j;
  if (chosen.tilt !== "None") {
    s += "<g transform='rotate(" + (chosen.tilt === "Quarter" ? 15 : 45) +
         " 256 256) scale(1.45)' transform-origin='256 256'>";
  }

  if (chosen.field === "Waves") {
    /* Riley "Current": stacked sine strokes with drifting phase */
    var rows2 = hi ? 30 : 20;
    var rh = 512 / rows2;
    var A = (strong ? 0.42 : 0.22) * rh * 2;
    var om = artRange(rng, 0.012, 0.02);
    var drift = artRange(rng, 0.25, 0.6) * (strong ? 1.6 : 1);
    s += "<g fill='none' stroke='" + P.a + "' stroke-width='" + N(rh * 0.52) + "'>";
    for (j = 0; j <= rows2; j++) {
      var y0 = j * rh;
      var ph = j * drift;
      var d = "M-8 " + I(y0 + A * Math.sin(ph));
      for (var x2 = 32; x2 <= 544; x2 += 32) {
        d += "L" + x2 + " " + I(y0 + A * Math.sin(om * x2 * 6 + ph));
      }
      s += "<path d='" + d + "'/>";
    }
    s += "</g>";
  } else if (chosen.field === "Checker") {
    /* checkerboard with sine-modulated row/column sizes */
    var nc = hi ? 12 : 9;
    var xs = [0], ys = [0];
    var accX = 0, accY = 0;
    for (i = 0; i < nc; i++) {
      accX += 1 + (strong ? 0.75 : 0.4) * Math.sin((i / nc) * Math.PI * 2 +
              artRange(rng, -0.1, 0.1));
      accY += 1 + (strong ? 0.75 : 0.4) * Math.cos((i / nc) * Math.PI * 2);
      xs.push(accX); ys.push(accY);
    }
    for (i = 0; i <= nc; i++) { xs[i] = xs[i] / accX * 512; ys[i] = ys[i] / accY * 512; }
    for (j = 0; j < nc; j++) {
      for (i = 0; i < nc; i++) {
        if ((i + j) % 2 === 0) {
          s += "<rect x='" + I(xs[i]) + "' y='" + I(ys[j]) + "' width='" +
               I(xs[i + 1] - xs[i] + 1) + "' height='" + I(ys[j + 1] - ys[j] + 1) +
               "' fill='" + P.a + "'/>";
        }
      }
    }
  } else if (chosen.field === "Moire") {
    /* two offset concentric ring systems interfere */
    var gap = hi ? 9 : 13;
    var off = strong ? artInt(rng, 16, 26) : artInt(rng, 8, 14);
    var oa2 = artRange(rng, 0, 6.283);
    var c1x = 256 - Math.cos(oa2) * off / 2, c1y = 256 - Math.sin(oa2) * off / 2;
    var c2x = 256 + Math.cos(oa2) * off / 2, c2y = 256 + Math.sin(oa2) * off / 2;
    s += "<g fill='none' stroke='" + P.a + "' stroke-width='" + N(gap * 0.45) + "'>";
    for (i = 1; i * gap < 400; i++) {
      s += "<circle cx='" + I(c1x) + "' cy='" + I(c1y) + "' r='" + (i * gap) + "'/>";
    }
    s += "</g><g fill='none' stroke='" + P.a + "' stroke-width='" +
         N(gap * 0.45) + "' opacity='0.55'>";
    for (i = 1; i * gap < 400; i++) {
      s += "<circle cx='" + I(c2x) + "' cy='" + I(c2y) + "' r='" + (i * gap) + "'/>";
    }
    s += "</g>";
  } else {
    /* Zigzag: Riley "Descending" - columns of chevrons with phase shifts */
    var cols2 = hi ? 16 : 11;
    var cwZ = 512 / cols2;
    var zh = cwZ * (strong ? 1.15 : 0.85);
    s += "<g fill='none' stroke='" + P.a + "' stroke-width='" + N(cwZ * 0.42) + "'>";
    for (i = 0; i <= cols2; i++) {
      var xz = i * cwZ;
      var phz = (strong ? 0.9 : 0.4) * Math.sin(i * artRange(rng, 0.5, 0.9));
      var dz = "M" + I(xz + phz * cwZ) + " -10";
      var yz = -10;
      var dir = 1;
      while (yz < 522) {
        yz += zh;
        dz += "L" + I(xz + phz * cwZ + dir * cwZ * 0.5) + " " + I(yz);
        dir = -dir;
      }
      s += "<path d='" + dz + "'/>";
    }
    s += "</g>";
  }
  if (chosen.tilt !== "None") { s += "</g>"; }
  return s;
}

/* ======================================================================
 * PACK: picasso — cubist heads (clip-path facets, mismatched features)
 * ====================================================================== */

var PICASSO_PALETTES = [
  { name: "Earth", weight: 40, bg: "#c9b493", skin: ["#e8cba0", "#c99e6a", "#a8764a", "#8a5c3a"],
    hair: "#3d2b1c", outline: "#241a10", accent: "#a83a2a" },
  { name: "Blue Period", weight: 26, bg: "#26415c", skin: ["#7a99b8", "#54748f", "#3d5a75", "#8fb0c9"],
    hair: "#1c2c3d", outline: "#12202e", accent: "#c9d8e2" },
  { name: "Rose Period", weight: 20, bg: "#d9a08a", skin: ["#f0c9a8", "#e0a888", "#c98a6a", "#f2ddc4"],
    hair: "#6b3a2a", outline: "#42241a", accent: "#8a4a3a" },
  { name: "Grisaille", weight: 14, bg: "#b8b4ac", skin: ["#e0dcd2", "#b0aca2", "#888478", "#d0ccc2"],
    hair: "#33302a", outline: "#1c1a16", accent: "#8f2a20" }
];

function picassoSlots() {
  return [
    { key: "fragmentation", label: "Fragmentation", variants: [
      { name: "Low", weight: 45 }, { name: "High", weight: 55 } ] },
    { key: "eyes", label: "Eyes", variants: [
      { name: "Mismatched", weight: 44 }, { name: "Both-profile", weight: 30 },
      { name: "Stacked", weight: 26 } ] },
    { key: "hair", label: "Hair", variants: [
      { name: "Block", weight: 42 }, { name: "Swept", weight: 34 },
      { name: "Bald", weight: 24 } ] },
    { key: "outline", label: "Outline", variants: [
      { name: "Fine", weight: 40 }, { name: "Bold", weight: 60 } ] },
    { key: "backdrop", label: "Backdrop", variants: [
      { name: "Flat", weight: 45 }, { name: "Planes", weight: 55 } ] }
  ];
}

function picassoCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "head", salt);
  var lw = chosen.outline === "Fine" ? 3 : 6;
  var s = "<rect width='512' height='512' fill='" + P.bg + "'/>";
  var i, t;

  if (chosen.backdrop === "Planes") {
    for (i = 0; i < 3; i++) {
      var bx = artRange(rng, -50, 400);
      var by = artRange(rng, -50, 400);
      s += "<polygon points='" + I(bx) + "," + I(by) + " " +
           I(bx + artRange(rng, 150, 340)) + "," + I(by + artRange(rng, -60, 60)) + " " +
           I(bx + artRange(rng, 100, 300)) + "," + I(by + artRange(rng, 150, 320)) +
           "' fill='" + artPick(rng, P.skin) + "' opacity='0.35'/>";
    }
  }

  /* angular head silhouette: jittered ellipse polygon */
  var hp = [];
  for (i = 0; i < 12; i++) {
    t = (i / 12) * Math.PI * 2 - Math.PI / 2;
    var rx = 128 * artRange(rng, 0.88, 1.1);
    var ry = 158 * artRange(rng, 0.88, 1.08);
    hp.push(I(256 + Math.cos(t) * rx) + "," + I(276 + Math.sin(t) * ry));
  }
  var headPts = hp.join(" ");
  s += "<defs><clipPath id='hd'><polygon points='" + headPts + "'/></clipPath></defs>";
  s += "<polygon points='" + headPts + "' fill='" + P.skin[0] + "'/>";

  /* facet planes clipped to the head */
  var nF = chosen.fragmentation === "Low" ? 2 : 4;
  s += "<g clip-path='url(#hd)'>";
  for (i = 0; i < nF; i++) {
    var a = artRange(rng, 0, Math.PI);
    var cxf = 256 + artRange(rng, -70, 70);
    var cyf = 276 + artRange(rng, -90, 90);
    var dx = Math.cos(a) * 400, dy = Math.sin(a) * 400;
    var px = -dy / 400 * 400, py = dx / 400 * 400;
    s += "<polygon points='" +
      I(cxf - dx) + "," + I(cyf - dy) + " " + I(cxf + dx) + "," + I(cyf + dy) + " " +
      I(cxf + dx + px) + "," + I(cyf + dy + py) + " " + I(cxf - dx + px) + "," +
      I(cyf - dy + py) + "' fill='" + P.skin[(i + 1) % P.skin.length] +
      "' opacity='0.85'/>";
    /* facet chord line */
    s += "<line x1='" + I(cxf - dx) + "' y1='" + I(cyf - dy) + "' x2='" +
         I(cxf + dx) + "' y2='" + I(cyf + dy) + "' stroke='" + P.outline +
         "' stroke-width='" + (lw * 0.5) + "'/>";
  }
  /* hair mass */
  if (chosen.hair === "Block") {
    s += "<path d='M116 210Q140 88 256 92Q372 88 396 210Q330 " +
         I(artRange(rng, 120, 170)) + " 256 " + I(artRange(rng, 128, 168)) +
         "Q182 " + I(artRange(rng, 120, 170)) + " 116 210Z' fill='" + P.hair + "'/>";
  } else if (chosen.hair === "Swept") {
    s += "<path d='M120 236Q120 96 268 94Q392 96 394 188Q300 " +
         I(artRange(rng, 96, 130)) + " 236 172Q170 226 120 236Z' fill='" +
         P.hair + "'/>";
  }
  s += "</g>";

  /* head outline */
  s += "<polygon points='" + headPts + "' fill='none' stroke='" + P.outline +
       "' stroke-width='" + lw + "'/>";

  /* eyes */
  var eyL = [206 + artRange(rng, -10, 8), 258 + artRange(rng, -14, 10)];
  var eyR = [308 + artRange(rng, -8, 10), 258 + artRange(rng, -10, 16)];
  function frontalEye(ex, ey, sc) {
    return "<ellipse cx='" + I(ex) + "' cy='" + I(ey) + "' rx='" + I(26 * sc) +
      "' ry='" + I(14 * sc) + "' fill='#f2efe2' stroke='" + P.outline +
      "' stroke-width='" + (lw * 0.6) + "'/><circle cx='" + I(ex) + "' cy='" +
      I(ey) + "' r='" + I(7 * sc) + "' fill='" + P.outline + "'/>";
  }
  function profileEye(ex, ey, sc) {
    return "<path d='M" + I(ex - 24 * sc) + " " + I(ey) + "L" + I(ex + 10 * sc) +
      " " + I(ey - 12 * sc) + "L" + I(ex + 24 * sc) + " " + I(ey) + "L" +
      I(ex + 10 * sc) + " " + I(ey + 10 * sc) + "Z' fill='#f2efe2' stroke='" +
      P.outline + "' stroke-width='" + (lw * 0.6) + "'/><circle cx='" +
      I(ex + 4 * sc) + "' cy='" + I(ey) + "' r='" + I(6 * sc) + "' fill='" +
      P.outline + "'/>";
  }
  if (chosen.eyes === "Mismatched") {
    s += frontalEye(eyL[0], eyL[1], 1) + profileEye(eyR[0], eyR[1], 1.05);
  } else if (chosen.eyes === "Both-profile") {
    s += profileEye(eyL[0], eyL[1], 1) + profileEye(eyR[0], eyR[1], 0.9);
  } else {
    s += frontalEye(250 + artRange(rng, -20, 20), 232, 0.95) +
         profileEye(262 + artRange(rng, -20, 20), 288, 1.05);
  }

  /* angular profile nose (off-center) + mouth + ear */
  var nx = 256 + artRange(rng, -14, 6);
  s += "<path d='M" + I(nx) + " 244L" + I(nx - artRange(rng, 18, 34)) + " 310L" +
       I(nx + 12) + " 314' fill='none' stroke='" + P.outline +
       "' stroke-width='" + lw + "'/>";
  var my = 356 + artRange(rng, -8, 10);
  s += "<rect x='" + I(226 + artRange(rng, -10, 10)) + "' y='" + I(my) +
       "' width='64' height='" + I(artRange(rng, 12, 20)) + "' fill='" +
       P.accent + "' stroke='" + P.outline + "' stroke-width='" + (lw * 0.5) +
       "' transform='rotate(" + I(artRange(rng, -8, 8)) + " 256 " + I(my) + ")'/>";
  s += "<ellipse cx='" + I(rng() < 0.5 ? 132 : 380) + "' cy='282' rx='13' ry='24'" +
       " fill='" + P.skin[1] + "' stroke='" + P.outline + "' stroke-width='" +
       (lw * 0.6) + "'/>";
  return s;
}

/* ======================================================================
 * PACK: magritte — flat surrealist skies and floating objects
 * ====================================================================== */

var MAGRITTE_PALETTES = [
  { name: "Day", weight: 44, sky0: "#7db3e0", sky1: "#c8e0f0", cloud: "#f7f7f2",
    ground: "#4a6b4f", sea: "#33587a", apple: "#5ca03c", ink: "#1c1c22" },
  { name: "Dusk", weight: 30, sky0: "#d97f4f", sky1: "#f0c8a0", cloud: "#f5e8d8",
    ground: "#4f4238", sea: "#5c4a63", apple: "#6b9e3c", ink: "#241c1c" },
  { name: "Night", weight: 26, sky0: "#16294a", sky1: "#2e4a75", cloud: "#c9d4e0",
    ground: "#1a2620", sea: "#101d33", apple: "#4f8a33", ink: "#0c0e16" }
];

function magritteSlots() {
  return [
    { key: "sky", label: "Sky", variants: [
      { name: "Clouds", weight: 50 }, { name: "Gradient", weight: 26 },
      { name: "Stars", weight: 24 } ] },
    { key: "object", label: "Object", variants: [
      { name: "Bowler", weight: 26 }, { name: "Apple", weight: 22 },
      { name: "Moon", weight: 18 }, { name: "Eye", weight: 18 },
      { name: "Umbrella", weight: 16 } ] },
    { key: "multiplicity", label: "Multiplicity", variants: [
      { name: "Single", weight: 58 }, { name: "Rain", weight: 42 } ] },
    { key: "horizon", label: "Horizon", variants: [
      { name: "None", weight: 40 }, { name: "Sea", weight: 32 },
      { name: "Field", weight: 28 } ] }
  ];
}

function magritteObject(rng, kind, P) {
  /* each object drawn centered on (0,0) at ~unit size 100 */
  if (kind === "Bowler") {
    return "<g><path d='M-46 8A46 40 0 0 1 46 8Z' fill='" + P.ink + "'/>" +
      "<ellipse cx='0' cy='9' rx='62' ry='12' fill='" + P.ink + "'/></g>";
  }
  if (kind === "Apple") {
    return "<g><circle cx='0' cy='6' r='44' fill='" + P.apple + "'/>" +
      "<path d='M-2 -34Q0 -52 10 -58' fill='none' stroke='#3d2b1c' stroke-width='5'/>" +
      "<path d='M8 -46Q30 -58 34 -40Q18 -32 8 -46Z' fill='#3d6b28'/></g>";
  }
  if (kind === "Moon") {
    return "<path d='M18 -44A46 46 0 1 0 18 44A38 38 0 0 1 18 -44Z' fill='" +
      P.cloud + "'/>";
  }
  if (kind === "Eye") {
    return "<g><path d='M-52 0Q0 -40 52 0Q0 40 -52 0Z' fill='#f2f2ea' stroke='" +
      P.ink + "' stroke-width='3'/><circle cx='0' cy='0' r='17' fill='" +
      P.sky0 + "'/><circle cx='0' cy='0' r='8' fill='" + P.ink + "'/>" +
      "<circle cx='4' cy='-4' r='2.5' fill='#fff'/></g>";
  }
  /* Umbrella */
  return "<g><path d='M-50 -6A50 50 0 0 1 50 -6L50 -4Q38 -14 25 -4Q12 -14 0 -4" +
    "Q-12 -14 -25 -4Q-38 -14 -50 -4Z' fill='" + P.ink + "'/>" +
    "<path d='M0 -6V38Q0 50 12 48' fill='none' stroke='" + P.ink +
    "' stroke-width='4'/></g>";
}

function magritteCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "scene", salt);
  var s = "<defs><linearGradient id='sk' x1='0' y1='0' x2='0' y2='1'>" +
    "<stop offset='0' stop-color='" + P.sky0 + "'/><stop offset='1' stop-color='" +
    P.sky1 + "'/></linearGradient></defs>" +
    "<rect width='512' height='512' fill='url(#sk)'/>";
  var i;

  if (chosen.sky === "Clouds") {
    var nC = artInt(rng, 4, 7);
    for (i = 0; i < nC; i++) {
      var cx = artRange(rng, 30, 482);
      var cy = artRange(rng, 40, 400);
      var cs = artRange(rng, 0.5, 1.15);
      s += "<g fill='" + P.cloud + "'>" +
        "<ellipse cx='" + I(cx) + "' cy='" + I(cy) + "' rx='" + I(46 * cs) +
        "' ry='" + I(15 * cs) + "'/>" +
        "<ellipse cx='" + I(cx - 22 * cs) + "' cy='" + I(cy + 6 * cs) + "' rx='" +
        I(30 * cs) + "' ry='" + I(11 * cs) + "'/>" +
        "<ellipse cx='" + I(cx + 26 * cs) + "' cy='" + I(cy + 5 * cs) + "' rx='" +
        I(26 * cs) + "' ry='" + I(10 * cs) + "'/></g>";
    }
  } else if (chosen.sky === "Stars") {
    for (i = 0; i < artInt(rng, 24, 40); i++) {
      s += "<circle cx='" + I(artRange(rng, 8, 504)) + "' cy='" +
           I(artRange(rng, 8, 420)) + "' r='" + N(artRange(rng, 1, 2.6)) +
           "' fill='" + P.cloud + "'/>";
    }
  }

  var hy = 398;
  if (chosen.horizon === "Sea") {
    s += "<rect y='" + hy + "' width='512' height='" + (512 - hy) + "' fill='" +
         P.sea + "'/><line x1='0' y1='" + hy + "' x2='512' y2='" + hy +
         "' stroke='" + P.cloud + "' stroke-width='1.5' opacity='0.6'/>";
  } else if (chosen.horizon === "Field") {
    s += "<path d='M0 " + (hy + 8) + "Q256 " + (hy - 18) + " 512 " + (hy + 4) +
         "L512 512H0Z' fill='" + P.ground + "'/>";
  }

  if (chosen.multiplicity === "Single") {
    var sc = artRange(rng, 1.5, 2.1);
    s += "<g transform='translate(256 " + I(artRange(rng, 210, 260)) +
         ") scale(" + N(sc) + ")'>" + magritteObject(rng, chosen.object, P) + "</g>";
  } else {
    /* Golconda rain: staggered grid of the object */
    s += "<defs><g id='ob'>" + magritteObject(rng, chosen.object, P) + "</g></defs>";
    var rows3 = 4;
    for (var r3 = 0; r3 < rows3; r3++) {
      var kx = r3 % 2 === 0 ? 4 : 3;
      for (i = 0; i < kx; i++) {
        var ox = (512 / (kx + 1)) * (i + 1) + artRange(rng, -12, 12);
        var oy = 70 + r3 * 112 + artRange(rng, -10, 10);
        s += "<use href='#ob' transform='translate(" + I(ox) + " " + I(oy) +
             ") scale(" + N(artRange(rng, 0.42, 0.55)) + ")'/>";
      }
    }
  }
  return s;
}

/* ======================================================================
 * PACK: seurat — pointillist scenes via interleaved dot patterns
 * ====================================================================== */

var SEURAT_PALETTES = [
  { name: "Grande Jatte", weight: 38, skyBase: "#cfe0e8", skyD: ["#8fb8d9", "#f0d9a8"],
    midBase: "#a8c98f", midD: ["#5c8f4a", "#e0c86a"], loBase: "#7da85c",
    loD: ["#42702e", "#c9a03c"], sun: "#f2d24a", accent: "#33415c" },
  { name: "Port", weight: 26, skyBase: "#d9e2ea", skyD: ["#a0bcd9", "#f0c9a0"],
    midBase: "#9fc0d4", midD: ["#5c88ad", "#e8b87a"], loBase: "#7a9cc0",
    loD: ["#41638f", "#d9a05c"], sun: "#f0c04a", accent: "#2e3a52" },
  { name: "Violet Hour", weight: 22, skyBase: "#d4c9e0", skyD: ["#9c88c9", "#f0d08f"],
    midBase: "#b09cc9", midD: ["#6b54a0", "#e0b86a"], loBase: "#8a74ad",
    loD: ["#4f3d80", "#c99c4a"], sun: "#f2cf5c", accent: "#33284f" },
  { name: "Ember Field", weight: 14, skyBase: "#e8d0b8", skyD: ["#d9985c", "#8fa8c9"],
    midBase: "#d9aa7a", midD: ["#b0703c", "#7a94b8"], loBase: "#b8854f",
    loD: ["#8a5427", "#5c7599"], sun: "#f2e0a0", accent: "#4a3322" }
];

function seuratSlots() {
  return [
    { key: "scene", label: "Scene", variants: [
      { name: "Seascape", weight: 40 }, { name: "Hills", weight: 34 },
      { name: "Meadow", weight: 26 } ] },
    { key: "dots", label: "Dot scale", variants: [
      { name: "Fine", weight: 55 }, { name: "Medium", weight: 45 } ] },
    { key: "horizon", label: "Horizon", variants: [
      { name: "High", weight: 30 }, { name: "Middle", weight: 44 },
      { name: "Low", weight: 26 } ] },
    { key: "accent", label: "Accent", variants: [
      { name: "Sun", weight: 32 }, { name: "Sail", weight: 26 },
      { name: "Tree", weight: 22 }, { name: "None", weight: 20 } ] }
  ];
}

/* interleaved 2-color dot pattern over a base tone = pointillist texture */
function seuratPattern(id, base, dots, tile, r) {
  var h = tile / 2;
  return "<pattern id='" + id + "' width='" + tile + "' height='" + tile +
    "' patternUnits='userSpaceOnUse'>" +
    "<rect width='" + tile + "' height='" + tile + "' fill='" + base + "'/>" +
    "<circle cx='" + N(h * 0.5) + "' cy='" + N(h * 0.5) + "' r='" + r +
    "' fill='" + dots[0] + "'/>" +
    "<circle cx='" + N(h * 1.5) + "' cy='" + N(h * 1.5) + "' r='" + r +
    "' fill='" + dots[0] + "'/>" +
    "<circle cx='" + N(h * 1.5) + "' cy='" + N(h * 0.5) + "' r='" + N(r * 0.8) +
    "' fill='" + dots[1] + "'/>" +
    "<circle cx='" + N(h * 0.5) + "' cy='" + N(h * 1.5) + "' r='" + N(r * 0.8) +
    "' fill='" + dots[1] + "'/></pattern>";
}

function seuratCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "scene", salt);
  var tile = chosen.dots === "Fine" ? 11 : 16;
  var r = chosen.dots === "Fine" ? 1.9 : 3;
  var s = "<defs>" +
    seuratPattern("p1", P.skyBase, P.skyD, tile, r) +
    seuratPattern("p2", P.midBase, P.midD, tile + 2, r) +
    seuratPattern("p3", P.loBase, P.loD, tile + 1, r) + "</defs>";

  var hr = chosen.horizon === "High" ? [150, 205]
         : chosen.horizon === "Low" ? [300, 360] : [215, 280];
  var horizon = I(artRange(rng, hr[0], hr[1]));
  s += "<rect width='512' height='512' fill='url(#p1)'/>";

  if (chosen.scene === "Seascape") {
    s += "<rect y='" + horizon + "' width='512' height='" + (512 - horizon) +
         "' fill='url(#p3)'/>";
    /* beach wedge */
    s += "<path d='M0 512L0 " + I(512 - artRange(rng, 60, 130)) +
         "Q210 " + I(512 - artRange(rng, 10, 50)) + " 512 512Z' fill='url(#p2)'/>";
  } else if (chosen.scene === "Hills") {
    var h1 = horizon + 30;
    s += "<path d='M0 " + I(h1) + "Q" + I(artRange(rng, 90, 200)) + " " +
         I(h1 - artRange(rng, 60, 120)) + " " + I(artRange(rng, 250, 360)) + " " +
         I(h1 - 8) + "T512 " + I(h1 - artRange(rng, 0, 60)) +
         "L512 512H0Z' fill='url(#p2)'/>";
    s += "<path d='M0 " + I(h1 + 100) + "Q" + I(artRange(rng, 160, 340)) + " " +
         I(h1 + 30) + " 512 " + I(h1 + 110) + "L512 512H0Z' fill='url(#p3)'/>";
  } else {
    /* Meadow: one deep field + path */
    s += "<rect y='" + horizon + "' width='512' height='" + (512 - horizon) +
         "' fill='url(#p2)'/>";
    s += "<path d='M" + I(artRange(rng, 140, 250)) + " 512Q256 " +
         I(horizon + 60) + " " + I(artRange(rng, 260, 380)) + " " + horizon +
         "L" + I(artRange(rng, 290, 420)) + " " + horizon + "Q290 " +
         I(horizon + 80) + " " + I(artRange(rng, 240, 360)) +
         " 512Z' fill='url(#p3)'/>";
  }

  /* accent feature + hand-placed dot shimmer around it */
  var ax = I(artRange(rng, 110, 402));
  if (chosen.accent === "Sun") {
    var ay = I(artRange(rng, 70, horizon - 60));
    s += "<circle cx='" + ax + "' cy='" + ay + "' r='" +
         I(artRange(rng, 30, 44)) + "' fill='" + P.sun + "'/>";
    var d1 = "";
    for (var i = 0; i < 46; i++) {
      var aa = artRange(rng, 0, 6.283);
      var ar = artRange(rng, 34, 66);
      d1 += "M" + I(ax + Math.cos(aa) * ar) + " " + I(ay + Math.sin(aa) * ar) + "h.5";
    }
    s += "<path stroke='" + P.sun + "' stroke-width='3.4' stroke-linecap='round'" +
         " fill='none' opacity='0.85' d='" + d1 + "'/>";
  } else if (chosen.accent === "Sail") {
    var sy = horizon - 6;
    s += "<path d='M" + ax + " " + I(sy) + "L" + ax + " " + I(sy - 54) + "L" +
         I(ax + 34) + " " + I(sy - 8) + "Z' fill='#f5f2e6'/>" +
         "<path d='M" + I(ax - 26) + " " + I(sy) + "Q" + ax + " " + I(sy + 14) +
         " " + I(ax + 30) + " " + I(sy) + "Z' fill='" + P.accent + "'/>";
  } else if (chosen.accent === "Tree") {
    var ty = horizon + 20;
    s += "<line x1='" + ax + "' y1='" + I(ty + 90) + "' x2='" + ax + "' y2='" +
         I(ty) + "' stroke='" + P.accent + "' stroke-width='9'/>";
    s += "<circle cx='" + ax + "' cy='" + I(ty - 34) + "' r='52' fill='" +
         P.loD[0] + "'/><circle cx='" + I(ax - 30) + "' cy='" + I(ty - 12) +
         "' r='34' fill='" + P.loD[0] + "'/><circle cx='" + I(ax + 32) +
         "' cy='" + I(ty - 8) + "' r='30' fill='" + P.loD[0] + "'/>";
  }
  return s;
}

/* ======================================================================
 * PACK: punks — 24x24 pixel characters (original trait art)
 * ====================================================================== */

var PUNKS_PALETTES = [
  { name: "Pale", weight: 24, bg0: "#638596", bg1: "#7a9aab", skin: "#ead4c0", skin2: "#d0b49a", skin3: "#f7e8d8" },
  { name: "Tan", weight: 24, bg0: "#8a7a63", bg1: "#a09077", skin: "#d9a066", skin2: "#b8834f", skin3: "#ecbc85" },
  { name: "Brown", weight: 22, bg0: "#5c7263", bg1: "#728a79", skin: "#a06a3c", skin2: "#85552e", skin3: "#bc854f" },
  { name: "Deep", weight: 20, bg0: "#75636b", bg1: "#8d7a82", skin: "#6b4226", skin2: "#54341d", skin3: "#855835" },
  { name: "Zombie", weight: 5, bg0: "#4a4a52", bg1: "#5c5c66", skin: "#7da05a", skin2: "#628a42", skin3: "#98bc72" },
  { name: "Alien", weight: 3, bg0: "#3d4a63", bg1: "#4f5c78", skin: "#9ecbd4", skin2: "#7fb0bc", skin3: "#bfe2e8" },
  { name: "Robot", weight: 2, bg0: "#54452e", bg1: "#6b5a3d", skin: "#a8a8b4", skin2: "#8a8a96", skin3: "#c4c4d0" }
];

var PUNK_TEES = ["#324a5c", "#5c3240", "#3d5238", "#4a4455", "#6b5c33", "#20242c"];

var PUNK_INK = "#14141a";
var PUNK_HAIRC = ["#1b1b20", "#5a3b1e", "#d9b23c", "#a83a20", "#b8b8c0",
                  "#3a8f4a", "#d95fa8", "#3a6bd9"];

function punksSlots() {
  return [
    { key: "hair", label: "Hair / headgear", variants: [
      { name: "Mohawk", weight: 13 }, { name: "Wild", weight: 11 },
      { name: "Cap", weight: 11 }, { name: "Beanie", weight: 10 },
      { name: "Hoodie", weight: 11 }, { name: "Long", weight: 10 },
      { name: "Buzz", weight: 10 }, { name: "Top Knot", weight: 9 },
      { name: "Headband", weight: 8 }, { name: "Bald", weight: 5 },
      { name: "Crown", weight: 2 } ] },
    { key: "eyes", label: "Eyes / eyewear", variants: [
      { name: "Regular", weight: 30 }, { name: "Shades", weight: 22 },
      { name: "Patch", weight: 14 }, { name: "3D", weight: 13 },
      { name: "VR", weight: 11 }, { name: "Monocle", weight: 10 } ] },
    { key: "beard", label: "Facial hair", variants: [
      { name: "None", weight: 42 }, { name: "Mustache", weight: 22 },
      { name: "Goatee", weight: 20 }, { name: "Beard", weight: 16 } ] },
    { key: "mouth", label: "Mouth", variants: [
      { name: "Neutral", weight: 26 }, { name: "Smile", weight: 18 },
      { name: "Frown", weight: 11 }, { name: "Grin", weight: 14 },
      { name: "Cigarette", weight: 16 }, { name: "Pipe", weight: 10 },
      { name: "Gold Grin", weight: 5 } ] },
    { key: "shirt", label: "Shirt", variants: [
      { name: "Bare", weight: 32 }, { name: "Tee", weight: 42 },
      { name: "Tank", weight: 26 } ] },
    { key: "extra", label: "Extra", variants: [
      { name: "None", weight: 52 }, { name: "Chain", weight: 16 },
      { name: "Teardrop", weight: 12 }, { name: "Scar", weight: 12 },
      { name: "Earring", weight: 8 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Plain", weight: 44 }, { name: "Wash", weight: 32 },
      { name: "Grid", weight: 24 } ] }
  ];
}

/* run-length merge of arbitrary color strings -> {color: pathD} */
function pxRunsC(cells, cols, rows) {
  var out = {};
  for (var y = 0; y < rows; y++) {
    var x = 0;
    while (x < cols) {
      var c = cells[y * cols + x];
      if (c) {
        var w = 1;
        while (x + w < cols && cells[y * cols + x + w] === c) { w++; }
        if (!out[c]) { out[c] = ""; }
        out[c] += "M" + x + " " + y + "h" + w + "v1h-" + w + "z";
        x += w;
      } else { x++; }
    }
  }
  return out;
}

function punksCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "punk", salt);
  var G = 24;
  var cells = [];
  var i, r, c;
  for (i = 0; i < G * G; i++) { cells.push(null); }
  function put(row, c0, c1, col) {
    for (var cc = c0; cc <= c1; cc++) {
      if (row >= 0 && row < G && cc >= 0 && cc < G) { cells[row * G + cc] = col; }
    }
  }

  /* ---- base head + shoulders (original 24x24 template) ---- */
  put(2, 9, 14, P.skin);
  put(3, 8, 15, P.skin);
  for (r = 4; r <= 14; r++) { put(r, 7, 16, P.skin); }
  put(15, 8, 15, P.skin);
  put(16, 8, 14, P.skin);
  put(17, 9, 13, P.skin);
  put(18, 10, 12, P.skin);
  put(19, 10, 12, P.skin2);
  put(20, 8, 14, P.skin);
  put(21, 6, 16, P.skin);
  put(22, 5, 17, P.skin);
  put(23, 5, 17, P.skin);
  /* ---- craft pass: rim light, dithered shade, contour ---- */
  var r2, c2;
  for (r2 = 4; r2 <= 15; r2++) { put(r2, 7, 7, P.skin3); }   /* lit left edge */
  put(3, 8, 10, P.skin3);                                    /* brow light */
  for (r2 = 10; r2 <= 14; r2++) {                            /* dither right cheek */
    for (c2 = 14; c2 <= 15; c2++) {
      if ((r2 + c2) % 2 === 0) { put(r2, c2, c2, P.skin2); }
    }
  }
  put(10, 7, 7, P.skin2); put(11, 7, 7, P.skin2);            /* ear */
  put(11, 11, 11, P.skin2); put(12, 11, 12, P.skin2);        /* nose */
  put(16, 9, 13, P.skin2);                                   /* chin shade */
  put(18, 10, 10, P.skin3);                                  /* neck light */

  /* ---- shirt (under hair so hoodies still win) ---- */
  var teeC = artPick(rng, PUNK_TEES);
  if (chosen.shirt === "Tee") {
    put(20, 8, 14, teeC);
    for (r2 = 21; r2 <= 23; r2++) { put(r2, 5, 17, teeC); }
    put(20, 10, 12, P.skin2);                                /* collar notch */
  } else if (chosen.shirt === "Tank") {
    put(20, 8, 9, teeC); put(20, 13, 14, teeC);              /* straps */
    for (r2 = 21; r2 <= 23; r2++) { put(r2, 6, 16, teeC); }
  }

  var hairC = PUNK_HAIRC[artInt(rng, 0, PUNK_HAIRC.length - 1)];
  var hairC2 = PUNK_HAIRC[artInt(rng, 0, PUNK_HAIRC.length - 1)];

  /* ---- type quirks ---- */
  if (P.name === "Zombie") {
    put(9, 8, 9, "#c22a2a");                            /* red eye pre-layer */
    put(14, 9, 10, P.skin2);                            /* decay patch */
  } else if (P.name === "Alien") {
    put(8, 8, 10, "#dff2f5"); put(8, 13, 15, "#dff2f5"); /* big eye whites */
    put(9, 9, 9, PUNK_INK); put(9, 14, 14, PUNK_INK);
  } else if (P.name === "Robot") {
    put(5, 9, 14, P.skin2);                             /* brow plate */
    put(12, 7, 7, "#e2a63c"); put(12, 16, 16, "#e2a63c"); /* rivets */
  }

  /* ---- eyes / eyewear ---- */
  if (chosen.eyes === "Regular") {
    if (P.name !== "Alien") {
      put(8, 9, 10, "#f2f2ea"); put(8, 13, 14, "#f2f2ea");
      put(8, 10, 10, PUNK_INK); put(8, 14, 14, PUNK_INK);
      put(7, 9, 10, P.skin2); put(7, 13, 14, P.skin2);  /* brows */
    }
  } else if (chosen.eyes === "Shades") {
    put(8, 7, 16, PUNK_INK);
    put(9, 9, 10, PUNK_INK); put(9, 13, 14, PUNK_INK);
  } else if (chosen.eyes === "Patch") {
    put(7, 8, 15, PUNK_INK);
    put(8, 9, 10, PUNK_INK); put(9, 9, 10, PUNK_INK);
    put(8, 13, 14, "#f2f2ea"); put(8, 14, 14, PUNK_INK);
  } else if (chosen.eyes === "3D") {
    put(7, 8, 15, "#e8e4da");
    put(8, 8, 8, "#e8e4da"); put(8, 15, 15, "#e8e4da");
    put(8, 9, 10, "#c43a2e"); put(9, 9, 10, "#c43a2e");
    put(8, 13, 14, "#2e5cc4"); put(9, 13, 14, "#2e5cc4");
  } else if (chosen.eyes === "VR") {
    put(7, 7, 16, "#2a2a33");
    put(8, 7, 16, "#2a2a33");
    put(9, 7, 16, "#2a2a33");
    put(8, 9, 14, "#5ce8e2");
  } else { /* Monocle */
    put(8, 9, 10, "#f2f2ea"); put(8, 10, 10, PUNK_INK);
    put(7, 12, 15, "#e2b93c");
    put(8, 12, 12, "#e2b93c"); put(8, 15, 15, "#e2b93c");
    put(9, 12, 15, "#e2b93c");
    put(8, 13, 14, "#f2f2ea"); put(8, 14, 14, PUNK_INK);
    put(10, 15, 15, "#e2b93c"); put(11, 16, 16, "#e2b93c"); /* chain */
  }

  /* ---- mouth ---- */
  if (chosen.mouth === "Neutral") {
    put(14, 10, 13, PUNK_INK);
  } else if (chosen.mouth === "Smile") {
    put(14, 10, 13, PUNK_INK); put(13, 9, 9, PUNK_INK); put(13, 14, 14, PUNK_INK);
  } else if (chosen.mouth === "Frown") {
    put(14, 10, 13, PUNK_INK); put(15, 9, 9, PUNK_INK); put(15, 14, 14, PUNK_INK);
  } else if (chosen.mouth === "Grin" || chosen.mouth === "Gold Grin") {
    var teeth = chosen.mouth === "Grin" ? "#f2f2ea" : "#e2b93c";
    put(13, 9, 9, PUNK_INK); put(13, 14, 14, PUNK_INK);
    put(14, 10, 13, teeth);
    put(15, 10, 13, PUNK_INK);
  } else if (chosen.mouth === "Cigarette") {
    put(14, 10, 13, PUNK_INK);
    put(14, 14, 18, "#e8e4da"); put(14, 19, 19, "#e8622c");
    put(12, 19, 19, "#9aa0a8"); put(11, 20, 20, "#9aa0a8"); put(10, 19, 19, "#9aa0a8");
  } else { /* Pipe */
    put(14, 10, 13, PUNK_INK);
    put(15, 14, 16, "#6b4226"); put(16, 16, 18, "#6b4226");
    put(14, 17, 18, "#6b4226"); put(13, 17, 18, "#3d2d1c");
    put(11, 18, 18, "#9aa0a8"); put(10, 17, 17, "#9aa0a8");
  }

  /* ---- facial hair (over mouth edges) ---- */
  if (chosen.beard === "Mustache") {
    put(13, 9, 14, hairC);
  } else if (chosen.beard === "Goatee") {
    put(15, 10, 13, hairC); put(16, 10, 13, hairC); put(17, 10, 12, hairC);
  } else if (chosen.beard === "Beard") {
    put(12, 8, 8, hairC); put(13, 8, 8, hairC);
    put(12, 15, 15, hairC); put(13, 15, 15, hairC);
    put(14, 8, 9, hairC); put(14, 14, 15, hairC);
    put(15, 8, 15, hairC); put(16, 9, 14, hairC); put(17, 9, 13, hairC);
    put(14, 10, 13, PUNK_INK);
  }

  /* ---- hair / headgear (drawn last so it sits on top) ---- */
  var hh = chosen.hair;
  if (hh === "Mohawk") {
    /* two-tone crest: tips in a second color when the dice differ */
    put(0, 11, 13, hairC2);
    for (r = 1; r <= 3; r++) { put(r, 11, 13, hairC); }
    put(2, 9, 14, hairC); put(3, 8, 15, hairC);
  } else if (hh === "Top Knot") {
    put(0, 11, 12, hairC2); put(1, 10, 13, hairC);
    put(2, 11, 12, PUNK_INK);                                /* tie */
    put(3, 8, 15, hairC); put(4, 7, 16, hairC);
  } else if (hh === "Headband") {
    put(2, 9, 14, hairC); put(3, 8, 15, hairC);
    put(5, 7, 16, hairC2);
    put(5, 17, 18, hairC2); put(6, 18, 18, hairC2);          /* knot tails */
  } else if (hh === "Wild") {
    put(2, 8, 15, hairC); put(3, 7, 16, hairC); put(4, 7, 16, hairC);
    for (c = 6; c <= 17; c++) {
      if (rng() < 0.55) { put(1, c, c, hairC); }
      if (rng() < 0.3) { put(0, c, c, hairC); }
    }
    put(5, 7, 7, hairC); put(5, 16, 16, hairC);
  } else if (hh === "Cap") {
    put(2, 9, 14, hairC); put(3, 8, 15, hairC);
    put(4, 7, 16, hairC); put(5, 7, 19, hairC);
  } else if (hh === "Beanie") {
    put(1, 9, 14, hairC); put(2, 8, 15, hairC); put(3, 8, 15, hairC);
    put(4, 7, 16, hairC);
    put(5, 7, 16, PUNK_INK);
    put(0, 11, 12, "#e8e4da");
  } else if (hh === "Hoodie") {
    put(1, 9, 14, hairC); put(2, 8, 15, hairC); put(3, 7, 16, hairC);
    put(4, 6, 7, hairC); put(4, 16, 17, hairC);
    for (r = 5; r <= 16; r++) { put(r, 6, 6, hairC); put(r, 17, 17, hairC); }
    put(17, 6, 8, hairC); put(17, 14, 17, hairC);
    for (r = 18; r <= 23; r++) { put(r, 5, 8, hairC); put(r, 14, 18, hairC); }
    put(20, 8, 14, hairC); put(21, 6, 16, hairC);
    put(22, 5, 17, hairC); put(23, 5, 17, hairC);
    put(18, 10, 12, P.skin); put(19, 10, 12, P.skin2);
  } else if (hh === "Long") {
    put(1, 9, 14, hairC); put(2, 8, 15, hairC); put(3, 7, 16, hairC);
    put(4, 7, 16, hairC);
    for (r = 5; r <= 14; r++) { put(r, 6, 6, hairC); put(r, 17, 17, hairC); }
    put(5, 7, 7, hairC); put(5, 16, 16, hairC);
    put(15, 6, 7, hairC); put(15, 16, 17, hairC);
  } else if (hh === "Buzz") {
    put(2, 9, 14, hairC); put(3, 8, 15, hairC); put(4, 7, 16, hairC);
  } else if (hh === "Crown") {
    put(0, 8, 8, "#e2b93c"); put(0, 11, 12, "#e2b93c"); put(0, 15, 15, "#e2b93c");
    put(1, 8, 15, "#e2b93c");
  }

  /* ---- extras (after hair so hoods do not hide them) ---- */
  if (chosen.extra === "Earring") {
    put(12, 7, 7, "#e2b93c");
  } else if (chosen.extra === "Chain") {
    for (c = 8; c <= 14; c++) { put(20, c, c, c % 2 ? "#e2b93c" : "#a5802b"); }
    put(21, 11, 11, "#e2b93c");
  } else if (chosen.extra === "Teardrop") {
    put(10, 9, 9, PUNK_INK); put(11, 9, 9, "#5c88b8");
  } else if (chosen.extra === "Scar") {
    put(9, 15, 15, PUNK_INK); put(10, 14, 14, PUNK_INK); put(11, 15, 15, PUNK_INK);
  }

  /* ---- outline: empty cells 4-adjacent to filled become ink ---- */
  var withOutline = cells.slice();
  for (r = 0; r < G; r++) {
    for (c = 0; c < G; c++) {
      if (cells[r * G + c]) { continue; }
      var adj = (c > 0 && cells[r * G + c - 1]) ||
                (c < G - 1 && cells[r * G + c + 1]) ||
                (r > 0 && cells[(r - 1) * G + c]) ||
                (r < G - 1 && cells[(r + 1) * G + c]);
      if (adj) { withOutline[r * G + c] = PUNK_INK; }
    }
  }

  var s = ART_BG[chosen.background === "Wash" ? "Wash" :
                 chosen.background === "Grid" ? "Grid" : "Plain"](
            artDrawRng(seed, key, "bg", salt), P);
  var runs = pxRunsC(withOutline, G, G);
  s += "<g transform='translate(64 40) scale(18)' shape-rendering='crispEdges'>";
  for (var col in runs) {
    if (!runs.hasOwnProperty(col)) { continue; }
    s += "<path fill='" + col + "' d='" + runs[col] + "'/>";
  }
  return s + "</g>";
}

/* ======================================================================
 * PACK: minipunks — Minima-branded 24x24 pixel characters
 *
 * Brand facts (from the family's own UIs): canvas #08090B, card #17191C,
 * greys #91919D/#BDBDC4/#E9E9EB/#F9F9FA, accent blue #3DA2FF, teal #00CBB6,
 * ember #FF512F, icon orange #FFA010; the logo is a straight-edged "M" of
 * three descending sawtooth wedges (tri-color #ff512f/#317aff/#91919d).
 * Each punk is a mono-grey face carrying exactly ONE accent.
 * ====================================================================== */

var MINIPUNK_PALETTES = [
  { name: "Icon", weight: 28, face: "#FFA010", face2: "#D9850D", face3: "#FFB84A" },
  { name: "Node", weight: 20, face: "#E9E9EB", face2: "#BDBDC4", face3: "#F9F9FA" },
  { name: "Azure", weight: 16, face: "#3DA2FF", face2: "#2B7CC9", face3: "#6BB8FF" },
  { name: "Maxima", weight: 14, face: "#00CBB6", face2: "#00A392", face3: "#4FE3C1" },
  { name: "Ember", weight: 12, face: "#FF512F", face2: "#CC3A20", face3: "#FF7B5C" },
  { name: "Tri-Sig", weight: 6, face: "#F9F9FA", face2: "#D3D3D8", face3: "#FFFFFF" }
];

/* brand constants (from the family's own UIs and the layered logo SVG) */
var MP_DK = "#17191C";
var MP_OR = "#FFA010";
var MP_BL = "#3DA2FF";
var MP_WH = "#F9F9FA";
var MP_EMB = "#FF512F";
var MP_TRI = ["#FF512F", "#317AFF", "#91919D"];

function minipunksSlots() {
  return [
    { key: "crest", label: "Headgear", variants: [
      { name: "M Crest", weight: 20 }, { name: "Mohawk", weight: 15 },
      { name: "Cap", weight: 14 }, { name: "Hoodie", weight: 12 },
      { name: "Headset", weight: 12 }, { name: "Antenna", weight: 10 },
      { name: "Spikes", weight: 9 }, { name: "Bald", weight: 8 } ] },
    { key: "eyes", label: "Eyes", variants: [
      { name: "Regular", weight: 30 }, { name: "Laser", weight: 20 },
      { name: "Shades", weight: 20 }, { name: "Visor", weight: 16 },
      { name: "Patch", weight: 14 } ] },
    { key: "mouth", label: "Mouth", variants: [
      { name: "Neutral", weight: 28 }, { name: "Smile", weight: 24 },
      { name: "Grin", weight: 18 }, { name: "Cigarette", weight: 18 },
      { name: "Whistle", weight: 12 } ] },
    { key: "print", label: "Chest print", variants: [
      { name: "Orange M", weight: 35 }, { name: "Blue M", weight: 25 },
      { name: "White M", weight: 22 }, { name: "Tri M", weight: 18 } ] },
    { key: "companion", label: "Companion", variants: [
      { name: "None", weight: 40 }, { name: "Block", weight: 22 },
      { name: "Coin", weight: 22 }, { name: "Rain", weight: 16 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Charcoal", weight: 30 }, { name: "Deep Blue", weight: 28 },
      { name: "Deep Teal", weight: 22 }, { name: "Grid", weight: 20 } ] }
  ];
}

/* Minima punks v2: the BRAND is the subject. Faces are the brand swatches
 * themselves (the flagship "Icon" type is the app icon: orange face, dark M
 * on the forehead), every punk wears the sawtooth-M chest print, hair is
 * uniform brand-dark, and backgrounds are deep brand-tinted panels. */
function minipunksCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "punk", salt);
  var G = 24;
  var cells = [];
  var i, r, c;
  for (i = 0; i < G * G; i++) { cells.push(null); }
  function put(row, c0, c1, col) {
    for (var cc = c0; cc <= c1; cc++) {
      if (row >= 0 && row < G && cc >= 0 && cc < G) { cells[row * G + cc] = col; }
    }
  }

  /* ---- base head + shoulders (classic punk template, brand face) ---- */
  put(2, 9, 14, P.face);
  put(3, 8, 15, P.face);
  for (r = 4; r <= 14; r++) { put(r, 7, 16, P.face); }
  put(15, 8, 15, P.face);
  put(16, 8, 14, P.face);
  put(17, 9, 13, P.face);
  put(18, 10, 12, P.face);
  put(19, 10, 12, P.face2);
  put(20, 8, 14, P.face);
  put(21, 6, 16, P.face);
  put(22, 5, 17, P.face);
  put(23, 5, 17, P.face);

  /* craft pass: rim light + dither + contour */
  for (r = 4; r <= 15; r++) { put(r, 7, 7, P.face3); }
  put(3, 8, 10, P.face3);
  for (r = 10; r <= 14; r++) {
    for (c = 14; c <= 15; c++) {
      if ((r + c) % 2 === 0) { put(r, c, c, P.face2); }
    }
  }
  put(10, 7, 7, P.face2); put(11, 7, 7, P.face2);
  put(11, 11, 11, P.face2); put(12, 11, 12, P.face2);
  put(16, 9, 13, P.face2);

  /* the brand tee, always */
  put(20, 8, 14, MP_DK);
  for (r = 21; r <= 23; r++) { put(r, 5, 17, MP_DK); }

  /* ---- forehead M: the icon lockup. Skipped when headgear covers it ---- */
  var covered = chosen.crest === "Cap" || chosen.crest === "Hoodie";
  if (!covered && (P.name === "Icon" || P.name === "Tri-Sig")) {
    var fm = P.name === "Tri-Sig" ? MP_TRI : [MP_DK, MP_DK, MP_DK];
    for (r = 4; r <= 6; r++) { put(r, 9, 9, fm[0]); }
    for (r = 5; r <= 6; r++) { put(r, 11, 11, fm[1]); }
    put(6, 13, 13, fm[2]);
  }

  /* ---- eyes (brand-dark ink pops on every swatch face) ---- */
  var laserC = P.name === "Ember" ? MP_BL : MP_EMB;
  var visorC = P.name === "Azure" ? MP_OR : MP_BL;
  if (chosen.eyes === "Regular") {
    put(8, 9, 10, MP_WH); put(8, 13, 14, MP_WH);
    put(8, 10, 10, MP_DK); put(8, 14, 14, MP_DK);
    put(7, 9, 10, P.face2); put(7, 13, 14, P.face2);
  } else if (chosen.eyes === "Laser") {
    put(8, 9, 10, laserC); put(8, 13, 14, laserC);
    put(8, 15, 23, laserC); put(8, 0, 6, laserC);
    put(7, 20, 20, laserC); put(9, 3, 3, laserC);
  } else if (chosen.eyes === "Shades") {
    put(8, 7, 16, MP_DK);
    put(9, 9, 10, MP_DK); put(9, 13, 14, MP_DK);
    put(8, 9, 9, MP_WH); put(8, 13, 13, MP_WH);
  } else if (chosen.eyes === "Visor") {
    put(7, 7, 16, MP_DK); put(9, 7, 16, MP_DK);
    put(8, 7, 16, visorC);
  } else { /* Patch */
    put(7, 8, 15, MP_DK);
    put(8, 9, 10, MP_DK); put(9, 9, 10, MP_DK);
    put(8, 13, 14, MP_WH); put(8, 14, 14, MP_DK);
  }

  /* ---- mouth ---- */
  if (chosen.mouth === "Neutral") {
    put(14, 10, 13, MP_DK);
  } else if (chosen.mouth === "Smile") {
    put(14, 10, 13, MP_DK); put(13, 9, 9, MP_DK); put(13, 14, 14, MP_DK);
  } else if (chosen.mouth === "Grin") {
    put(13, 9, 9, MP_DK); put(13, 14, 14, MP_DK);
    put(14, 10, 13, MP_WH); put(15, 10, 13, MP_DK);
  } else if (chosen.mouth === "Cigarette") {
    put(14, 10, 13, MP_DK);
    put(14, 14, 18, "#D3D3D8"); put(14, 19, 19, MP_EMB);
    put(12, 19, 19, "#91919D"); put(11, 20, 20, "#91919D"); put(10, 19, 19, "#91919D");
  } else { /* Whistle */
    put(14, 11, 12, MP_DK); put(13, 11, 12, MP_DK);
    put(11, 17, 17, MP_BL); put(9, 19, 19, MP_BL); put(10, 18, 18, "#91919D");
  }

  /* ---- headgear (uniform brand-dark hair; the M crest carries color) ---- */
  var ch = chosen.crest;
  if (ch === "M Crest") {
    /* the logo, worn: three descending sawtooth wedges */
    var tc = P.name === "Tri-Sig" ? MP_TRI
           : P.name === "Icon" ? [MP_DK, MP_DK, MP_DK]
           : [MP_OR, MP_OR, MP_OR];
    put(4, 7, 16, tc[1]);
    put(0, 8, 9, tc[0]); put(0, 10, 10, tc[0]);
    for (r = 1; r <= 3; r++) { put(r, 8, 9, tc[0]); }
    for (r = 1; r <= 3; r++) { put(r, 11, 12, tc[1]); }
    for (r = 2; r <= 3; r++) { put(r, 14, 15, tc[2]); }
  } else if (ch === "Mohawk") {
    put(0, 11, 13, MP_DK);
    for (r = 1; r <= 3; r++) { put(r, 11, 13, MP_DK); }
    put(2, 9, 14, MP_DK); put(3, 8, 15, MP_DK);
  } else if (ch === "Cap") {
    put(1, 9, 14, MP_DK); put(2, 8, 15, MP_DK); put(3, 8, 15, MP_DK);
    put(4, 6, 17, MP_DK);
    put(2, 11, 12, MP_OR); put(3, 11, 12, MP_OR);   /* M patch */
  } else if (ch === "Hoodie") {
    put(1, 9, 14, MP_DK); put(2, 8, 15, MP_DK); put(3, 7, 16, MP_DK);
    put(4, 6, 7, MP_DK); put(4, 16, 17, MP_DK);
    for (r = 5; r <= 16; r++) { put(r, 6, 6, MP_DK); put(r, 17, 17, MP_DK); }
    put(17, 6, 8, MP_DK); put(17, 14, 17, MP_DK);
    for (r = 18; r <= 23; r++) { put(r, 5, 8, MP_DK); put(r, 14, 18, MP_DK); }
    put(18, 10, 12, P.face); put(19, 10, 12, P.face2);
    put(18, 9, 9, MP_OR); put(19, 9, 9, MP_OR);
    put(18, 13, 13, MP_OR); put(19, 13, 13, MP_OR);
  } else if (ch === "Headset") {
    put(1, 9, 14, "#464C4F");
    put(2, 8, 8, "#464C4F"); put(2, 15, 15, "#464C4F");
    put(7, 5, 6, MP_DK); put(8, 5, 6, MP_DK); put(9, 5, 6, MP_DK);
    put(7, 17, 18, MP_DK); put(8, 17, 18, MP_DK); put(9, 17, 18, MP_DK);
    put(8, 5, 5, MP_OR);
    put(11, 18, 18, "#464C4F"); put(13, 17, 17, "#464C4F");
    put(14, 15, 16, "#464C4F"); put(14, 15, 15, MP_OR);
  } else if (ch === "Antenna") {
    put(0, 11, 11, MP_OR);
    put(1, 11, 11, "#91919D"); put(2, 11, 11, "#91919D");
    put(0, 13, 13, MP_OR); put(1, 14, 14, MP_OR);
  } else if (ch === "Spikes") {
    for (c = 8; c <= 15; c += 2) {
      put(0, c, c, MP_DK); put(1, c, c, MP_DK);
    }
    put(2, 8, 15, MP_DK);
  }

  /* ---- chest print: EVERY Minima punk wears the M ---- */
  var pc = chosen.print === "Orange M" ? [MP_OR, MP_OR, MP_OR]
         : chosen.print === "Blue M" ? [MP_BL, MP_BL, MP_BL]
         : chosen.print === "White M" ? [MP_WH, MP_WH, MP_WH]
         : MP_TRI;
  for (r = 20; r <= 23; r++) { put(r, 8, 9, pc[0]); }
  for (r = 21; r <= 23; r++) { put(r, 11, 12, pc[1]); }
  for (r = 22; r <= 23; r++) { put(r, 14, 15, pc[2]); }

  /* ---- companion ---- */
  if (chosen.companion === "Block") {
    put(2, 19, 21, MP_OR);
    put(3, 19, 21, "#282B2E");
    put(4, 19, 21, "#282B2E");
  } else if (chosen.companion === "Coin") {
    put(2, 19, 21, MP_OR); put(3, 18, 18, MP_OR); put(3, 22, 22, MP_OR);
    put(4, 19, 21, MP_OR); put(3, 19, 21, MP_OR); put(3, 20, 20, MP_DK);
  } else if (chosen.companion === "Rain") {
    for (i = 0; i < 7; i++) {
      var rc = artInt(rng, 0, 1) ? artInt(rng, 1, 4) : artInt(rng, 19, 22);
      put(artInt(rng, 1, 17), rc, rc, MP_BL);
    }
  }

  /* ---- outline ---- */
  var withOutline = cells.slice();
  for (r = 0; r < G; r++) {
    for (c = 0; c < G; c++) {
      if (cells[r * G + c]) { continue; }
      var adj = (c > 0 && cells[r * G + c - 1]) ||
                (c < G - 1 && cells[r * G + c + 1]) ||
                (r > 0 && cells[(r - 1) * G + c]) ||
                (r < G - 1 && cells[(r + 1) * G + c]);
      if (adj) { withOutline[r * G + c] = "#000000"; }
    }
  }

  /* ---- background: deep brand-tinted panels (not black-on-black) ---- */
  var s;
  if (chosen.background === "Deep Blue") {
    s = "<rect width='512' height='512' fill='#16263B'/>";
  } else if (chosen.background === "Deep Teal") {
    s = "<rect width='512' height='512' fill='#10302B'/>";
  } else if (chosen.background === "Grid") {
    s = "<rect width='512' height='512' fill='#101114'/>" +
        "<defs><pattern id='bgg' width='44' height='44' patternUnits='userSpaceOnUse'>" +
        "<path d='M44 0H0V44' fill='none' stroke='#24272B' stroke-width='2'/></pattern></defs>" +
        "<rect width='512' height='512' fill='url(#bgg)'/>";
  } else {
    s = "<rect width='512' height='512' fill='" + MP_DK + "'/>";
  }

  var runs = pxRunsC(withOutline, G, G);
  s += "<g transform='translate(64 40) scale(18)' shape-rendering='crispEdges'>";
  for (var col2 in runs) {
    if (!runs.hasOwnProperty(col2)) { continue; }
    s += "<path fill='" + col2 + "' d='" + runs[col2] + "'/>";
  }
  return s + "</g>";
}

/* ======================================================================
 * PACK: pandas — Panda Punks, from the eurobuddha laser-eyed panda avatar:
 * plush panda, dark ear/eye patches, glowing laser eyes, pale muzzle, dark
 * arms, tri-color M chest badge, blue jigsaw-puzzle background.
 * ====================================================================== */

var PANDA_PALETTES = [
  { name: "Classic", weight: 30, fur: "#EFE6D5", fur2: "#D6C9AE", fur3: "#FBF6EA",
    patch: "#2A241D", patch2: "#453B2E", muzzle: "#F7F1E2" },
  { name: "Vintage", weight: 20, fur: "#E4D2A8", fur2: "#C9B380", fur3: "#F0E4C4",
    patch: "#4A3626", patch2: "#6B5138", muzzle: "#EFE3C2" },
  { name: "Snow", weight: 16, fur: "#F7F5F0", fur2: "#DEDAD0", fur3: "#FFFFFF",
    patch: "#6B6B75", patch2: "#8A8A96", muzzle: "#FFFFFF" },
  { name: "Shadow", weight: 14, fur: "#6E675C", fur2: "#57514A", fur3: "#857D70",
    patch: "#17141A", patch2: "#2E2830", muzzle: "#7E766A" },
  { name: "Rusty", weight: 12, fur: "#D98A4A", fur2: "#B86D33", fur3: "#EDA868",
    patch: "#3D2A1E", patch2: "#59402C", muzzle: "#F0DFC2" },
  { name: "Moon", weight: 8, fur: "#DCE4F0", fur2: "#BCC9DE", fur3: "#F0F5FC",
    patch: "#1E2A4A", patch2: "#33416B", muzzle: "#EDF2FA" }
];

function pandasSlots() {
  return [
    { key: "ears", label: "Ears", variants: [
      { name: "Perky", weight: 32 }, { name: "Floppy", weight: 30 },
      { name: "Bear", weight: 22 }, { name: "Torn", weight: 16 } ] },
    { key: "eyes", label: "Eyes", variants: [
      { name: "Laser Red", weight: 30 }, { name: "Button", weight: 20 },
      { name: "Laser Blue", weight: 16 }, { name: "Amber Glow", weight: 14 },
      { name: "Sleepy", weight: 10 }, { name: "X-Stitch", weight: 10 } ] },
    { key: "mouth", label: "Muzzle", variants: [
      { name: "Calm", weight: 30 }, { name: "Smile", weight: 24 },
      { name: "Tongue", weight: 16 }, { name: "Stitch", weight: 16 },
      { name: "Grr", weight: 14 } ] },
    { key: "chest", label: "Chest", variants: [
      { name: "Tri-M", weight: 28 }, { name: "None", weight: 22 },
      { name: "Patch", weight: 20 }, { name: "Bamboo", weight: 16 },
      { name: "Heart", weight: 14 } ] },
    { key: "extra", label: "Extra", variants: [
      { name: "None", weight: 40 }, { name: "Stitches", weight: 24 },
      { name: "Bandage", weight: 18 }, { name: "Blush", weight: 18 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Puzzle", weight: 34 }, { name: "Royal", weight: 24 },
      { name: "Dusk", weight: 22 }, { name: "Grid", weight: 20 } ] }
  ];
}

function pandasCompose(seed, salt, key, chosen, P) {
  var rng = artDrawRng(seed, key, "panda", salt);
  var G = 24;
  var cells = [];
  var i, r, c;
  for (i = 0; i < G * G; i++) { cells.push(null); }
  function put(row, c0, c1, col) {
    for (var cc = c0; cc <= c1; cc++) {
      if (row >= 0 && row < G && cc >= 0 && cc < G) { cells[row * G + cc] = col; }
    }
  }
  var INK = "#14120E";

  /* ---- ears (behind the head fill) ---- */
  if (chosen.ears === "Perky") {
    put(1, 6, 7, P.patch); put(1, 16, 17, P.patch);
    put(2, 5, 8, P.patch); put(2, 15, 18, P.patch);
    put(3, 6, 8, P.patch); put(3, 15, 17, P.patch);
  } else if (chosen.ears === "Floppy") {
    put(2, 5, 8, P.patch); put(2, 15, 18, P.patch);
    put(3, 3, 6, P.patch); put(3, 17, 20, P.patch);
    put(4, 3, 4, P.patch); put(4, 19, 20, P.patch);
  } else if (chosen.ears === "Bear") {
    put(0, 6, 8, P.patch); put(0, 15, 17, P.patch);
    put(1, 5, 9, P.patch); put(1, 14, 18, P.patch);
    put(2, 5, 9, P.patch); put(2, 14, 18, P.patch);
    put(3, 6, 8, P.patch); put(3, 15, 17, P.patch);
    put(1, 6, 7, P.patch2); put(1, 15, 16, P.patch2);   /* inner ear */
  } else { /* Torn: perky with a nicked right ear */
    put(1, 6, 7, P.patch);
    put(2, 5, 8, P.patch); put(2, 15, 16, P.patch);
    put(3, 6, 8, P.patch); put(3, 15, 18, P.patch);
    put(2, 18, 18, P.patch2);
  }

  /* ---- head ---- */
  put(3, 9, 14, P.fur);
  put(4, 7, 16, P.fur);
  for (r = 5; r <= 12; r++) { put(r, 6, 17, P.fur); }
  put(13, 7, 16, P.fur);
  put(14, 8, 15, P.fur);
  /* craft: rim light + cheek dither */
  for (r = 5; r <= 12; r++) { put(r, 6, 6, P.fur3); }
  for (r = 11; r <= 13; r++) {
    for (c = 15; c <= 16; c++) {
      if ((r + c) % 2 === 0) { put(r, c, c, P.fur2); }
    }
  }

  /* ---- eye patches (large, round-ish — the avatar's signature) ---- */
  put(6, 8, 10, P.patch); put(6, 13, 15, P.patch);
  put(7, 7, 10, P.patch); put(7, 13, 16, P.patch);
  put(8, 7, 10, P.patch); put(8, 13, 16, P.patch);
  put(9, 8, 10, P.patch); put(9, 13, 15, P.patch);

  /* ---- muzzle + nose (the avatar's snout is prominent) ---- */
  put(10, 10, 13, P.muzzle);
  put(11, 10, 13, P.muzzle);
  put(12, 10, 13, P.muzzle);
  put(13, 10, 13, P.muzzle);
  put(10, 11, 12, P.patch);                            /* nose 2x2 */
  put(11, 11, 12, P.patch);

  /* ---- eyes ---- */
  var laser = chosen.eyes === "Laser Red" ? "#FF2A18"
            : chosen.eyes === "Laser Blue" ? "#3DA2FF"
            : chosen.eyes === "Amber Glow" ? "#FFC22E" : null;
  if (laser) {
    var flare = chosen.eyes === "Laser Red" ? "#FF7B5C"
              : chosen.eyes === "Laser Blue" ? "#AEF1FF" : "#FFE49A";
    put(7, 9, 9, laser); put(7, 14, 14, laser);
    put(6, 9, 9, flare); put(8, 9, 9, flare);
    put(7, 8, 8, flare); put(7, 10, 10, flare);
    put(6, 14, 14, flare); put(8, 14, 14, flare);
    put(7, 13, 13, flare); put(7, 15, 15, flare);
  } else if (chosen.eyes === "Button") {
    put(7, 8, 9, P.fur3); put(7, 13, 14, P.fur3);
    put(7, 9, 9, INK); put(7, 14, 14, INK);
    put(8, 9, 9, P.patch2); put(8, 14, 14, P.patch2);  /* thread shadow */
  } else if (chosen.eyes === "Sleepy") {
    put(7, 8, 10, P.fur3); put(7, 13, 15, P.fur3);
    put(8, 8, 10, P.patch2); put(8, 13, 15, P.patch2);
  } else { /* X-Stitch */
    put(6, 8, 8, P.fur3); put(6, 10, 10, P.fur3);
    put(7, 9, 9, P.fur3);
    put(8, 8, 8, P.fur3); put(8, 10, 10, P.fur3);
    put(6, 13, 13, P.fur3); put(6, 15, 15, P.fur3);
    put(7, 14, 14, P.fur3);
    put(8, 13, 13, P.fur3); put(8, 15, 15, P.fur3);
  }

  /* ---- mouth (below the nose) ---- */
  if (chosen.mouth === "Smile") {
    put(12, 10, 10, INK); put(12, 13, 13, INK); put(13, 11, 12, INK);
  } else if (chosen.mouth === "Tongue") {
    put(12, 11, 12, INK); put(13, 11, 12, "#E86A8A");
  } else if (chosen.mouth === "Stitch") {
    put(12, 10, 13, INK);
    put(13, 10, 10, INK); put(13, 12, 12, INK);
  } else if (chosen.mouth === "Grr") {
    put(12, 10, 13, INK); put(13, 10, 13, "#F7F1E2");
    put(13, 11, 11, INK); put(13, 13, 13, INK);
  } else { /* Calm: soft shadow under the nose */
    put(12, 11, 12, P.fur2);
  }

  /* ---- body: neck, torso, dark arms ---- */
  put(15, 9, 14, P.fur);
  put(16, 7, 15, P.fur);
  for (r = 17; r <= 23; r++) { put(r, 6, 16, P.fur); }
  for (r = 18; r <= 23; r++) {
    for (c = 13; c <= 15; c++) {
      if ((r + c) % 2 === 0) { put(r, c, c, P.fur2); }   /* belly shade */
    }
  }
  put(16, 4, 6, P.patch); put(16, 16, 18, P.patch);
  put(17, 3, 5, P.patch); put(17, 17, 19, P.patch);
  for (r = 18; r <= 23; r++) {
    put(r, 2, 4, P.patch); put(r, 18, 20, P.patch);
  }
  put(19, 2, 2, P.patch2); put(19, 20, 20, P.patch2);   /* arm highlight */

  /* ---- chest ---- */
  if (chosen.chest === "Tri-M") {
    /* the avatar's tri-color Minima badge */
    for (r = 18; r <= 20; r++) { put(r, 9, 9, "#FF512F"); }
    for (r = 19; r <= 20; r++) { put(r, 11, 11, "#317AFF"); }
    put(20, 13, 13, "#91919D");
  } else if (chosen.chest === "Patch") {
    put(18, 11, 13, P.fur2); put(19, 11, 13, P.fur2); put(20, 11, 13, P.fur2);
    put(18, 11, 11, INK); put(20, 13, 13, INK);         /* stitch corners */
  } else if (chosen.chest === "Bamboo") {
    for (r = 15; r <= 22; r++) { put(r, 17, 17, "#3A8F4A"); }
    put(16, 16, 16, "#5CB86A"); put(18, 18, 18, "#5CB86A");
    put(19, 17, 17, "#2E7038");
  } else if (chosen.chest === "Heart") {
    put(18, 10, 10, "#E23B4E"); put(18, 12, 12, "#E23B4E");
    put(19, 10, 13, "#E23B4E"); put(19, 11, 12, "#FF6A7A");
    put(20, 11, 12, "#E23B4E"); put(21, 11, 11, "#E23B4E");
  }

  /* ---- extras ---- */
  if (chosen.extra === "Stitches") {
    put(5, 9, 9, P.fur2); put(5, 11, 11, P.fur2); put(5, 13, 13, P.fur2);
    put(13, 8, 8, P.fur2); put(13, 10, 10, P.fur2);
    put(13, 12, 12, P.fur2); put(13, 14, 14, P.fur2);
  } else if (chosen.extra === "Bandage") {
    put(4, 13, 16, "#EDE6D8"); put(5, 13, 16, "#EDE6D8");
    put(4, 14, 14, "#C9BFA8"); put(5, 15, 15, "#C9BFA8");
  } else if (chosen.extra === "Blush") {
    put(10, 7, 8, "#E8A0A8"); put(10, 15, 16, "#E8A0A8");
  }

  /* ---- outline ---- */
  var withOutline = cells.slice();
  for (r = 0; r < G; r++) {
    for (c = 0; c < G; c++) {
      if (cells[r * G + c]) { continue; }
      var adj = (c > 0 && cells[r * G + c - 1]) ||
                (c < G - 1 && cells[r * G + c + 1]) ||
                (r > 0 && cells[(r - 1) * G + c]) ||
                (r < G - 1 && cells[(r + 1) * G + c]);
      if (adj) { withOutline[r * G + c] = INK; }
    }
  }

  /* ---- background ---- */
  var s;
  if (chosen.background === "Puzzle") {
    /* the avatar's blue jigsaw: tile edges with knob bumps */
    s = "<rect width='512' height='512' fill='#1E3F7A'/>" +
        "<defs><pattern id='pz' width='64' height='64' patternUnits='userSpaceOnUse'>" +
        "<path d='M0 64h22a8 8 0 1 0 20 0h22' fill='none' stroke='#2E56A0' stroke-width='2.5'/>" +
        "<path d='M64 0v22a8 8 0 1 0 0 20v22' fill='none' stroke='#2E56A0' stroke-width='2.5'/>" +
        "</pattern></defs>" +
        "<rect width='512' height='512' fill='url(#pz)'/>";
  } else if (chosen.background === "Royal") {
    s = "<rect width='512' height='512' fill='#1B2E5C'/>";
  } else if (chosen.background === "Dusk") {
    s = "<rect width='512' height='512' fill='#2A1F4A'/>";
  } else {
    s = "<rect width='512' height='512' fill='#121420'/>" +
        "<defs><pattern id='bgg' width='44' height='44' patternUnits='userSpaceOnUse'>" +
        "<path d='M44 0H0V44' fill='none' stroke='#22263A' stroke-width='2'/></pattern></defs>" +
        "<rect width='512' height='512' fill='url(#bgg)'/>";
  }

  var runs = pxRunsC(withOutline, G, G);
  s += "<g transform='translate(64 40) scale(18)' shape-rendering='crispEdges'>";
  for (var col2 in runs) {
    if (!runs.hasOwnProperty(col2)) { continue; }
    s += "<path fill='" + col2 + "' d='" + runs[col2] + "'/>";
  }
  s += "</g>";

  /* ---- laser glow aura (SVG layer over the pixels — the avatar's halo) ---- */
  if (laser) {
    var ex1 = 64 + 9.5 * 18, ex2 = 64 + 14.5 * 18, ey = 40 + 7.5 * 18;
    s += "<defs><radialGradient id='gl'><stop offset='0' stop-color='" + laser +
         "' stop-opacity='0.95'/><stop offset='0.35' stop-color='" + laser +
         "' stop-opacity='0.5'/><stop offset='1' stop-color='" + laser +
         "' stop-opacity='0'/></radialGradient></defs>" +
         "<circle cx='" + I(ex1) + "' cy='" + I(ey) + "' r='58' fill='url(#gl)'/>" +
         "<circle cx='" + I(ex2) + "' cy='" + I(ey) + "' r='58' fill='url(#gl)'/>";
  }
  return s;
}

/* ======================================================================
 * PACK: photo — a real photo as a pixel cartoon
 *
 * The page center-crops the picked photo onto a 96x96 canvas, quantizes it
 * to 8 flat colors on-device (photo.js) and hands the master grid to
 * artSetPhoto(). Every variant re-derives from that master: Smooth render
 * (marching-squares contours simplified into curved flat regions — the
 * default) or Pixel mosaic, grid size, palette re-light, cartoon edge ink,
 * overlays. With no photo loaded the pack draws a seeded placeholder bust —
 * that is what the tests sweep and what the style card shows; the studio
 * refuses to mint it.
 * ====================================================================== */

var ART_PHOTO_SRC = null;
function artSetPhoto(model) { ART_PHOTO_SRC = model || null; }

function photoSlots() {
  return [
    { key: "finish", label: "Finish", variants: [
      { name: "Painted", weight: 58 }, { name: "Vector", weight: 42 } ] },
    { key: "render", label: "Render", variants: [
      { name: "Smooth", weight: 62 }, { name: "Pixel", weight: 38 } ] },
    { key: "grid", label: "Detail", variants: [
      { name: "48", weight: 46 }, { name: "40", weight: 30 },
      { name: "32", weight: 24 } ] },
    { key: "mode", label: "Mode", variants: [
      { name: "Natural", weight: 34 }, { name: "Poster", weight: 22 },
      { name: "Duotone", weight: 18 }, { name: "Mono", weight: 16 },
      { name: "Invert", weight: 10 } ] },
    { key: "background", label: "Background", variants: [
      { name: "Plain", weight: 45 }, { name: "Wash", weight: 30 },
      { name: "Grid", weight: 25 } ] },
    { key: "outline", label: "Outline", variants: [
      { name: "None", weight: 55 }, { name: "Ink", weight: 45 } ] },
    { key: "overlay", label: "Overlay", variants: [
      { name: "None", weight: 60 }, { name: "Scanlines", weight: 22 },
      { name: "Dots", weight: 18 } ] }
  ];
}

function photoHex2(v) {
  v = Math.max(0, Math.min(255, I(v)));
  var h = v.toString(16);
  return h.length < 2 ? "0" + h : h;
}
function photoRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16)];
}
function photoLum(hex) {
  var c = photoRgb(hex);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function photoLerpHex(a, b, t) {
  var A = photoRgb(a), B = photoRgb(b);
  return "#" + photoHex2(A[0] + (B[0] - A[0]) * t) +
               photoHex2(A[1] + (B[1] - A[1]) * t) +
               photoHex2(A[2] + (B[2] - A[2]) * t);
}
function photoRamp(stops, t) {
  var pos = t * (stops.length - 1);
  var i = Math.min(stops.length - 2, Math.floor(pos));
  return photoLerpHex(stops[i], stops[i + 1], pos - i);
}

/* palette index -> luminance rank (0 = darkest); ties broken by index */
function photoRanks(pal) {
  var idx = [];
  for (var i = 0; i < pal.length; i++) { idx.push(i); }
  idx.sort(function (a, b) {
    var d = photoLum(pal[a]) - photoLum(pal[b]);
    return d !== 0 ? d : a - b;
  });
  var rank = [];
  for (var r = 0; r < idx.length; r++) { rank[idx[r]] = r; }
  return rank;
}
function photoDarkest(pal) {
  var d = pal[0];
  for (var i = 1; i < pal.length; i++) {
    if (photoLum(pal[i]) < photoLum(d)) { d = pal[i]; }
  }
  return d;
}

/* majority-vote box downsample of quantized indices (also upsamples) */
function photoResample(cells, srcN, dstN) {
  if (dstN === srcN) { return cells.slice(); }
  var out = [];
  for (var y = 0; y < dstN; y++) {
    var y0 = Math.floor(y * srcN / dstN), y1 = Math.floor((y + 1) * srcN / dstN);
    if (y1 <= y0) { y1 = y0 + 1; }
    for (var x = 0; x < dstN; x++) {
      var x0 = Math.floor(x * srcN / dstN), x1 = Math.floor((x + 1) * srcN / dstN);
      if (x1 <= x0) { x1 = x0 + 1; }
      var counts = {}, best = cells[y0 * srcN + x0], bestN = 0;
      for (var yy = y0; yy < y1; yy++) {
        for (var xx = x0; xx < x1; xx++) {
          var v = cells[yy * srcN + xx];
          counts[v] = (counts[v] || 0) + 1;
          if (counts[v] > bestN || (counts[v] === bestN && v < best)) {
            best = v; bestN = counts[v];
          }
        }
      }
      out.push(best);
    }
  }
  return out;
}

/* 3x3 majority filter — flattens sensor noise into flat cartoon regions
 * (and cuts run counts, which is what the byte budget pays for) */
function photoSmooth(cells, n) {
  var out = cells.slice();
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      var counts = {}, best = -1, bestN = 0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= n || xx < 0 || xx >= n) { continue; }
          var v = cells[yy * n + xx];
          counts[v] = (counts[v] || 0) + 1;
          if (counts[v] > bestN || (counts[v] === bestN && v < best)) {
            best = v; bestN = counts[v];
          }
        }
      }
      if (bestN >= 5) { out[y * n + x] = best; }
    }
  }
  return out;
}

/* display palette for a mode: photo colors, inverted, or the master's
 * luminance order re-lit through the chosen palette's ramp */
function photoPalette(model, mode, P) {
  var pal = model.palette;
  var k = pal.length;
  var i;
  if (mode === "Natural") { return pal.slice(); }
  if (mode === "Invert") {
    var inv = [];
    for (i = 0; i < k; i++) {
      var c = photoRgb(pal[i]);
      inv.push("#" + photoHex2(255 - c[0]) + photoHex2(255 - c[1]) +
               photoHex2(255 - c[2]));
    }
    return inv;
  }
  var stops = mode === "Mono" ? ["#0d0d12", "#f4f4f7"] :
              mode === "Duotone" ? [P.ink, P.body, P.glow] :
              [P.ink, P.body2, P.body, P.accent, P.glow];   /* Poster */
  var rank = photoRanks(pal);
  var out = [];
  for (i = 0; i < k; i++) {
    out.push(photoRamp(stops, k > 1 ? rank[i] / (k - 1) : 0));
  }
  return out;
}

/* cartoon edge: a cell whose right/down neighbour is >= 2 luminance ranks
 * away sits on a region boundary (right/down only keeps the line thin) */
function photoEdgeAt(cells, rank, G, x, y) {
  var r = rank[cells[y * G + x]];
  return (x + 1 < G && Math.abs(rank[cells[y * G + x + 1]] - r) >= 2) ||
         (y + 1 < G && Math.abs(rank[cells[(y + 1) * G + x]] - r) >= 2);
}

function photoDrawGrid(model, G, mode, outline, P) {
  var cells = photoSmooth(photoResample(model.cells, model.cols, G), G);
  var pal = photoPalette(model, mode, P);
  var cc = [];
  for (var i = 0; i < cells.length; i++) { cc.push(pal[cells[i]]); }
  var runs = pxRunsC(cc, G, G);
  var s = "";
  for (var col in runs) {
    if (!runs.hasOwnProperty(col)) { continue; }
    s += "<path fill='" + col + "' d='" + runs[col] + "'/>";
  }
  if (outline === "Ink") {
    /* edges come from the MASTER palette ranks so the drawing's structure
     * is the same in every mode; only the ink color follows the re-light */
    var rank = photoRanks(model.palette);
    var d = "";
    for (var y = 0; y < G; y++) {
      var x = 0;
      while (x < G) {
        if (photoEdgeAt(cells, rank, G, x, y)) {
          var x0 = x;
          while (x < G && photoEdgeAt(cells, rank, G, x, y)) { x++; }
          d += "M" + x0 + " " + y + "h" + (x - x0) + "v1h-" + (x - x0) + "z";
        } else { x++; }
      }
    }
    if (d) {
      s += "<path fill='" + photoDarkest(pal) + "' opacity='0.8' d='" + d + "'/>";
    }
  }
  return s;
}

function photoOverlay(kind, G, P) {
  /* pattern cells track the drawing's own resolution so the texture reads
   * the same whether the g holds a 32px mosaic or a 96px trace */
  var u = Math.max(1, I(G / 48));
  if (kind === "Scanlines") {
    return "<defs><pattern id='pso' width='" + u + "' height='" + (2 * u) +
      "' patternUnits='userSpaceOnUse'>" +
      "<rect width='" + u + "' height='" + u + "' fill='" + P.ink +
      "' opacity='0.16'/></pattern></defs>" +
      "<rect width='" + G + "' height='" + G + "' fill='url(#pso)'/>";
  }
  if (kind === "Dots") {
    return "<defs><pattern id='pdo' width='" + (2 * u) + "' height='" + (2 * u) +
      "' patternUnits='userSpaceOnUse'>" +
      "<circle cx='" + u + "' cy='" + u + "' r='" + N(0.45 * u) + "' fill='" + P.ink +
      "' opacity='0.2'/></pattern></defs>" +
      "<rect width='" + G + "' height='" + G + "' fill='url(#pdo)'/>";
  }
  return "";
}

/* ---- Smooth render: marching-squares contours -> simplified curved regions ---- */

/* boundary loops of a binary mask: directed unit segments (filled region on
 * the right), chained head-to-tail into closed rings */
function photoTraceLoops(mask, n) {
  var segs = {};
  function seg(x0, y0, x1, y1) {
    var k = x0 + "," + y0;
    if (!segs[k]) { segs[k] = []; }
    segs[k].push([x1, y1]);
  }
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      if (!mask[y * n + x]) { continue; }
      if (y === 0 || !mask[(y - 1) * n + x]) { seg(x, y, x + 1, y); }
      if (y === n - 1 || !mask[(y + 1) * n + x]) { seg(x + 1, y + 1, x, y + 1); }
      if (x === 0 || !mask[y * n + x - 1]) { seg(x, y + 1, x, y); }
      if (x === n - 1 || !mask[y * n + x + 1]) { seg(x + 1, y, x + 1, y + 1); }
    }
  }
  var loops = [];
  for (var start in segs) {
    if (!segs.hasOwnProperty(start)) { continue; }
    while (segs[start] && segs[start].length) {
      var pts = [];
      var cur = start.split(",");
      cur = [parseInt(cur[0], 10), parseInt(cur[1], 10)];
      pts.push(cur);
      for (;;) {
        var outs = segs[cur[0] + "," + cur[1]];
        if (!outs || !outs.length) { break; }
        cur = outs.pop();
        pts.push(cur);
        if (cur[0] + "," + cur[1] === start) { break; }
      }
      if (pts.length > 3) { loops.push(pts); }
    }
  }
  return loops;
}

function photoMergeCollinear(pts) {
  var out = [];
  for (var i = 0; i < pts.length; i++) {
    var a = out[out.length - 2], b = out[out.length - 1], c = pts[i];
    if (a && b && (b[0] - a[0]) * (c[1] - a[1]) === (b[1] - a[1]) * (c[0] - a[0])) {
      out[out.length - 1] = c;
    } else { out.push(c); }
  }
  return out;
}

/* Douglas-Peucker on an open polyline */
function photoDp(pts, eps) {
  if (pts.length < 5) { return pts; }
  var keep = [];
  for (var z = 0; z < pts.length; z++) { keep.push(false); }
  keep[0] = keep[pts.length - 1] = true;
  var stack = [[0, pts.length - 1]];
  while (stack.length) {
    var span = stack.pop();
    var i0 = span[0], i1 = span[1];
    var ax = pts[i0][0], ay = pts[i0][1];
    var dx = pts[i1][0] - ax, dy = pts[i1][1] - ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var maxD = 0, maxI = -1;
    for (var i = i0 + 1; i < i1; i++) {
      var d = Math.abs(dx * (ay - pts[i][1]) - (ax - pts[i][0]) * dy) / len;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) { keep[maxI] = true; stack.push([i0, maxI], [maxI, i1]); }
  }
  var out = [];
  for (var j = 0; j < pts.length; j++) { if (keep[j]) { out.push(pts[j]); } }
  return out;
}

/* closed ring: split at the vertex farthest from p0 and DP each open half —
 * plain DP dies on rings because the first-to-last chord is a point */
function photoDpClosed(pts, eps) {
  if (pts.length < 5) { return pts; }
  var far = 1, maxD = -1;
  for (var i = 1; i < pts.length - 1; i++) {
    var dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1];
    var d = dx * dx + dy * dy;
    if (d > maxD) { maxD = d; far = i; }
  }
  var a = photoDp(pts.slice(0, far + 1), eps);
  var b = photoDp(pts.slice(far), eps);
  return a.concat(b.slice(1));
}

/* closed polygon -> midpoint-quadratic smooth path (curves through the
 * midpoint of every edge, each vertex becomes a control point) */
function photoSmoothPath(pts) {
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1]) {
    pts = pts.slice(0, -1);
  }
  var m = pts.length;
  if (m < 3) { return ""; }
  var d = "M" + N((pts[0][0] + pts[1][0]) / 2) + " " + N((pts[0][1] + pts[1][1]) / 2);
  for (var i = 1; i <= m; i++) {
    var p = pts[i % m], q = pts[(i + 1) % m];
    d += "Q" + N(p[0]) + " " + N(p[1]) + " " +
         N((p[0] + q[0]) / 2) + " " + N((p[1] + q[1]) / 2);
  }
  return d + "z";
}

/* absorb tiny color islands into their dominant neighbour — sensor noise
 * and AI paint texture otherwise trace into confetti rings that eat the
 * byte budget. Deterministic scan order; one pass. */
function photoDespeckle(cells, n, minSize) {
  var out = cells.slice();
  var seen = [];
  var i;
  for (i = 0; i < n * n; i++) { seen.push(false); }
  for (var start = 0; start < n * n; start++) {
    if (seen[start]) { continue; }
    var color = out[start];
    var comp = [start];
    var edge = {};
    seen[start] = true;
    for (var q = 0; q < comp.length; q++) {
      var c = comp[q];
      var x = c % n;
      var nb = [];
      if (x > 0) { nb.push(c - 1); }
      if (x < n - 1) { nb.push(c + 1); }
      if (c >= n) { nb.push(c - n); }
      if (c < n * (n - 1)) { nb.push(c + n); }
      for (var k = 0; k < nb.length; k++) {
        var m = nb[k];
        if (out[m] === color) {
          if (!seen[m]) { seen[m] = true; comp.push(m); }
        } else {
          edge[out[m]] = (edge[out[m]] || 0) + 1;
        }
      }
    }
    if (comp.length < minSize) {
      var best = -1, bestN = 0;
      for (var col in edge) {
        if (!edge.hasOwnProperty(col)) { continue; }
        if (edge[col] > bestN || (edge[col] === bestN && parseInt(col, 10) < best)) {
          best = parseInt(col, 10); bestN = edge[col];
        }
      }
      if (best >= 0) {
        for (var z = 0; z < comp.length; z++) { out[comp[z]] = best; }
      }
    }
  }
  return out;
}

/* |shoelace| area of a simplified ring, in cells² */
function photoRingArea(pts) {
  var a = 0;
  for (var i = 0; i < pts.length - 1; i++) {
    a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return Math.abs(a) / 2;
}

/* stacked curved regions: most-common color floods the frame, every other
 * color is traced, simplified (eps in cells) and drawn with a self-color
 * (or ink) stroke that swallows the seams between smoothed neighbours */
function photoTrace(model, G, eps, mode, outline, P) {
  var cells = photoSmooth(photoSmooth(photoResample(model.cells, model.cols, G), G), G);
  cells = photoDespeckle(cells, G, Math.max(6, I(G * G / 180)));
  var pal = photoPalette(model, mode, P);
  var counts = {};
  var i;
  for (i = 0; i < cells.length; i++) { counts[cells[i]] = (counts[cells[i]] || 0) + 1; }
  var order = [];
  for (var k2 in counts) { if (counts.hasOwnProperty(k2)) { order.push(parseInt(k2, 10)); } }
  order.sort(function (a, b) { return (counts[b] - counts[a]) || (a - b); });
  var s = "<rect width='" + G + "' height='" + G + "' fill='" + pal[order[0]] + "'/>";
  var ink = photoDarkest(pal);
  for (var o = 1; o < order.length; o++) {
    var ci = order[o];
    var mask = [];
    for (i = 0; i < cells.length; i++) { mask.push(cells[i] === ci ? 1 : 0); }
    var loops = photoTraceLoops(mask, G);
    var d = "";
    for (var L = 0; L < loops.length; L++) {
      var ring = photoDpClosed(photoMergeCollinear(loops[L]), eps);
      if (ring.length < 4 || photoRingArea(ring) < 2.2) { continue; }
      d += photoSmoothPath(ring);
    }
    if (d) {
      s += "<path fill='" + pal[ci] + "' stroke='" +
           (outline === "Ink" ? ink : pal[ci]) + "' stroke-width='" +
           (outline === "Ink" ? N(G / 64) : 0.7) +
           "' stroke-linejoin='round' fill-rule='evenodd' d='" + d + "'/>";
    }
  }
  return s;
}

/* seeded placeholder bust — drawn before any photo is loaded (and swept by
 * the tests): backdrop bands, head, shoulders, eyes, a glow highlight */
function photoPlaceholder(seed, key, salt, P) {
  var rng = artDrawRng(seed, key, "ph", salt);
  var n = 48;
  var pal = [P.bg1, P.bg0, P.body, P.body2, P.ink, P.glow];
  var cx = 24 + artRange(rng, -2.5, 2.5);
  var cy = 17 + artRange(rng, -1.5, 1.5);
  var rx = artRange(rng, 7.5, 9.5);
  var ry = artRange(rng, 8.5, 10.5);
  var sh = cy + ry + artRange(rng, 3, 6);   // shoulder line, just under the chin
  var band = artRange(rng, 0.45, 0.62);
  var cells = [];
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      var v = y < n * band ? 1 : 0;
      if (y > sh + Math.abs(x - cx) * 0.28) { v = 3; }               // torso
      if (Math.abs(x - cx) < 2.6 && y > cy && y <= sh + 2) { v = 2; } // neck
      var hd = ((x - cx) * (x - cx)) / (rx * rx) +
               ((y - cy) * (y - cy)) / (ry * ry);
      if (hd < 1) {
        v = 2;                                                       // face
        if (y < cy - ry * 0.15 && hd > 0.42) { v = 4; }              // hair cap
        else if (hd > 0.66 && x > cx) { v = 3; }                     // side shade
      }
      if (rng() < 0.05 && v === 1) { v = 0; }
      cells.push(v);
    }
  }
  /* 3x2 eyes + a 3x3 glow pin — sized to survive the 3x3 majority filter */
  var ey = I(cy), dx2, dy2;
  for (dy2 = 0; dy2 < 2; dy2++) {
    for (dx2 = 0; dx2 < 3; dx2++) {
      cells[(ey + dy2) * n + I(cx - 4) + dx2] = 4;
      cells[(ey + dy2) * n + I(cx + 2) + dx2] = 4;
    }
  }
  for (dy2 = 0; dy2 < 3; dy2++) {
    for (dx2 = 0; dx2 < 3; dx2++) {
      cells[(I(sh) + 4 + dy2) * n + I(cx - 1) + dx2] = 5;
    }
  }
  return { cols: n, rows: n, cells: cells, palette: pal };
}

/* byte valve: photos are unpredictable — if a draw comes out too heavy for
 * the 16000 b64 budget, redraw at the next-coarser resolution
 * (deterministic; the coarsest rung always fits). Smooth traces at 2x the
 * Detail setting (96/80/64) — contours earn their bytes back in curves. */
function photoCompose(seed, salt, key, chosen, P) {
  var model = ART_PHOTO_SRC || photoPlaceholder(seed, key, salt, P);
  var bgKey = chosen.background === "Wash" ? "Wash" :
              chosen.background === "Grid" ? "Grid" : "Plain";
  var s = ART_BG[bgKey](artDrawRng(seed, key, "bg", salt), P);
  /* Painted finish: the AI painting itself, as a jpeg riding inside the
   * SVG — the only finish that IS what the model painted. Captured at
   * intake within a byte budget that keeps the whole plate under 16000
   * b64; with no photo loaded there is no paint, so fall through to the
   * vector finishes (placeholder, tests, thumbnails). */
  if (chosen.finish === "Painted" && model.paint) {
    return s + "<image x='40' y='40' width='432' height='432' " +
      "xlink:href='data:image/jpeg;base64," + model.paint + "'/>" +
      "<g transform='translate(40 40) scale(9)'>" +
      photoOverlay(chosen.overlay, 48, P) + "</g>";
  }
  var want = parseInt(chosen.grid, 10) || 48;
  var pixel = chosen.render === "Pixel";
  /* smooth rungs escalate the simplification eps as they coarsen, so the
   * floor rung is guaranteed to fit even for a busy photograph */
  var opts = pixel ? [[48, 0], [40, 0], [32, 0], [24, 0]]
                   : [[96, 1.1], [80, 1.25], [64, 1.45], [48, 1.7],
                      [40, 2.2], [32, 2.8]];
  if (!pixel) { want = want * 2; }
  var body = "";
  var G = want;
  for (var i = 0; i < opts.length; i++) {
    if (opts[i][0] > want) { continue; }
    G = opts[i][0];
    body = pixel ? photoDrawGrid(model, G, chosen.mode, chosen.outline, P)
                 : photoTrace(model, G, opts[i][1], chosen.mode, chosen.outline, P);
    if (body.length <= 11200) { break; }
  }
  return s + "<g transform='translate(40 40) scale(" + N(432 / G) + ")'" +
    (pixel ? " shape-rendering='crispEdges'" : "") + ">" + body +
    photoOverlay(chosen.overlay, G, P) + "</g>";
}

/* ======================================================================
 * registry + composer
 * ====================================================================== */

var ART_STYLES = {
  mandala: { label: "Mandala", palettes: null, slots: mandalaSlots, compose: mandalaCompose },
  geo:     { label: "Geometry", palettes: null, slots: geoSlots, compose: geoCompose },
  pixel:   { label: "Pixel", palettes: null, slots: pixelSlots, compose: pixelCompose },
  phyllo:  { label: "Phyllotaxis", palettes: null, slots: phylloSlots, compose: phylloCompose },
  curves:  { label: "Math Curves", palettes: null, slots: curvesSlots, compose: curvesCompose },
  truchet: { label: "Truchet", palettes: null, slots: truchetSlots, compose: truchetCompose },
  mondrian: { label: "Mondrian", palettes: MONDRIAN_PALETTES, slots: mondrianSlots, compose: mondrianCompose },
  miro:    { label: "Miro", palettes: MIRO_PALETTES, slots: miroSlots, compose: miroCompose },
  kandinsky: { label: "Kandinsky", palettes: KANDINSKY_PALETTES, slots: kandinskySlots, compose: kandinskyCompose },
  matisse: { label: "Matisse", palettes: MATISSE_PALETTES, slots: matisseSlots, compose: matisseCompose },
  escher:  { label: "Escher", palettes: null, slots: escherSlots, compose: escherCompose },
  opart:   { label: "Op-Art", palettes: OPART_PALETTES, slots: opartSlots, compose: opartCompose },
  picasso: { label: "Picasso", palettes: PICASSO_PALETTES, slots: picassoSlots, compose: picassoCompose },
  magritte: { label: "Magritte", palettes: MAGRITTE_PALETTES, slots: magritteSlots, compose: magritteCompose },
  seurat:  { label: "Seurat", palettes: SEURAT_PALETTES, slots: seuratSlots, compose: seuratCompose },
  punks:   { label: "Punks", palettes: PUNKS_PALETTES, slots: punksSlots, compose: punksCompose },
  minipunks: { label: "Minima Punks", palettes: MINIPUNK_PALETTES, slots: minipunksSlots, compose: minipunksCompose },
  pandas:  { label: "Panda Punks", palettes: PANDA_PALETTES, slots: pandasSlots, compose: pandasCompose },
  photo:   { label: "Photo Cartoon", palettes: null, slots: photoSlots, compose: photoCompose }
};

function artDefaultConfig(styleKey) {
  if (!styleKey) { styleKey = "mandala"; }
  var pack = ART_STYLES[styleKey];
  var slots = [{ key: "palette", label: "Palette",
                 variants: paletteVariants(pack.palettes || ART_PALETTES) }];
  var extra = pack.slots();
  for (var i = 0; i < extra.length; i++) { slots.push(extra[i]); }
  return { style: styleKey, slots: slots };
}

/* saved configs age: packs gain/lose slots between releases (a pre-4.1.6
 * photo config has no Render slot, so the choice never shows). Rebuild on
 * the CURRENT slot set, carrying the user's on/weight edits across for
 * every slot+variant that still exists. */
function artMigrateConfig(cfg) {
  if (!cfg || !cfg.style || !ART_STYLES[cfg.style]) { return cfg; }
  var fresh = artDefaultConfig(cfg.style);
  var old = {};
  var i, j;
  for (i = 0; i < (cfg.slots || []).length; i++) {
    var os = cfg.slots[i];
    for (j = 0; j < (os.variants || []).length; j++) {
      old[os.key + "|" + os.variants[j].name] = os.variants[j];
    }
  }
  for (i = 0; i < fresh.slots.length; i++) {
    var vs = fresh.slots[i].variants;
    for (j = 0; j < vs.length; j++) {
      var saved = old[fresh.slots[i].key + "|" + vs[j].name];
      if (saved) {
        if (saved.on === false) { vs[j].on = false; }
        if (typeof saved.weight === "number") { vs[j].weight = saved.weight; }
      }
    }
  }
  return fresh;
}

/* how many distinct trait combinations the enabled config allows */
function artCapacity(cfg) {
  var cap = 1;
  for (var i = 0; i < cfg.slots.length; i++) {
    var n = 0;
    var vs = cfg.slots[i].variants;
    for (var j = 0; j < vs.length; j++) {
      if (vs[j].on !== false && vs[j].weight > 0) { n++; }
    }
    cap *= Math.max(n, 1);
  }
  return cap;
}

/* one item: pick a variant per slot (weighted), dispatch to the pack */
function artGenerate(collectionSeed, salt, cfg) {
  var styleKey = cfg.style || "mandala";
  var pack = ART_STYLES[styleKey];
  if (!pack) { return null; }
  var traits = [];
  var chosen = {};
  var score = 0;
  for (var i = 0; i < cfg.slots.length; i++) {
    var slot = cfg.slots[i];
    var pickRng = artRng(collectionSeed + "|" + styleKey + "|pick|" +
                         slot.key + "|" + salt);
    var res = artPickWeighted(pickRng, slot.variants);
    if (!res) { return null; }
    chosen[slot.key] = res.variant.name;
    score += -Math.log(res.p) / Math.LN2;
    traits.push({ slot: slot.key, label: slot.label, value: res.variant.name,
                  pct: Math.round(res.p * 1000) / 10 });
  }

  var P = artPaletteByName(chosen.palette, pack.palettes || ART_PALETTES);
  var g = pack.compose(collectionSeed, salt, styleKey, chosen, P);

  var svg = "<svg xmlns='http://www.w3.org/2000/svg' " +
            "xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 512 512'>" +
            g + "</svg>";
  var key = [];
  for (var t = 0; t < traits.length; t++) { key.push(traits[t].value); }
  return { svg: svg, traits: traits, key: key.join("/"),
           score: Math.round(score * 10) / 10, bytes: svg.length, salt: salt };
}

/* full collection: n items, unique by trait combination. Re-salts on
 * collision; gives up on an item after maxTries so a too-small trait space
 * fails loudly instead of looping forever. */
function artCollection(collectionSeed, n, cfg, maxTries) {
  if (!maxTries) { maxTries = 40; }
  var items = [];
  var seen = {};
  for (var i = 1; i <= n; i++) {
    var item = null;
    for (var t = 0; t < maxTries; t++) {
      var salt = i + (t > 0 ? "r" + t : "");
      var cand = artGenerate(collectionSeed, "" + salt, cfg);
      if (!cand) { return { items: items, error: "a slot has no enabled variants" }; }
      if (!seen[cand.key]) { item = cand; break; }
    }
    if (!item) {
      return { items: items,
               error: "could not find a unique combo for item #" + i +
                      " - enable more variants or shrink the collection" };
    }
    seen[item.key] = true;
    item.idx = i;
    items.push(item);
  }
  return { items: items, error: null };
}

/* node-side tests need these on module.exports; the page just uses globals */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    artSeed: artSeed, artRng: artRng, artPickWeighted: artPickWeighted,
    artDefaultConfig: artDefaultConfig, artCapacity: artCapacity,
    artMigrateConfig: artMigrateConfig,
    artGenerate: artGenerate, artCollection: artCollection,
    artSetPhoto: artSetPhoto,
    ART_PALETTES: ART_PALETTES, ART_STYLES: ART_STYLES
  };
}
