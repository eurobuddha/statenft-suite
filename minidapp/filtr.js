/* FILTR — the image editor tab: import, edit (crop/rotate/flip/erase/resize),
 * stylize with the complete filtr engine (filtr-engine.js, WebGL2), annotate
 * with comic bubbles + text, save (download / send to NFT mint / send to the
 * Photo Cartoon pack). ES5 house style; the engine bundle is modern JS.
 * Loaded after app.js + art-studio.js: reuses $, toast, show, downloadBlob,
 * compressImage-style ladders, NFT_ART handoff, artPhotoIntake. */

/* ---------- state ---------- */

var FILTR = {
  booted: false,
  rendered: false,
  engine: null,
  settings: null,
  src: null,        // working canvas (<= 2048 long edge) — what the GL sees
  full: null,       // full-res canvas (<= 4096) — exports + bakes
  name: "",
  ann: [],          // annotations [{type,text,x,y,size,font,fill,ink,tail}]
  sel: -1,          // selected annotation index
  hist: [], fut: [],
  tool: "",
  crop: null,       // {x,y,w,h} in working-image coords
  cropRatio: 0,     // 0 = free
  brush: 24, soft: true,
  zoom: 1, panX: 0, panY: 0, fitted: true,
  ab: false,
  animId: 0
};

var FILTR_MAX_WORK = 2048;
var FILTR_MAX_FULL = 4096;
var FILTR_PREVIEW_DIM = 1280;
var FILTR_HIST_MAX = 15;

/* ---------- effect control schema (mirrors the engine's settings tree) ---------- */

var FILTR_FX = [
  { id: "none", label: "None (edit only)", c: [] },
  { id: "halftone", label: "Halftone", c: [
    { k: "shape", t: "seg", o: ["circle", "square", "diamond", "line"] },
    { k: "spacing", t: "r", mi: 1, ma: 20, st: 1 },
    { k: "dotScale", t: "r", mi: 0.5, ma: 2, st: 0.05 },
    { k: "angle", t: "r", mi: 0, ma: 90, st: 5 },
    { k: "invert", t: "b" },
    { k: "colorMode", t: "seg", o: ["bw", "color"] },
    { k: "fgColor", t: "col" }, { k: "bgColor", t: "col" } ] },
  { id: "dithering", label: "Dithering", c: [
    { k: "method", t: "sel", o: ["floydSteinberg", "atkinson", "jarvisJudiceNinke",
      "stucki", "burkes", "sierra", "sierraTwoRow", "sierraLite", "bayer2x2",
      "bayer4x4", "bayer8x8", "bayer16x16", "clusteredDot", "blueNoise",
      "interleavedGradient"] },
    { k: "intensity", t: "r", mi: 0.1, ma: 2, st: 0.05 },
    { k: "gamma", t: "r", mi: 0.5, ma: 2, st: 0.05 },
    { k: "colorMode", t: "sel", o: ["mono", "tonal", "indexed", "rgb", "original"] },
    { k: "colorLevels", t: "r", mi: 2, ma: 32, st: 1 },
    { k: "palette", t: "sel", o: ["grayscale", "gameboy", "amber", "green",
      "c64", "newspaper", "riso", "cyberpunk", "sepia"] },
    { k: "paletteSize", t: "r", mi: 2, ma: 8, st: 1 },
    { k: "foregroundColor", t: "col" }, { k: "backgroundColor", t: "col" } ] },
  { id: "ascii", label: "ASCII", c: [
    { k: "scale", t: "r", mi: 1, ma: 20, st: 1 },
    { k: "spacing", t: "r", mi: 0, ma: 1, st: 0.05 },
    { k: "set", t: "sel", o: ["standard", "blocks", "binary", "detailed",
      "minimal", "alphabetic", "numeric", "math", "symbols"] },
    { k: "colorMode", t: "seg", o: ["mono", "original"] },
    { k: "custom", t: "col", lb: "char" }, { k: "backgroundColor", t: "col", lb: "bg" },
    { k: "intensity", t: "r", mi: 0, ma: 2, st: 0.05 },
    { k: "brightnessMapping", t: "r", mi: 0.1, ma: 2, st: 0.05, lb: "b-map" },
    { k: "invert", t: "b" } ] },
  { id: "pixelSort", label: "Pixel Sort", c: [
    { k: "direction", t: "seg", o: ["horizontal", "vertical", "diagonal"] },
    { k: "mode", t: "seg", o: ["brightness", "hue", "saturation"] },
    { k: "threshold", t: "r", mi: 0, ma: 0.5, st: 0.01 },
    { k: "streakLength", t: "r", mi: 10, ma: 300, st: 5 },
    { k: "intensity", t: "r", mi: 0, ma: 1, st: 0.02 },
    { k: "reverse", t: "b" } ] },
  { id: "edgeDetection", label: "Edge Detect", c: [
    { k: "algorithm", t: "seg", o: ["sobel", "prewitt", "laplacian"] },
    { k: "threshold", t: "r", mi: 0.1, ma: 0.8, st: 0.02 },
    { k: "lineWidth", t: "r", mi: 0.5, ma: 4, st: 0.1 },
    { k: "invert", t: "b" },
    { k: "colorMode", t: "seg", o: ["custom", "original"] },
    { k: "edgeColor", t: "col" }, { k: "bgColor", t: "col" } ] },
  { id: "contour", label: "Contour", c: [
    { k: "fillMode", t: "seg", o: ["filled", "lines"] },
    { k: "levels", t: "r", mi: 3, ma: 20, st: 1 },
    { k: "lineThickness", t: "r", mi: 0.5, ma: 3, st: 0.1 },
    { k: "invert", t: "b" },
    { k: "colorMode", t: "seg", o: ["custom", "original"] },
    { k: "lineColor", t: "col" }, { k: "bgColor", t: "col" } ] },
  { id: "crosshatch", label: "Crosshatch", c: [
    { k: "density", t: "r", mi: 2, ma: 12, st: 0.5 },
    { k: "layers", t: "r", mi: 1, ma: 4, st: 1 },
    { k: "angle", t: "r", mi: 0, ma: 90, st: 5 },
    { k: "lineWidth", t: "r", mi: 0.5, ma: 3, st: 0.1 },
    { k: "randomness", t: "r", mi: 0, ma: 1, st: 0.05 },
    { k: "invert", t: "b" },
    { k: "fgColor", t: "col" }, { k: "bgColor", t: "col" } ] },
  { id: "blockify", label: "Blockify", c: [
    { k: "style", t: "seg", o: ["full", "shaded", "outline"] },
    { k: "blockSize", t: "r", mi: 4, ma: 20, st: 1 },
    { k: "borderWidth", t: "r", mi: 0, ma: 3, st: 0.5 },
    { k: "borderColor", t: "col" },
    { k: "colorMode", t: "seg", o: ["color", "grayscale"] } ] },
  { id: "dots", label: "Dots", c: [
    { k: "shape", t: "seg", o: ["circle", "square", "diamond"] },
    { k: "gridType", t: "seg", o: ["square", "hex"] },
    { k: "sizeMultiplier", t: "r", mi: 0.5, ma: 2, st: 0.05 },
    { k: "spacing", t: "r", mi: 0.5, ma: 2, st: 0.05 },
    { k: "invert", t: "b" },
    { k: "colorMode", t: "seg", o: ["custom", "original"] },
    { k: "fgColor", t: "col" }, { k: "bgColor", t: "col" } ] },
  { id: "threshold", label: "Threshold", c: [
    { k: "levels", t: "r", mi: 2, ma: 8, st: 1 },
    { k: "thresholdPoint", t: "r", mi: 0.1, ma: 0.9, st: 0.02 },
    { k: "dither", t: "b" },
    { k: "invert", t: "b" },
    { k: "colorMode", t: "seg", o: ["custom", "color"] },
    { k: "fgColor", t: "col" }, { k: "bgColor", t: "col" } ] },
  { id: "waveLines", label: "Wave Lines", c: [
    { k: "lineCount", t: "r", mi: 10, ma: 150, st: 2 },
    { k: "amplitude", t: "r", mi: 5, ma: 50, st: 1 },
    { k: "frequency", t: "r", mi: 0.5, ma: 3, st: 0.1 },
    { k: "lineThickness", t: "r", mi: 0.5, ma: 3, st: 0.1 },
    { k: "direction", t: "seg", o: ["horizontal", "vertical"] },
    { k: "colorMode", t: "seg", o: ["custom", "original"] },
    { k: "fgColor", t: "col" }, { k: "bgColor", t: "col" } ] },
  { id: "voronoi", label: "Voronoi", c: [
    { k: "cellSize", t: "r", mi: 10, ma: 100, st: 2 },
    { k: "edgeWidth", t: "r", mi: 0, ma: 1, st: 0.05 },
    { k: "edgeColor", t: "seg", o: [0, 1, 2], lo: ["black", "white", "dark"] },
    { k: "colorMode", t: "seg", o: [0, 1, 2], lo: ["avg", "centre", "grad"] },
    { k: "randomize", t: "r", mi: 0, ma: 1, st: 0.05 } ] },
  { id: "noiseField", label: "Noise Field", c: [
    { k: "noiseType", t: "seg", o: ["perlin", "simplex", "worley"] },
    { k: "scale", t: "r", mi: 10, ma: 100, st: 2 },
    { k: "intensity", t: "r", mi: 0.5, ma: 3, st: 0.1 },
    { k: "octaves", t: "r", mi: 1, ma: 8, st: 1 },
    { k: "speed", t: "r", mi: 0.1, ma: 3, st: 0.1 },
    { k: "animate", t: "b" },
    { k: "distortOnly", t: "b" } ] },
  { id: "matrixRain", label: "Matrix Rain", c: [
    { k: "characterSet", t: "sel", o: ["standard", "blocks", "binary", "detailed",
      "minimal", "alphabetic", "numeric", "math", "symbols"] },
    { k: "cellSize", t: "r", mi: 4, ma: 32, st: 1 },
    { k: "speed", t: "r", mi: 0.5, ma: 3, st: 0.1 },
    { k: "trailLength", t: "r", mi: 5, ma: 30, st: 1 },
    { k: "direction", t: "seg", o: ["down", "up", "left", "right"] },
    { k: "glowIntensity", t: "r", mi: 0, ma: 2, st: 0.1 },
    { k: "bgOpacity", t: "r", mi: 0, ma: 1, st: 0.05 },
    { k: "threshold", t: "r", mi: 0, ma: 0.5, st: 0.02 },
    { k: "rainColor", t: "col" } ] },
  { id: "vhs", label: "VHS", c: [
    { k: "distortion", t: "r", mi: 0, ma: 1, st: 0.05 },
    { k: "noise", t: "r", mi: 0, ma: 1, st: 0.05 },
    { k: "colorBleed", t: "r", mi: 0, ma: 1, st: 0.05 },
    { k: "scanlines", t: "r", mi: 0, ma: 1, st: 0.05 },
    { k: "trackingError", t: "r", mi: 0, ma: 1, st: 0.05 } ] }
];

var FILTR_ADJUST = [
  { k: "brightness", mi: -100, ma: 100, st: 1 },
  { k: "contrast", mi: -100, ma: 100, st: 1 },
  { k: "saturation", mi: -100, ma: 100, st: 1 },
  { k: "hue", mi: 0, ma: 360, st: 1 },
  { k: "gamma", mi: 0.1, ma: 3, st: 0.1 },
  { k: "sharpness", mi: 0, ma: 100, st: 1 },
  { k: "blur", mi: 0, ma: 10, st: 0.5 },
  { k: "edge", mi: 0, ma: 100, st: 1 },
  { k: "quantize", mi: 0, ma: 32, st: 1 }
];

var FILTR_POST = [
  { id: "grain", c: [ { k: "intensity", mi: 0, ma: 200, st: 5 },
    { k: "size", mi: 1, ma: 10, st: 0.5 }, { k: "speed", mi: 0, ma: 200, st: 5 } ] },
  { id: "vignette", c: [ { k: "intensity", mi: 0, ma: 1, st: 0.05 },
    { k: "radius", mi: 0, ma: 1, st: 0.05 } ] },
  { id: "scanlines", c: [ { k: "opacity", mi: 0, ma: 1, st: 0.05 },
    { k: "spacing", mi: 1, ma: 20, st: 1 } ] },
  { id: "bloom", c: [ { k: "threshold", mi: 0, ma: 1, st: 0.05 },
    { k: "intensity", mi: 0, ma: 2, st: 0.1 }, { k: "radius", mi: 1, ma: 20, st: 1 } ] },
  { id: "chromatic", c: [ { k: "offset", mi: 0, ma: 50, st: 1 } ] },
  { id: "crtCurve", c: [ { k: "amount", mi: 0, ma: 0.5, st: 0.02 } ] },
  { id: "phosphor", c: [] }
];

/* ---------- boot / enter ---------- */

function filtrEnter() {
  if (!FILTR.booted) {
    FILTR.booted = true;
    if (typeof FiltrEngine === "undefined" || !FiltrEngine.supported()) {
      $("filtr-unsupported").classList.remove("hidden");
      $("filtr-layout").classList.add("hidden");
      return;
    }
    try {
      FILTR.engine = new FiltrEngine.Renderer($("filtr-canvas"));
    } catch (e) {
      $("filtr-unsupported").classList.remove("hidden");
      $("filtr-layout").classList.add("hidden");
      return;
    }
    FILTR.settings = FiltrEngine.freshSettings();
    FILTR.settings.output.maxPreviewDim = FILTR_PREVIEW_DIM;
    FILTR.settings.output.background = "#00000000";
    filtrBuildFxList();
    filtrBuildPresets();
    filtrBuildAdjust();
    filtrBuildPost();
    filtrPush();
    FiltrEngine.setSettings(FILTR.settings);
    FILTR.engine.start();
  }
  if (FILTR.engine) { filtrFit(); }
}

function filtrLeave() {
  /* keep the loop — it idles when nothing is dirty; but drop tool captures */
  filtrSetTool("");
}

function filtrTouch() {
  if (FILTR.engine) { FiltrEngine.setSettings(FILTR.settings); }
}

/* ---------- import ---------- */

function filtrLoadFile(f) {
  if (!f) { return; }
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () { filtrLoadImage(img, f.name || "image"); };
    img.onerror = function () { toast("could not load that image"); };
    img.src = reader.result;
  };
  reader.readAsDataURL(f);
}

function filtrScaled(img, maxDim) {
  var k = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  var cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(img.width * k));
  cv.height = Math.max(1, Math.round(img.height * k));
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}

function filtrLoadImage(img, name) {
  FILTR.full = filtrScaled(img, FILTR_MAX_FULL);
  FILTR.src = filtrScaled(FILTR.full, FILTR_MAX_WORK);
  FILTR.name = name;
  FILTR.ann = [];
  FILTR.sel = -1;
  FILTR.crop = null;
  filtrSetTool("");
  var stg = $("filtr-stage");
  if (stg) { stg.classList.remove("filtr-empty"); }  // hide the tap-to-import hint
  FILTR.engine.source.setImage(FILTR.src, name);
  filtrMeta();
  filtrPush();
  filtrTouch();
  filtrFit();
  filtrDrawAnn();
}

function filtrMeta() {
  $("filtr-meta").innerText = FILTR.full
    ? FILTR.name + " · " + FILTR.full.width + "×" + FILTR.full.height +
      (FILTR.src.width !== FILTR.full.width
        ? " · editing at " + FILTR.src.width + "px" : "")
    : "no image loaded";
}

/* ---------- history (structural ops only; sliders don't spam it) ---------- */

function filtrSnap() {
  return {
    src: FILTR.src ? FILTR.src.toDataURL("image/png") : null,
    full: FILTR.full ? FILTR.full.toDataURL("image/png") : null,
    ann: JSON.parse(JSON.stringify(FILTR.ann)),
    settings: JSON.parse(JSON.stringify(FILTR.settings))
  };
}

function filtrPush() {
  FILTR.hist.push(filtrSnap());
  if (FILTR.hist.length > FILTR_HIST_MAX) { FILTR.hist.shift(); }
  FILTR.fut = [];
  filtrHistButtons();
}

function filtrRestore(snap, cb) {
  var todo = 0;
  function loaded() { todo--; if (todo === 0 && cb) { cb(); } }
  FILTR.ann = JSON.parse(JSON.stringify(snap.ann));
  FILTR.sel = -1;
  FILTR.settings = JSON.parse(JSON.stringify(snap.settings));
  function put(url, key) {
    if (!url) { FILTR[key] = null; return; }
    todo++;
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      cv.getContext("2d").drawImage(img, 0, 0);
      FILTR[key] = cv;
      loaded();
    };
    img.src = url;
  }
  put(snap.src, "src");
  put(snap.full, "full");
  if (todo === 0 && cb) { cb(); }
}

function filtrAfterRestore() {
  if (FILTR.src) { FILTR.engine.source.setImage(FILTR.src, FILTR.name); }
  filtrMeta();
  filtrSyncPanels();
  filtrTouch();
  filtrFit();
  filtrDrawAnn();
  filtrHistButtons();
}

function filtrUndo() {
  if (FILTR.hist.length < 2) { return; }
  FILTR.fut.push(FILTR.hist.pop());
  filtrRestore(FILTR.hist[FILTR.hist.length - 1], filtrAfterRestore);
}

function filtrRedo() {
  if (!FILTR.fut.length) { return; }
  var snap = FILTR.fut.pop();
  FILTR.hist.push(snap);
  filtrRestore(snap, filtrAfterRestore);
}

function filtrHistButtons() {
  $("filtr-undo").disabled = FILTR.hist.length < 2;
  $("filtr-redo").disabled = !FILTR.fut.length;
}

/* ---------- view: zoom / pan / fit ---------- */

function filtrFit() {
  var stage = $("filtr-stage");
  var cv = $("filtr-canvas");
  if (!cv.width) { return; }
  var pad = 20;
  var z = Math.min((stage.clientWidth - pad) / cv.width,
                   (stage.clientHeight - pad) / cv.height);
  FILTR.zoom = Math.max(0.05, Math.min(z, 4));
  FILTR.panX = (stage.clientWidth - cv.width * FILTR.zoom) / 2;
  FILTR.panY = (stage.clientHeight - cv.height * FILTR.zoom) / 2;
  FILTR.fitted = true;
  filtrView();
}

function filtrView() {
  $("filtr-zoomwrap").style.transform = "translate(" + FILTR.panX + "px," +
    FILTR.panY + "px) scale(" + FILTR.zoom + ")";
  $("filtr-zoominfo").innerText = "zoom " + Math.round(FILTR.zoom * 100) + "%" +
    (FILTR.fitted ? " · fit" : "");
  filtrDrawAnn();
  filtrDrawCrop();
}

/* screen point -> working-image coords */
function filtrToImg(ev) {
  var r = $("filtr-stage").getBoundingClientRect();
  var cx = (ev.clientX - r.left - FILTR.panX) / FILTR.zoom;
  var cy = (ev.clientY - r.top - FILTR.panY) / FILTR.zoom;
  var cv = $("filtr-canvas");
  var fx = FILTR.src ? FILTR.src.width / cv.width : 1;
  var fy = FILTR.src ? FILTR.src.height / cv.height : 1;
  return { x: cx * fx, y: cy * fy, cx: cx, cy: cy };
}

/* ---------- tools ---------- */

var FILTR_TOOLS = ["crop", "erase", "bubble", "text"];

function filtrSetTool(tool) {
  FILTR.tool = FILTR.tool === tool ? "" : tool;
  for (var i = 0; i < FILTR_TOOLS.length; i++) {
    $("filtr-tool-" + FILTR_TOOLS[i]).classList
      .toggle("on", FILTR.tool === FILTR_TOOLS[i]);
  }
  if (FILTR.tool !== "crop") { FILTR.crop = null; }
  filtrToolOpts();
  filtrDrawCrop();
}

function filtrToolOpts() {
  var host = $("filtr-toolopts");
  host.innerHTML = "";
  function btn(label, on, fn) {
    var b = document.createElement("button");
    b.className = "filtr-tool" + (on ? " on" : "");
    b.innerText = label;
    b.onclick = fn;
    host.appendChild(b);
    return b;
  }
  function note(t) {
    var s = document.createElement("span");
    s.className = "filtr-note";
    s.innerText = t;
    host.appendChild(s);
  }
  if (FILTR.tool === "crop") {
    note("drag on the image, then");
    btn("Apply crop", false, filtrApplyCrop);
    note("ratio:");
    var ratios = [[0, "Free"], [1, "1:1"], [4 / 5, "4:5"], [16 / 10, "16:10"]];
    for (var i = 0; i < ratios.length; i++) {
      (function (rv, lb) {
        btn(lb, FILTR.cropRatio === rv, function () {
          FILTR.cropRatio = rv;
          if (FILTR.crop && rv) {
            FILTR.crop.h = FILTR.crop.w / rv;
            filtrClampCrop();
          }
          filtrToolOpts(); filtrDrawCrop();
        });
      })(ratios[i][0], ratios[i][1]);
    }
  } else if (FILTR.tool === "erase") {
    note("paint to erase · brush " + FILTR.brush + "px");
    var r = document.createElement("input");
    r.type = "range"; r.min = 4; r.max = 120; r.step = 2; r.value = FILTR.brush;
    r.className = "filtr-brushrange";
    r.oninput = function () { FILTR.brush = parseInt(r.value, 10); filtrToolOpts(); };
    host.appendChild(r);
    btn(FILTR.soft ? "Soft" : "Hard", true, function () {
      FILTR.soft = !FILTR.soft; filtrToolOpts();
    });
  } else if (FILTR.tool === "bubble") {
    note("tap the image to place a bubble");
  } else if (FILTR.tool === "text") {
    note("tap the image to place text");
  } else {
    note("pan: drag · zoom: wheel / pinch");
  }
}

/* geometry: rotate / flip / resize (src + full together) */

function filtrMapBoth(fn) {
  if (!FILTR.src) { return; }
  FILTR.src = fn(FILTR.src);
  FILTR.full = fn(FILTR.full);
  FILTR.engine.source.setImage(FILTR.src, FILTR.name);
  filtrMeta();
  filtrPush();
  filtrTouch();
  filtrFit();
}

function filtrRotate(cw) {
  filtrMapBoth(function (cv) {
    var out = document.createElement("canvas");
    out.width = cv.height; out.height = cv.width;
    var c = out.getContext("2d");
    c.translate(out.width / 2, out.height / 2);
    c.rotate((cw ? 90 : -90) * Math.PI / 180);
    c.drawImage(cv, -cv.width / 2, -cv.height / 2);
    return out;
  });
}

function filtrFlip(h) {
  filtrMapBoth(function (cv) {
    var out = document.createElement("canvas");
    out.width = cv.width; out.height = cv.height;
    var c = out.getContext("2d");
    c.translate(h ? cv.width : 0, h ? 0 : cv.height);
    c.scale(h ? -1 : 1, h ? 1 : -1);
    c.drawImage(cv, 0, 0);
    return out;
  });
}

function filtrResizePrompt() {
  var cur = FILTR.full ? Math.max(FILTR.full.width, FILTR.full.height) : 0;
  if (!cur) { return; }
  var v = prompt("New long-edge size in px (64–" + FILTR_MAX_FULL + "):", "" + cur);
  var n = parseInt(v, 10);
  if (!n || n < 64 || n > FILTR_MAX_FULL) { return; }
  filtrMapBoth(function (cv) {
    var k = n / Math.max(FILTR.full.width, FILTR.full.height);
    /* both canvases resize toward the same target long edge */
    var kk = n / Math.max(cv.width, cv.height);
    var out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cv.width * Math.min(1, kk)));
    out.height = Math.max(1, Math.round(cv.height * Math.min(1, kk)));
    out.getContext("2d").drawImage(cv, 0, 0, out.width, out.height);
    return out;
  });
}

/* crop */

function filtrClampCrop() {
  var c = FILTR.crop;
  if (!c || !FILTR.src) { return; }
  c.w = Math.max(16, Math.min(c.w, FILTR.src.width));
  c.h = Math.max(16, Math.min(c.h, FILTR.src.height));
  c.x = Math.max(0, Math.min(c.x, FILTR.src.width - c.w));
  c.y = Math.max(0, Math.min(c.y, FILTR.src.height - c.h));
}

function filtrDrawCrop() {
  var el = $("filtr-cropbox");
  if (!FILTR.crop || FILTR.tool !== "crop") { el.classList.add("hidden"); return; }
  var cv = $("filtr-canvas");
  var f = cv.width / FILTR.src.width;
  el.classList.remove("hidden");
  el.style.left = (FILTR.crop.x * f) + "px";
  el.style.top = (FILTR.crop.y * f) + "px";
  el.style.width = (FILTR.crop.w * f) + "px";
  el.style.height = (FILTR.crop.h * f) + "px";
  el.setAttribute("data-size",
    Math.round(FILTR.crop.w * (FILTR.full.width / FILTR.src.width)) + "×" +
    Math.round(FILTR.crop.h * (FILTR.full.height / FILTR.src.height)));
}

function filtrApplyCrop() {
  var c = FILTR.crop;
  if (!c || !FILTR.src) { return; }
  var kf = FILTR.full.width / FILTR.src.width;
  FILTR.full = filtrCropCanvas(FILTR.full, c.x * kf, c.y * kf, c.w * kf, c.h * kf);
  FILTR.src = filtrCropCanvas(FILTR.src, c.x, c.y, c.w, c.h);
  FILTR.crop = null;
  filtrSetTool("");
  FILTR.engine.source.setImage(FILTR.src, FILTR.name);
  filtrMeta();
  filtrPush();
  filtrTouch();
  filtrFit();
}

function filtrCropCanvas(cv, x, y, w, h) {
  var out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w));
  out.height = Math.max(1, Math.round(h));
  out.getContext("2d").drawImage(cv, x, y, w, h, 0, 0, out.width, out.height);
  return out;
}

/* erase */

var FILTR_DRAG = null;

function filtrEraseAt(p, last) {
  var ctxS = FILTR.src.getContext("2d");
  var kf = FILTR.full.width / FILTR.src.width;
  var ctxF = FILTR.full.getContext("2d");
  function stroke(ctx, x0, y0, x1, y1, r) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (FILTR.soft) {
      ctx.filter = "blur(" + (r * 0.35) + "px)";
    }
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 + 0.01, y1 + 0.01);
    ctx.stroke();
    ctx.restore();
  }
  var l = last || p;
  stroke(ctxS, l.x, l.y, p.x, p.y, FILTR.brush / 2);
  stroke(ctxF, l.x * kf, l.y * kf, p.x * kf, p.y * kf, FILTR.brush * kf / 2);
  FILTR.engine.source.setImage(FILTR.src, FILTR.name);
  filtrTouch();
}

/* ---------- stage pointer wiring (pan / crop / erase / place / drag ann) ---------- */

function filtrStageDown(ev) {
  if (!FILTR.src) {
    // empty pad: the stage itself is the import target — tapping it opens the
    // picker (matches the "Tap to import" hint shown over the empty stage).
    var fi = $("filtr-file");
    if (fi) { fi.click(); }
    return;
  }
  var p = filtrToImg(ev);
  if (FILTR.tool === "crop") {
    FILTR.crop = { x: p.x, y: p.y, w: 1, h: 1 };
    FILTR_DRAG = { kind: "crop", sx: p.x, sy: p.y };
  } else if (FILTR.tool === "erase") {
    FILTR_DRAG = { kind: "erase", last: p, before: filtrSnap() };
    filtrEraseAt(p, null);
  } else if (FILTR.tool === "bubble" || FILTR.tool === "text") {
    filtrAddAnn(FILTR.tool === "text" ? "text" : "speech", p);
    filtrSetTool("");
    return;
  } else {
    FILTR_DRAG = { kind: "pan", x: ev.clientX, y: ev.clientY,
                   px: FILTR.panX, py: FILTR.panY };
  }
  ev.preventDefault();
}

function filtrStageMove(ev) {
  if (!FILTR_DRAG) { return; }
  var p = filtrToImg(ev);
  if (FILTR_DRAG.kind === "crop") {
    var x0 = Math.min(FILTR_DRAG.sx, p.x), y0 = Math.min(FILTR_DRAG.sy, p.y);
    var w = Math.abs(p.x - FILTR_DRAG.sx), h = Math.abs(p.y - FILTR_DRAG.sy);
    if (FILTR.cropRatio) { h = w / FILTR.cropRatio; }
    FILTR.crop = { x: x0, y: y0, w: w, h: h };
    filtrClampCrop();
    filtrDrawCrop();
  } else if (FILTR_DRAG.kind === "erase") {
    filtrEraseAt(p, FILTR_DRAG.last);
    FILTR_DRAG.last = p;
  } else if (FILTR_DRAG.kind === "pan") {
    FILTR.panX = FILTR_DRAG.px + (ev.clientX - FILTR_DRAG.x);
    FILTR.panY = FILTR_DRAG.py + (ev.clientY - FILTR_DRAG.y);
    FILTR.fitted = false;
    filtrView();
  }
  ev.preventDefault();
}

function filtrStageUp() {
  if (FILTR_DRAG && FILTR_DRAG.kind === "erase") {
    /* one history entry per stroke */
    FILTR.hist.push(FILTR_DRAG.before);
    if (FILTR.hist.length > FILTR_HIST_MAX) { FILTR.hist.shift(); }
    FILTR.hist[FILTR.hist.length - 1] = filtrSnap();
    FILTR.fut = [];
    filtrHistButtons();
  }
  FILTR_DRAG = null;
}

function filtrWheel(ev) {
  if (!FILTR.src) { return; }
  ev.preventDefault();
  var r = $("filtr-stage").getBoundingClientRect();
  var mx = ev.clientX - r.left, my = ev.clientY - r.top;
  var oldZ = FILTR.zoom;
  var z = Math.max(0.05, Math.min(8, oldZ * (ev.deltaY < 0 ? 1.12 : 0.89)));
  FILTR.panX = mx - (mx - FILTR.panX) * (z / oldZ);
  FILTR.panY = my - (my - FILTR.panY) * (z / oldZ);
  FILTR.zoom = z;
  FILTR.fitted = false;
  filtrView();
}

/* ---------- annotations (bubbles + text) ---------- */

function filtrAddAnn(type, p) {
  FILTR.ann.push({
    type: type,                        // speech | thought | shout | box | text
    text: type === "text" ? "YOUR TEXT" : "WEN MOON?",
    x: p.x / FILTR.src.width,          // centre, image fractions
    y: p.y / FILTR.src.height,
    size: 0.05,                        // text height as fraction of image height
    font: "comic",
    fill: "#ffffff",
    ink: "#111111",
    tail: 210                          // tail angle, degrees (bubbles only)
  });
  FILTR.sel = FILTR.ann.length - 1;
  filtrPush();
  filtrDrawAnn();
  filtrAnnPanel();
}

function filtrFontCss(a, px) {
  var fam = a.font === "mono" ? "ui-monospace, Menlo, monospace"
          : a.font === "sans" ? "-apple-system, 'Helvetica Neue', Arial, sans-serif"
          : "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive";
  return "900 " + px + "px " + fam;
}

/* overlay DOM (zoomable with the image) */
function filtrDrawAnn() {
  var host = $("filtr-overlay");
  if (!host) { return; }
  host.innerHTML = "";
  if (!FILTR.src) { return; }
  var cv = $("filtr-canvas");
  var f = cv.width / FILTR.src.width;
  for (var i = 0; i < FILTR.ann.length; i++) {
    (function (a, idx) {
      var el = document.createElement("div");
      el.className = "filtr-ann filtr-ann-" + a.type +
        (idx === FILTR.sel ? " sel" : "");
      var px = a.size * FILTR.src.height * f;
      el.style.font = filtrFontCss(a, px);
      el.style.background = a.type === "text" ? "transparent" : a.fill;
      el.style.borderColor = a.type === "text" ? "transparent" : a.ink;
      el.style.color = a.type === "text" ? a.fill : a.ink;
      if (a.type === "text") {
        el.style.webkitTextStroke = Math.max(0.5, px / 16) + "px " + a.ink;
      }
      el.innerText = a.text;
      host.appendChild(el);
      var w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = (a.x * FILTR.src.width * f - w / 2) + "px";
      el.style.top = (a.y * FILTR.src.height * f - h / 2) + "px";
      /* tail */
      if (a.type === "speech" || a.type === "shout" || a.type === "thought") {
        var tail = document.createElement("div");
        tail.className = "filtr-tail";
        var rad = a.tail * Math.PI / 180;
        tail.style.left = (w / 2 + Math.cos(rad) * w * 0.42 - 7) + "px";
        tail.style.top = (h / 2 + Math.sin(rad) * h * 0.62 - 7) + "px";
        el.appendChild(tail);
      }
      el.onpointerdown = function (ev) {
        ev.stopPropagation();
        FILTR.sel = idx;
        filtrDrawAnn();
        filtrAnnPanel();
        var start = filtrToImg(ev);
        var ox = a.x, oy = a.y;
        function mv(e2) {
          var p2 = filtrToImg(e2);
          a.x = ox + (p2.x - start.x) / FILTR.src.width;
          a.y = oy + (p2.y - start.y) / FILTR.src.height;
          filtrDrawAnn();
        }
        function up() {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
          filtrPush();
        }
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
      };
      el.ondblclick = function (ev) {
        ev.stopPropagation();
        var t = prompt("Text:", a.text);
        if (t !== null) { a.text = t; filtrPush(); filtrDrawAnn(); filtrAnnPanel(); }
      };
    })(FILTR.ann[i], i);
  }
}

function filtrAnnPanel() {
  var host = $("filtr-annotate-controls");
  host.innerHTML = "";
  var a = FILTR.ann[FILTR.sel];
  if (!a) {
    host.innerHTML = "<p class='filtr-note'>use the Bubble or Text tool, or tap " +
      "an annotation to edit it</p>";
    return;
  }
  function row(label, el) {
    var r = document.createElement("div");
    r.className = "filtr-crow";
    var l = document.createElement("label");
    l.innerText = label;
    r.appendChild(l);
    r.appendChild(el);
    host.appendChild(r);
    return r;
  }
  if (a.type !== "text") {
    var segs = document.createElement("div");
    segs.className = "filtr-segs";
    ["speech", "thought", "shout", "box"].forEach(function (tp) {
      var s = document.createElement("button");
      s.className = "filtr-seg" + (a.type === tp ? " on" : "");
      s.innerText = tp;
      s.onclick = function () { a.type = tp; filtrPush(); filtrDrawAnn(); filtrAnnPanel(); };
      segs.appendChild(s);
    });
    row("style", segs);
  }
  var txt = document.createElement("input");
  txt.type = "text"; txt.value = a.text;
  txt.oninput = function () { a.text = txt.value; filtrDrawAnn(); };
  txt.onchange = function () { filtrPush(); };
  row("text", txt);
  var fonts = document.createElement("div");
  fonts.className = "filtr-segs";
  ["comic", "sans", "mono"].forEach(function (fn) {
    var s = document.createElement("button");
    s.className = "filtr-seg" + (a.font === fn ? " on" : "");
    s.innerText = fn;
    s.onclick = function () { a.font = fn; filtrPush(); filtrDrawAnn(); filtrAnnPanel(); };
    fonts.appendChild(s);
  });
  row("font", fonts);
  var size = document.createElement("input");
  size.type = "range"; size.min = 0.02; size.max = 0.15; size.step = 0.005;
  size.value = a.size;
  size.oninput = function () { a.size = parseFloat(size.value); filtrDrawAnn(); };
  size.onchange = function () { filtrPush(); };
  row("size", size);
  if (a.type !== "text" && a.type !== "box") {
    var tail = document.createElement("input");
    tail.type = "range"; tail.min = 0; tail.max = 360; tail.step = 5;
    tail.value = a.tail;
    tail.oninput = function () { a.tail = parseFloat(tail.value); filtrDrawAnn(); };
    tail.onchange = function () { filtrPush(); };
    row("tail", tail);
  }
  var fill = document.createElement("input");
  fill.type = "color"; fill.value = a.fill;
  fill.oninput = function () { a.fill = fill.value; filtrDrawAnn(); };
  fill.onchange = function () { filtrPush(); };
  row(a.type === "text" ? "text color" : "fill", fill);
  var ink = document.createElement("input");
  ink.type = "color"; ink.value = a.ink;
  ink.oninput = function () { a.ink = ink.value; filtrDrawAnn(); };
  ink.onchange = function () { filtrPush(); };
  row("ink", ink);
  var del = document.createElement("button");
  del.className = "filtr-tool warn";
  del.innerText = "Delete annotation";
  del.onclick = function () {
    FILTR.ann.splice(FILTR.sel, 1);
    FILTR.sel = -1;
    filtrPush(); filtrDrawAnn(); filtrAnnPanel();
  };
  host.appendChild(del);
}

/* flatten annotations onto a 2D context at output scale */
function filtrPaintAnn(ctx, W, H) {
  for (var i = 0; i < FILTR.ann.length; i++) {
    var a = FILTR.ann[i];
    var px = a.size * H;
    ctx.font = filtrFontCss(a, px);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var tw = ctx.measureText(a.text).width;
    var padX = px * 0.7, padY = px * 0.55;
    var w = tw + padX * 2, h = px + padY * 2;
    var cx = a.x * W, cy = a.y * H;
    var lw = Math.max(2, px / 9);
    ctx.lineWidth = lw;
    ctx.strokeStyle = a.ink;
    ctx.fillStyle = a.fill;
    if (a.type === "text") {
      ctx.lineWidth = Math.max(1.5, px / 10);
      ctx.strokeText(a.text, cx, cy);
      ctx.fillText(a.text, cx, cy);
      continue;
    }
    var rad = a.tail * Math.PI / 180;
    var tx = cx + Math.cos(rad) * w * 0.7;
    var ty = cy + Math.sin(rad) * h * 1.4;
    ctx.beginPath();
    if (a.type === "shout") {
      var spikes = 12;
      for (var s2 = 0; s2 < spikes * 2; s2++) {
        var ang = (s2 / (spikes * 2)) * Math.PI * 2;
        var rr = (s2 % 2 === 0 ? 1.15 : 0.85);
        var xx = cx + Math.cos(ang) * (w / 2) * rr;
        var yy = cy + Math.sin(ang) * (h / 2 + px * 0.3) * rr;
        if (s2 === 0) { ctx.moveTo(xx, yy); } else { ctx.lineTo(xx, yy); }
      }
      ctx.closePath();
    } else if (a.type === "thought") {
      ctx.ellipse(cx, cy, w / 2 + px * 0.2, h / 2 + px * 0.2, 0, 0, Math.PI * 2);
    } else if (a.type === "box") {
      ctx.rect(cx - w / 2, cy - h / 2, w, h);
    } else {
      /* speech: rounded rect */
      var r0 = Math.min(px * 0.8, h / 2);
      var x0 = cx - w / 2, y0 = cy - h / 2;
      ctx.moveTo(x0 + r0, y0);
      ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r0);
      ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r0);
      ctx.arcTo(x0, y0 + h, x0, y0, r0);
      ctx.arcTo(x0, y0, x0 + w, y0, r0);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    /* tail */
    if (a.type === "speech" || a.type === "shout") {
      var bx = cx + Math.cos(rad) * w * 0.28;
      var by = cy + Math.sin(rad) * h * 0.42;
      var perp = rad + Math.PI / 2;
      var half = px * 0.45;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(perp) * half, by + Math.sin(perp) * half);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - Math.cos(perp) * half, by - Math.sin(perp) * half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      /* re-fill the seam */
      ctx.save();
      ctx.strokeStyle = a.fill;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(perp) * (half - lw), by + Math.sin(perp) * (half - lw));
      ctx.lineTo(bx - Math.cos(perp) * (half - lw), by - Math.sin(perp) * (half - lw));
      ctx.stroke();
      ctx.restore();
    } else if (a.type === "thought") {
      for (var d3 = 1; d3 <= 3; d3++) {
        var t3 = d3 / 3.6;
        var rx3 = cx + Math.cos(rad) * (w * 0.5 + (Math.abs(tx - cx)) * t3);
        var ry3 = cy + Math.sin(rad) * (h * 0.5 + (Math.abs(ty - cy)) * t3);
        ctx.beginPath();
        ctx.arc(rx3, ry3, px * (0.36 - d3 * 0.08), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.fillStyle = a.ink;
    ctx.fillText(a.text, cx, cy);
  }
}

/* ---------- APPLY (bake) + full-res render ---------- */

function filtrRenderFull(withAnn, cb) {
  /* run the engine once at full resolution on an offscreen renderer */
  var cv = document.createElement("canvas");
  var eng;
  try { eng = new FiltrEngine.Renderer(cv); }
  catch (e) { cb(null); return; }
  eng.source.setImage(FILTR.full, FILTR.name);
  var s = JSON.parse(JSON.stringify(FILTR.settings));
  s.output.maxPreviewDim = FILTR_MAX_FULL;
  s.output.showOriginal = false;
  var keep = FiltrEngine.getSettings();
  FiltrEngine.setSettings(s);
  try { eng.renderNow(); } catch (e2) { FiltrEngine.setSettings(keep); cb(null); return; }
  FiltrEngine.setSettings(keep);
  var out = document.createElement("canvas");
  out.width = cv.width; out.height = cv.height;
  var ctx = out.getContext("2d");
  ctx.drawImage(cv, 0, 0);
  if (withAnn) { filtrPaintAnn(ctx, out.width, out.height); }
  eng.dispose();
  /* one-shot context — release it so repeated exports never exhaust the
   * browser's WebGL context pool */
  var lose = eng.gl.getExtension("WEBGL_lose_context");
  if (lose) { lose.loseContext(); }
  cb(out);
}

function filtrApply() {
  if (!FILTR.src) { return; }
  filtrStatus("baking…");
  filtrRenderFull(false, function (out) {
    if (!out) { filtrStatus("bake failed", true); return; }
    FILTR.full = out;
    FILTR.src = filtrScaled(out, FILTR_MAX_WORK);
    /* the look is now IN the pixels — reset the look, keep annotations */
    FILTR.settings = FiltrEngine.freshSettings();
    FILTR.settings.output.maxPreviewDim = FILTR_PREVIEW_DIM;
    FILTR.settings.output.background = "#00000000";
    FILTR.engine.source.setImage(FILTR.src, FILTR.name);
    filtrSyncPanels();
    filtrMeta();
    filtrPush();
    filtrTouch();
    filtrFit();
    filtrStatus("applied — pick the next effect");
  });
}

/* ---------- save ---------- */

function filtrStatus(msg, err) {
  var el = $("filtr-status");
  el.innerText = msg || "";
  el.className = "modal-status" + (err ? " err" : msg ? " ok" : "");
}

function filtrExport(jpeg, cb) {
  if (!FILTR.src) { toast("load an image first"); return; }
  filtrRenderFull(true, function (out) {
    if (!out) { filtrStatus("export failed", true); return; }
    if (jpeg) {
      var flat = document.createElement("canvas");
      flat.width = out.width; flat.height = out.height;
      var c = flat.getContext("2d");
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, flat.width, flat.height);
      c.drawImage(out, 0, 0);
      cb(flat);
    } else { cb(out); }
  });
}

function filtrDownload(jpeg) {
  filtrExport(jpeg, function (cv) {
    cv.toBlob(function (blob) {
      if (!blob) { filtrStatus("encode failed", true); return; }
      var base = (FILTR.name || "filtr").replace(/\.[A-Za-z0-9]+$/, "")
                   .replace(/[^A-Za-z0-9_-]+/g, "_") || "filtr";
      downloadBlob(base + "-filtr." + (jpeg ? "jpg" : "png"), blob,
                   jpeg ? "image/jpeg" : "image/png");
      filtrStatus("downloaded");
    }, jpeg ? "image/jpeg" : "image/png", 0.92);
  });
}

/* jpeg b64 ladder for the mint handoff (raw b64, no data: prefix) */
function filtrJpegB64(cv, budget) {
  var dims = [1024, 800, 640, 512, 400, 320];
  var quals = [0.85, 0.75, 0.65, 0.55];
  for (var d = 0; d < dims.length; d++) {
    var k = Math.min(1, dims[d] / Math.max(cv.width, cv.height));
    var t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(cv.width * k));
    t.height = Math.max(1, Math.round(cv.height * k));
    var c = t.getContext("2d");
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, t.width, t.height);
    c.drawImage(cv, 0, 0, t.width, t.height);
    for (var q = 0; q < quals.length; q++) {
      var b64 = t.toDataURL("image/jpeg", quals[q]).split(",")[1];
      if (b64.length <= budget) { return b64; }
    }
  }
  return "";
}

function filtrSendToMint() {
  filtrExport(true, function (cv) {
    var b64 = filtrJpegB64(cv, ARTIMAGE_BUDGET);
    if (!b64) { filtrStatus("could not fit the artimage budget", true); return; }
    NFT_ART = b64;
    show("view-create");
    studioShow("nft");
    nftArtShow();
    toast("edited image loaded into the NFT wizard");
  });
}

function filtrSendToPhoto() {
  filtrExport(false, function (cv) {
    var sq = document.createElement("canvas");
    sq.width = 512; sq.height = 512;
    var side = Math.min(cv.width, cv.height);
    sq.getContext("2d").drawImage(cv, (cv.width - side) / 2,
      (cv.height - side) / 2, side, side, 0, 0, 512, 512);
    show("view-create");
    studioShow("art");
    artStudioEnter();
    artPhotoIntake(sq);
    toast("edited image sent to the Photo Cartoon pack");
  });
}

/* ---------- panels: effect list / controls / adjust / post / presets ---------- */

function filtrFxById(id) {
  for (var i = 0; i < FILTR_FX.length; i++) {
    if (FILTR_FX[i].id === id) { return FILTR_FX[i]; }
  }
  return FILTR_FX[0];
}

function filtrBuildFxList() {
  var host = $("filtr-fx-list");
  host.innerHTML = "";
  for (var i = 0; i < FILTR_FX.length; i++) {
    (function (fx) {
      var li = document.createElement("div");
      li.className = "filtr-fx" + (FILTR.settings.active === fx.id ? " on" : "");
      li.innerText = fx.label;
      li.onclick = function () {
        FILTR.settings.active = fx.id;
        filtrBuildFxList();
        filtrBuildFxControls();
        filtrTouch();
      };
      host.appendChild(li);
    })(FILTR_FX[i]);
  }
  filtrBuildFxControls();
}

function filtrControlRow(host, label, el, valEl) {
  var r = document.createElement("div");
  r.className = "filtr-crow";
  var l = document.createElement("label");
  l.innerText = label;
  r.appendChild(l);
  r.appendChild(el);
  if (valEl) { r.appendChild(valEl); }
  host.appendChild(r);
}

function filtrBuildControls(host, obj, schema, onChange) {
  host.innerHTML = "";
  for (var i = 0; i < schema.length; i++) {
    (function (cdef) {
      var label = cdef.lb || cdef.k.replace(/([A-Z])/g, " $1").toLowerCase();
      if (cdef.t === "r" || cdef.t === undefined) {
        var r = document.createElement("input");
        r.type = "range"; r.min = cdef.mi; r.max = cdef.ma; r.step = cdef.st;
        r.value = obj[cdef.k];
        var v = document.createElement("span");
        v.className = "filtr-val";
        v.innerText = obj[cdef.k];
        r.oninput = function () {
          obj[cdef.k] = parseFloat(r.value);
          v.innerText = r.value;
          onChange();
        };
        filtrControlRow(host, label, r, v);
      } else if (cdef.t === "b") {
        var b = document.createElement("input");
        b.type = "checkbox"; b.checked = !!obj[cdef.k];
        b.onchange = function () { obj[cdef.k] = b.checked; onChange(); };
        filtrControlRow(host, label, b);
      } else if (cdef.t === "col") {
        var c = document.createElement("input");
        c.type = "color"; c.value = obj[cdef.k];
        c.oninput = function () { obj[cdef.k] = c.value; onChange(); };
        filtrControlRow(host, label, c);
      } else if (cdef.t === "seg") {
        var wrap = document.createElement("div");
        wrap.className = "filtr-segs";
        for (var o = 0; o < cdef.o.length; o++) {
          (function (opt, oi) {
            var s = document.createElement("button");
            s.className = "filtr-seg" + (obj[cdef.k] === opt ? " on" : "");
            s.innerText = "" + (cdef.lo ? cdef.lo[oi] : opt);
            s.onclick = function () {
              obj[cdef.k] = opt;
              onChange();
              var sib = wrap.children;
              for (var z = 0; z < sib.length; z++) {
                sib[z].classList.toggle("on", z === oi);
              }
            };
            wrap.appendChild(s);
          })(cdef.o[o], o);
        }
        filtrControlRow(host, label, wrap);
      } else if (cdef.t === "sel") {
        var sel = document.createElement("select");
        for (var o2 = 0; o2 < cdef.o.length; o2++) {
          var op = document.createElement("option");
          op.value = cdef.o[o2];
          op.text = "" + cdef.o[o2];
          if (obj[cdef.k] === cdef.o[o2]) { op.selected = true; }
          sel.appendChild(op);
        }
        sel.onchange = function () { obj[cdef.k] = sel.value; onChange(); };
        filtrControlRow(host, label, sel);
      }
    })(schema[i]);
  }
}

function filtrBuildFxControls() {
  var fx = filtrFxById(FILTR.settings.active);
  $("filtr-fx-name").innerText = fx.label;
  var host = $("filtr-fx-controls");
  if (!fx.c.length) {
    host.innerHTML = "<p class='filtr-note'>no effect — geometry, adjustments, " +
      "annotations and post fx still apply</p>";
    return;
  }
  filtrBuildControls(host, FILTR.settings[fx.id], fx.c, filtrTouch);
}

function filtrBuildAdjust() {
  filtrBuildControls($("filtr-adjust-controls"), FILTR.settings.adjust,
    FILTR_ADJUST, filtrTouch);
}

function filtrBuildPost() {
  var host = $("filtr-post-controls");
  host.innerHTML = "";
  for (var i = 0; i < FILTR_POST.length; i++) {
    (function (pd) {
      var p = FILTR.settings.post[pd.id];
      var head = document.createElement("div");
      head.className = "filtr-postrow";
      var lab = document.createElement("span");
      lab.innerText = pd.id.replace(/([A-Z])/g, " $1").toLowerCase();
      var chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!p.enabled;
      var sub = document.createElement("div");
      sub.className = "filtr-postsub" + (p.enabled ? "" : " hidden");
      chk.onchange = function () {
        p.enabled = chk.checked;
        sub.classList.toggle("hidden", !p.enabled);
        filtrTouch();
      };
      head.appendChild(lab);
      head.appendChild(chk);
      host.appendChild(head);
      filtrBuildControls(sub, p, pd.c, filtrTouch);
      if (pd.id === "phosphor") {
        var segs = document.createElement("div");
        segs.className = "filtr-segs";
        ["green", "amber", "white"].forEach(function (col) {
          var s = document.createElement("button");
          s.className = "filtr-seg" + (p.color === col ? " on" : "");
          s.innerText = col;
          s.onclick = function () {
            p.color = col;
            filtrTouch();
            filtrBuildPost();
          };
          segs.appendChild(s);
        });
        sub.appendChild(segs);
      }
      host.appendChild(sub);
    })(FILTR_POST[i]);
  }
}

function filtrBuildPresets() {
  var host = $("filtr-presets");
  host.innerHTML = "";
  var list = FiltrEngine.BUILTIN_PRESETS;
  for (var i = 0; i < list.length; i++) {
    (function (p) {
      var b = document.createElement("button");
      b.className = "filtr-preset";
      b.innerText = p.name;
      b.onclick = function () {
        FILTR.settings = FiltrEngine.applyPreset(p.id, FILTR.settings);
        FILTR.settings.output.maxPreviewDim = FILTR_PREVIEW_DIM;
        filtrSyncPanels();
        filtrTouch();
        toast(p.name);
      };
      host.appendChild(b);
    })(list[i]);
  }
}

function filtrSyncPanels() {
  filtrBuildFxList();
  filtrBuildAdjust();
  filtrBuildPost();
  filtrAnnPanel();
}

/* ---------- static wiring ---------- */

$("filtr-file").onchange = function () {
  filtrLoadFile(this.files && this.files[0]);
  this.value = "";
};

$("filtr-tool-crop").onclick = function () { filtrSetTool("crop"); };
$("filtr-tool-erase").onclick = function () { filtrSetTool("erase"); };
$("filtr-tool-bubble").onclick = function () { filtrSetTool("bubble"); };
$("filtr-tool-text").onclick = function () { filtrSetTool("text"); };
$("filtr-rotl").onclick = function () { filtrRotate(false); };
$("filtr-rotr").onclick = function () { filtrRotate(true); };
$("filtr-fliph").onclick = function () { filtrFlip(true); };
$("filtr-flipv").onclick = function () { filtrFlip(false); };
$("filtr-resize").onclick = filtrResizePrompt;
$("filtr-undo").onclick = filtrUndo;
$("filtr-redo").onclick = filtrRedo;
$("filtr-fit").onclick = filtrFit;
$("filtr-ab").onpointerdown = function () {
  FILTR.ab = true;
  FILTR.settings.output.showOriginal = true;
  filtrTouch();
};
$("filtr-ab").onpointerup = $("filtr-ab").onpointerleave = function () {
  if (!FILTR.ab) { return; }
  FILTR.ab = false;
  FILTR.settings.output.showOriginal = false;
  filtrTouch();
};
$("filtr-apply").onclick = filtrApply;
$("filtr-save-mint").onclick = filtrSendToMint;
$("filtr-save-photo").onclick = filtrSendToPhoto;
$("filtr-save-png").onclick = function () { filtrDownload(false); };
$("filtr-save-jpg").onclick = function () { filtrDownload(true); };

(function () {
  /* accordions */
  var accs = document.querySelectorAll("#view-filtr .filtr-acc h4");
  for (var i = 0; i < accs.length; i++) {
    accs[i].onclick = function () { this.parentNode.classList.toggle("open"); };
  }
  var stage = $("filtr-stage");
  stage.onpointerdown = filtrStageDown;
  window.addEventListener("pointermove", filtrStageMove);
  window.addEventListener("pointerup", filtrStageUp);
  stage.addEventListener("wheel", filtrWheel, { passive: false });
  /* drag & drop + paste onto the tab */
  stage.addEventListener("dragover", function (e) { e.preventDefault(); });
  stage.addEventListener("drop", function (e) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      filtrLoadFile(e.dataTransfer.files[0]);
    }
  });
  document.addEventListener("paste", function (e) {
    if ($("view-filtr").classList.contains("hidden")) { return; }
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) { return; }
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") === 0) {
        filtrLoadFile(items[i].getAsFile());
        return;
      }
    }
  });
})();
