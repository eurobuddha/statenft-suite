/* Atelier generative studio — the artBox merge. ES5, matching the family
 * style. art.js draws (18 deterministic SVG style packs), engine.js mints,
 * service.js keeps minting in the background. Loaded after app.js: reuses
 * its $() and toast(); app.js drives artStudioBoot()/artStudioEnter(). */

/* per-style configs live in ART_STUDIO.cfgs; ART_CFG points at the active one */
var ART_STUDIO = { style: "mandala", seed: "atelier-genesis", cfgs: {}, preview: 12 };
var ART_CFG = null;
var ART_SEED = ART_STUDIO.seed;

function artPreviewCount() {
  var n = parseInt(ART_STUDIO.preview, 10) || 12;
  return Math.max(4, Math.min(20, n));
}

function artActivateStyle(styleKey) {
  if (!ART_STYLES[styleKey]) { styleKey = "mandala"; }
  ART_STUDIO.style = styleKey;
  if (!ART_STUDIO.cfgs[styleKey]) { ART_STUDIO.cfgs[styleKey] = artDefaultConfig(styleKey); }
  ART_CFG = ART_STUDIO.cfgs[styleKey];
}
artActivateStyle(ART_STUDIO.style);
var ART_MAX_MINT = 20;
var ART_EMBED_BUDGET = 16000; // base64 bytes per item — IMG_BUDGET's on-chain
                              // proof (rides twice per transfer under the 64KB
                              // TxPoW; image-budget-spike 2026-08-05). The 18
                              // generative packs stay test-swept at 8192; the
                              // photo pack uses the headroom.
var ART_REDRAW_TIMER = null;

function artSetStatus(id, msg, cls) {
  var el = $(id);
  el.innerText = msg || "";
  el.className = "modal-status" + (cls ? " " + cls : "");
}

function b64bytes(rawLen) { return Math.ceil(rawLen / 3) * 4; }

/* ---------- style picker ---------- */

var STYLE_THUMBS = {};   // styleKey -> data URI (generated once)

function artStyleThumb(styleKey) {
  if (!STYLE_THUMBS[styleKey]) {
    var item = artGenerate("artbox-style-card", "1",
                           artDefaultConfig(styleKey));
    STYLE_THUMBS[styleKey] = item
      ? "data:image/svg+xml;base64," + btoa(item.svg) : "";
  }
  return STYLE_THUMBS[styleKey];
}

function artRenderStylePicker() {
  var host = $("art-style-picker");
  host.innerHTML = "";
  for (var sk in ART_STYLES) {
    if (!ART_STYLES.hasOwnProperty(sk)) { continue; }
    (function (styleKey) {
      var card = document.createElement("div");
      card.className = "style-card" +
        (styleKey === ART_STUDIO.style ? " active" : "");
      var img = document.createElement("img");
      img.src = artStyleThumb(styleKey);
      card.appendChild(img);
      var lab = document.createElement("div");
      lab.className = "style-label";
      lab.innerText = ART_STYLES[styleKey].label;
      card.appendChild(lab);
      card.onclick = function () {
        artActivateStyle(styleKey);
        artSaveStudio();
        artRenderStylePicker();
        artRenderSlots();
        artRenderPreview();
      };
      host.appendChild(card);
    })(sk);
  }
}

/* ---------- photo intake (pack: photo — your photo as flat vector art) ----------
 * The picked photo is center-cropped onto a 96x96 canvas, quantized to 8
 * flat colors on-device (photo.js) and handed to artSetPhoto (art.js).
 * Only the cartoon SVG is ever minted; the photo never leaves the page. */

function artPhotoSync() {
  $("photo-section").classList.toggle("hidden", ART_STUDIO.style !== "photo");
  if (!ART_PHOTO_SRC) {
    $("photo-hint").innerText = "+ choose photo";
    $("photo-drop").style.backgroundImage = "";
  }
}

/* ---- AI cartoonizer: AnimeGAN (facepaint.onnx) via onnxruntime wasm.
 * Lazy singleton; any failure falls back to the direct quantize+trace. */

var ART_AI_SESSION = null;
var ART_AI_STATE = "";   // "" | "loading" | "ready" | "failed"

function artAiSession(cb) {
  if (ART_AI_SESSION) { cb(ART_AI_SESSION); return; }
  if (ART_AI_STATE === "failed" || typeof ort === "undefined") { cb(null); return; }
  ART_AI_STATE = "loading";
  try {
    ort.env.wasm.numThreads = 1;   // no SharedArrayBuffer in the MDS webview
    ort.env.wasm.wasmPaths = "./";
    fetch("facepaint.onnx").then(function (r) {
      if (!r.ok) { throw new Error("model " + r.status); }
      return r.arrayBuffer();
    }).then(function (buf) {
      return ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
    }).then(function (s) {
      ART_AI_SESSION = s;
      ART_AI_STATE = "ready";
      cb(s);
    })["catch"](function () { ART_AI_STATE = "failed"; cb(null); });
  } catch (e) { ART_AI_STATE = "failed"; cb(null); }
}

/* 512x512 canvas -> cb(cartoonized 512 canvas, or null on any failure) */
function artAiCartoonize(cv512, cb) {
  artAiSession(function (s) {
    if (!s) { cb(null); return; }
    try {
      var d = cv512.getContext("2d").getImageData(0, 0, 512, 512).data;
      var t = new ort.Tensor("float32", photoChw(d, 512), [1, 3, 512, 512]);
      s.run({ input: t }).then(function (res) {
        var rgba = photoRgbaFromChw(res.output.data, 512);
        var oc = document.createElement("canvas");
        oc.width = 512; oc.height = 512;
        oc.getContext("2d").putImageData(new ImageData(rgba, 512, 512), 0, 0);
        cb(oc);
      })["catch"](function () { cb(null); });
    } catch (e) { cb(null); }
  });
}

$("photo-file").onchange = function () {
  var f = this.files && this.files[0];
  this.value = "";   // re-picking the same file must re-fire
  if (!f) { return; }
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var side = Math.min(img.width, img.height);
      var sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      var big = document.createElement("canvas");
      big.width = 512; big.height = 512;
      big.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, 512, 512);
      $("photo-hint").innerText = "cartoonizing…";
      artAiCartoonize(big, function (toon) {
        var src = toon || big;
        if (!toon) { toast("AI engine unavailable — direct trace used"); }
        var cv = document.createElement("canvas");
        cv.width = 96; cv.height = 96;
        var cx = cv.getContext("2d");
        cx.drawImage(src, 0, 0, 512, 512, 0, 0, 96, 96);
        var data;
        try { data = cx.getImageData(0, 0, 96, 96).data; }
        catch (e) { toast("could not read that image"); artPhotoSync(); return; }
        artSetPhoto(photoQuantize(data, 96, 96, 8));
        $("photo-drop").style.backgroundImage =
          "url(\"" + src.toDataURL("image/jpeg", 0.8) + "\")";
        $("photo-hint").innerText = "";
        delete STYLE_THUMBS.photo;   // style card now shows the cartoonized photo
        if (ART_STUDIO.style !== "photo") {
          artActivateStyle("photo");
          artSaveStudio();
        }
        artRenderStylePicker();
        artRenderSlots();
        artRenderPreview();
        toast(toon ? "photo AI-cartoonized on-device" : "photo traced on-device");
      });
    };
    img.onerror = function () { toast("could not load that image"); };
    img.src = reader.result;
  };
  reader.readAsDataURL(f);
};

$("photo-clear").onclick = function () {
  artSetPhoto(null);
  delete STYLE_THUMBS.photo;
  artPhotoSync();
  artRenderStylePicker();
  artRenderPreview();
};

/* ---------- randomize controls ---------- */

/* random weights for every enabled variant */
function artShuffleRarity() {
  for (var i = 0; i < ART_CFG.slots.length; i++) {
    var vs = ART_CFG.slots[i].variants;
    for (var j = 0; j < vs.length; j++) {
      if (vs[j].on !== false) {
        vs[j].weight = 1 + Math.floor(Math.random() * 99);
      }
    }
  }
  artOnConfigChange();
  toast("rarity shuffled");
}

/* random on/off per slot (always >= 2 enabled) + random weights */
function artShufflePool() {
  for (var i = 0; i < ART_CFG.slots.length; i++) {
    var vs = ART_CFG.slots[i].variants;
    var onIdx = [];
    for (var j = 0; j < vs.length; j++) {
      vs[j].on = Math.random() > 0.35;
      vs[j].weight = 1 + Math.floor(Math.random() * 99);
      if (vs[j].on) { onIdx.push(j); }
    }
    while (onIdx.length < Math.min(2, vs.length)) {
      var pick = Math.floor(Math.random() * vs.length);
      if (vs[pick].on !== true) { vs[pick].on = true; onIdx.push(pick); }
    }
  }
  artOnConfigChange();
  toast("trait pool shuffled");
}

/* ---------- trait pool editor ---------- */

function artSlotEnabledCount(slot) {
  var n = 0;
  for (var i = 0; i < slot.variants.length; i++) {
    if (slot.variants[i].on !== false && slot.variants[i].weight > 0) { n++; }
  }
  return n;
}

function artRenderSlots() {
  var host = $("art-slots");
  host.innerHTML = "";
  for (var i = 0; i < ART_CFG.slots.length; i++) {
    (function (slot) {
      var div = document.createElement("div");
      div.className = "slot";
      var head = document.createElement("div");
      head.className = "slot-head";
      head.innerHTML = "<span class='name'></span><span class='count'></span>" +
                       "<span class='arrow'>&#9662;</span>";
      head.querySelector(".name").innerText = slot.label;
      head.querySelector(".count").innerText =
        artSlotEnabledCount(slot) + "/" + slot.variants.length + " on";
      head.onclick = function () { div.classList.toggle("open"); };
      div.appendChild(head);

      var body = document.createElement("div");
      body.className = "slot-body";
      var total = 0;
      for (var j = 0; j < slot.variants.length; j++) {
        if (slot.variants[j].on !== false) { total += slot.variants[j].weight; }
      }
      for (var k = 0; k < slot.variants.length; k++) {
        (function (v) {
          var row = document.createElement("div");
          row.className = "variant-row";
          var on = v.on !== false;
          var pct = (on && total > 0) ? Math.round((v.weight / total) * 1000) / 10 : 0;
          row.innerHTML =
            "<label><input type='checkbox'" + (on ? " checked" : "") + "/>" +
            "<span></span></label>" +
            "<input type='range' min='0' max='100' step='1' value='" +
            Math.min(100, v.weight) + "'/>" +
            "<span class='pct'>" + pct + "%</span>";
          row.querySelector("label span").innerText = v.name;
          row.querySelector("input[type=checkbox]").onchange = function (e) {
            v.on = e.target.checked;
            artOnConfigChange();
          };
          /* slider: weight + % update live while dragging, redraw debounced */
          row.querySelector("input[type=range]").oninput = function (e) {
            v.weight = parseInt(e.target.value, 10) || 0;
            var tot = 0;
            for (var q = 0; q < slot.variants.length; q++) {
              if (slot.variants[q].on !== false) { tot += slot.variants[q].weight; }
            }
            row.querySelector(".pct").innerText = (v.on !== false && tot > 0
              ? Math.round((v.weight / tot) * 1000) / 10 : 0) + "%";
            /* save rides the same debounce as the redraw — keypair.set is a
             * node round-trip, far too heavy for every drag tick */
            if (ART_REDRAW_TIMER) { clearTimeout(ART_REDRAW_TIMER); }
            ART_REDRAW_TIMER = setTimeout(function () {
              artSaveStudio();
              artRenderSlots();
              artRenderPreview();
            }, 320);
          };
          body.appendChild(row);
        })(slot.variants[k]);
      }
      div.appendChild(body);
      host.appendChild(div);
    })(ART_CFG.slots[i]);
  }
  $("art-capacity").innerHTML = "trait space: <b>" +
    artCapacity(ART_CFG).toLocaleString() + "</b> distinct combinations";
  artPhotoSync();
}

function artOnConfigChange() {
  artRenderSlots();
  artSaveStudio();
  if (ART_REDRAW_TIMER) { clearTimeout(ART_REDRAW_TIMER); }
  ART_REDRAW_TIMER = setTimeout(artRenderPreview, 280);
}

$("art-reset-weights").onclick = function () {
  ART_STUDIO.cfgs[ART_STUDIO.style] = artDefaultConfig(ART_STUDIO.style);
  ART_CFG = ART_STUDIO.cfgs[ART_STUDIO.style];
  artOnConfigChange();
  toast("weights reset to defaults");
};

$("art-shuffle-rarity").onclick = artShuffleRarity;
$("art-shuffle-pool").onclick = artShufflePool;

$("art-seed").onchange = function () {
  ART_SEED = $("art-seed").value.trim() || "atelier";
  ART_STUDIO.seed = ART_SEED;
  artSaveStudio();
  artRenderPreview();
};

$("art-reseed").onclick = function () {
  var chars = "abcdefghjkmnpqrstuvwxyz23456789";
  var s = "";
  for (var i = 0; i < 10; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  ART_SEED = "atelier-" + s;
  ART_STUDIO.seed = ART_SEED;
  $("art-seed").value = ART_SEED;
  artSaveStudio();
  artRenderPreview();
};

/* ---------- preview grid ---------- */

function artCard(item, titlePrefix) {
  var card = document.createElement("div");
  card.className = "art-card";
  /* isolated <img> rendering: inline SVGs share the page id namespace, so
   * twelve cards with gradient defs would steal each other's colors */
  var img = document.createElement("img");
  img.src = "data:image/svg+xml;base64," + btoa(item.svg);
  card.appendChild(img);
  var meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = "<span></span><span class='score'></span>";
  meta.children[0].innerText = (titlePrefix || "#") + item.idx +
    " · " + item.bytes + "B";
  meta.children[1].innerText = "r" + item.score;
  card.appendChild(meta);
  card.onclick = function () { artOpenInspector(item); };
  return card;
}

function artRenderPreview() {
  var n = artPreviewCount();
  $("art-pv-n").value = n;
  var col = artCollection(ART_SEED, n, ART_CFG);
  var grid = $("art-preview-grid");
  grid.innerHTML = "";
  for (var i = 0; i < col.items.length; i++) {
    grid.appendChild(artCard(col.items[i]));
  }
  var stats = "";
  if (col.error) {
    stats = col.error;
  } else {
    var maxB = 0;
    for (var j = 0; j < col.items.length; j++) {
      if (col.items[j].bytes > maxB) { maxB = col.items[j].bytes; }
    }
    stats = "largest " + maxB + "B raw (" + b64bytes(maxB) + "B on-chain)";
  }
  $("art-pv-stats").innerText = stats;
  /* the sheet just generated at n items — reuse it when the mint size matches
   * rather than running the whole deterministic draw a second time */
  artRenderBudget(n === artMintSize() ? col : null);
}

$("art-pv-n").onchange = function () {
  ART_STUDIO.preview = Math.max(4, Math.min(20, parseInt($("art-pv-n").value, 10) || 12));
  artSaveStudio();
  artRenderPreview();
};

$("art-regen").onclick = artRenderPreview;

/* ---------- inspector ---------- */

var INSPECTED = null;

function artOpenInspector(item) {
  INSPECTED = item;
  $("art-insp-title").innerText = "Item #" + item.idx;
  $("art-insp-sub").innerText = item.bytes + " bytes raw · " +
    b64bytes(item.bytes) + " bytes on-chain · rarity score " + item.score;
  var src = item.imgSrc ||
            ("data:image/svg+xml;base64," + btoa(item.svg));
  $("art-insp-art").innerHTML = "";
  var big = document.createElement("img");
  big.src = src;
  $("art-insp-art").appendChild(big);
  $("art-insp-dl").style.display = item.svg ? "" : "none";
  var rows = "";
  for (var i = 0; i < item.traits.length; i++) {
    rows += "<tr><td></td><td></td><td></td></tr>";
  }
  var table = $("art-insp-traits");
  table.innerHTML = rows;
  for (var j = 0; j < item.traits.length; j++) {
    var tr = table.rows[j];
    tr.cells[0].innerText = item.traits[j].label;
    tr.cells[1].innerText = item.traits[j].value;
    tr.cells[2].innerText = item.traits[j].pct + "%";
  }
  $("art-insp-backdrop").classList.remove("hidden");
}

$("art-insp-close").onclick = function () {
  $("art-insp-backdrop").classList.add("hidden");
};
$("art-insp-backdrop").onclick = function (e) {
  if (e.target === $("art-insp-backdrop")) {
    $("art-insp-backdrop").classList.add("hidden");
  }
};
$("art-insp-dl").onclick = function () {
  if (!INSPECTED || !INSPECTED.svg) { return; }
  downloadBlob(("00" + INSPECTED.idx).slice(-3) + ".svg",
               INSPECTED.svg, "image/svg+xml");
};

/* ---------- mint ---------- */

function artMintSize() {
  return Math.max(2, Math.min(ART_MAX_MINT, parseInt($("g-size").value, 10) || 0));
}

function artRenderBudget(reuseCol) {
  $("g-iconitem").max = artMintSize();
  var col = reuseCol || artCollection(ART_SEED, artMintSize(), ART_CFG);
  var maxB = 0;
  var over = 0;
  for (var i = 0; i < col.items.length; i++) {
    var b = b64bytes(col.items[i].bytes);
    if (b > maxB) { maxB = b; }
    if (b > ART_EMBED_BUDGET) { over++; }
  }
  var budget = $("g-budget");
  if (col.error) {
    budget.innerHTML = "<b class='over'></b>";
    budget.children[0].innerText = col.error;
  } else {
    budget.innerHTML = "seed <b class='fit'></b> · largest item on-chain: <b class='" +
      (over ? "over" : "fit") + "'>" + maxB + "B</b> of " + ART_EMBED_BUDGET +
      "B budget" + (over ? " — " + over + " item(s) over" : "");
    budget.children[0].innerText = ART_SEED;
  }
  return col;
}

$("g-size").onchange = function () { artRenderBudget(null); };

/* rasterize an SVG to a wallet-icon JPEG base64 within the given budget
 * (default ICON_BUDGET): largest size/quality that fits wins */
function svgToIconB64(svg, cb, budget) {
  var target = budget || ICON_BUDGET;
  try {
    /* our SVGs are viewBox-only; WebKit/Firefox need explicit dimensions to
     * rasterize onto a canvas (else: blank icon -> wallet placeholder) */
    svg = svg.replace("<svg ", "<svg width='512' height='512' ");
    var img = new Image();
    img.onload = function () {
      try {
        var tries = [[200, 0.85], [200, 0.7], [160, 0.7], [128, 0.6], [96, 0.55], [72, 0.5]];
        var best = "";
        for (var i = 0; i < tries.length; i++) {
          var cv = document.createElement("canvas");
          cv.width = tries[i][0]; cv.height = tries[i][0];
          var cx = cv.getContext("2d");
          cx.drawImage(img, 0, 0, tries[i][0], tries[i][0]);
          var b64 = cv.toDataURL("image/jpeg", tries[i][1]).split(",")[1];
          best = b64;
          if (b64.length <= target) { cb(b64); return; }
        }
        cb(best);   // smallest attempt even if slightly over
      } catch (e) { cb(""); }
    };
    img.onerror = function () { cb(""); };
    img.src = "data:image/svg+xml;base64," + btoa(svg);
  } catch (e) { cb(""); }
}

/* ---- the JOINT transfer budget (the "Random" lesson, 2026-08-09) ----
 *
 * A sealed transfer carries the token definition TWICE (input proof + output)
 * and the embedded image TWICE (input state + replayed output state), plus a
 * multi-KB signature — all under the 64KB TxPoW cap. So the definition and
 * the LARGEST item image are one budget, not two:
 *
 *     defActual + maxImageB64  <=  23000     (proven on-chain: 7K definition
 *                                             + 16000 image, spike 2026-08-05)
 *
 * "Random" (def 14,587 + images 12-15K, minted before this guard) computes to
 * 65-71KB transfers — sealed forever, transferable never. The definition is
 * computed EXACTLY here: the same metadata JSON the engine will seal, plus the
 * measured 533-byte record wrapper (constant across every minted collection).
 * The split bound (3 defs + sig at unit+change) is kept alongside. */
var ART_TRANSFER_PAIR_BUDGET = 23000;
var ART_DEF_WRAPPER = 533;
var ART_DEF_SPLIT_MAX = 17300;   // 3 defs + ~12K sig under 64KB

/* mirror enginePhaseCreatePost field-for-field so the length is exact */
function artExactMeta(name, desc, size, iconValue, externalUrl, traitsMap) {
  var meta = { name: name, description: desc || "", mode: "embed", size: size };
  if (iconValue) {
    meta.url = iconValue.indexOf("http") === 0 ? iconValue : "<artimage>" + iconValue;
  }
  if (externalUrl) { meta.external_url = externalUrl; }
  if (traitsMap) {
    var any = false;
    for (var k in traitsMap) { if (traitsMap.hasOwnProperty(k)) { any = true; break; } }
    if (any) { meta.traits = traitsMap; }
  }
  return meta;
}

function artDefActual(name, desc, size, iconValue, externalUrl, traitsMap) {
  return JSON.stringify(artExactMeta(name, desc, size, iconValue, externalUrl, traitsMap)).length
       + ART_DEF_WRAPPER;
}

/* null = fits; else a human-readable refusal naming the real numbers */
function artJointBudgetError(defActual, maxImg) {
  if (defActual > ART_DEF_SPLIT_MAX) {
    return "token record " + defActual + "B cannot split under the 64KB cap (max "
         + ART_DEF_SPLIT_MAX + "B) — hosted icon or fewer traits";
  }
  if (defActual + maxImg > ART_TRANSFER_PAIR_BUDGET) {
    return "record " + defActual + "B + largest image " + maxImg + "B exceeds the "
         + ART_TRANSFER_PAIR_BUDGET + "B transfer budget — the lots would seal "
         + "but never send. Hosted icon, fewer traits, or smaller items";
  }
  return null;
}

$("g-mint-btn").onclick = function () {
  var name = $("g-name").value.trim();
  var desc = $("g-desc").value.trim();
  var size = artMintSize();
  if (!name) { artSetStatus("g-status", "name required", "err"); return; }
  if (ART_STUDIO.style === "photo" && !ART_PHOTO_SRC) {
    artSetStatus("g-status",
      "load a photo first — the placeholder bust never mints", "err");
    return;
  }

  var col = artCollection(ART_SEED, size, ART_CFG);
  if (col.error) { artSetStatus("g-status", col.error, "err"); return; }
  for (var i = 0; i < col.items.length; i++) {
    if (b64bytes(col.items[i].bytes) > ART_EMBED_BUDGET) {
      artSetStatus("g-status", "item #" + col.items[i].idx +
        " exceeds the on-chain budget - simplify the design", "err");
      return;
    }
  }

  /* wallet icon: an external https URL wins; otherwise the chosen item
   * (default #1) is rasterized. State images embed either way. */
  var iconUrl = $("g-iconurl").value.trim();
  if (iconUrl) {
    if (safeUrl(iconUrl) === "") {
      artSetStatus("g-status",
        "external icon must be a plain https:// image URL", "err");
      return;
    }
  }
  /* optional token-metadata links (engine passes them to tokencreate) */
  var externalUrl = $("g-externalurl").value.trim();
  if (externalUrl && safeUrl(externalUrl) === "") {
    artSetStatus("g-status", "external URL must be a plain https:// URL", "err");
    return;
  }
  var webValidate = $("g-webvalidate").value.trim();
  if (webValidate && safeUrl(webValidate) === "") {
    artSetStatus("g-status", "web validation must be a plain https:// URL", "err");
    return;
  }
  var iconItem = Math.max(1, Math.min(size,
    parseInt($("g-iconitem").value, 10) || 1));

  /* per-item traits, sealed into token metadata by the engine (idx ->
   * attributes) — same shape the Android engine writes, so both clients'
   * viewers read one convention */
  var traitsMap = {};
  for (var ti = 0; ti < col.items.length; ti++) {
    var attrs = [];
    var ts = col.items[ti].traits || [];
    for (var tk = 0; tk < ts.length; tk++) {
      attrs.push({ trait_type: ts[tk].label, value: ts[tk].value });
    }
    traitsMap["" + col.items[ti].idx] = attrs;
  }

  artSetStatus("g-status", "preparing mint…");
  $("g-mint-btn").disabled = true;

  function withGenIcon(cb) {
    if (iconUrl) { cb(iconUrl); return; }
    svgToIconB64(col.items[iconItem - 1].svg, function (b64) {
      if (!b64) { toast("icon rasterize failed — wallet shows default"); cb(""); return; }
      /* Regular wallets DOMParse token.url as strict XML, so the icon must be
       * a CLOSED <artimage>B64</artimage> element. The engine prepends only
       * the open tag; the close is appended here — together they form the
       * well-formed element. test/run.sh fails if engine.js ever closes it. */
      cb(b64 + "</artimage>");
    });
  }

  var maxImg = 0;
  for (var mi = 0; mi < col.items.length; mi++) {
    var ib = b64bytes(col.items[mi].bytes);
    if (ib > maxImg) { maxImg = ib; }
  }

  withGenIcon(function (iconRaw) {
    /* JOINT budget guard: the definition (exact, not estimated) and the
     * largest image must fit one transfer together — refuse or slim the icon
     * rather than seal lots that can never leave the wallet */
    var defA = artDefActual(name, desc, size, iconRaw, externalUrl, traitsMap);
    var errA = artJointBudgetError(defA, maxImg);
    if (errA && !iconUrl && col.items.length) {
      svgToIconB64(col.items[iconItem - 1].svg, function (slim) {
        var slimIcon = slim ? slim + "</artimage>" : "";
        var defB = artDefActual(name, desc, size, slimIcon, externalUrl, traitsMap);
        if (slim && artJointBudgetError(defB, maxImg) === null) {
          toast("icon slimmed to keep every lot transferable");
          artMintGo(slimIcon);
        } else {
          artSetStatus("g-status", errA, "err");
          $("g-mint-btn").disabled = false;
        }
      }, 3500);
      return;
    }
    if (errA) {
      artSetStatus("g-status", errA, "err");
      $("g-mint-btn").disabled = false;
      return;
    }
    artMintGo(iconRaw);
  });

  function artMintGo(iconB64) {
    MDS.cmd("getaddress", function (res) {
      if (!res.status) {
        artSetStatus("g-status", "getaddress failed", "err");
        $("g-mint-btn").disabled = false;
        return;
      }
      var addr = res.response.address;
      var pk = res.response.publickey;
      MDS.sql(
        "INSERT INTO collections (name,description,mode,size,base,ext,phase," +
        "posted,creatoraddr,creatorpk,origin,icon,webvalidate,externalurl,itemtraits) VALUES ('" +
        engineSqlEsc(name) + "','" + engineSqlEsc(desc) + "','embed'," + size +
        ",'','','CREATE',0,'" + addr + "','" + pk + "','created','" +
        engineSqlEsc(iconB64) + "','" + engineSqlEsc(webValidate) + "','" +
        engineSqlEsc(externalUrl) + "','" + engineSqlEsc(JSON.stringify(traitsMap)) + "')",
        function () {
          MDS.sql("SELECT id FROM collections WHERE name='" +
                  engineSqlEsc(name) + "' ORDER BY id DESC LIMIT 1",
            function (r2) {
              var cid = r2.rows[0].ID;
              MDS.sql("UPDATE collections SET iscreator=1 WHERE id=" + cid,
                      function () {});
              (function insertNext(k) {
                if (k >= col.items.length) { artFinishMint(cid, col); return; }
                MDS.sql("INSERT INTO items (collectionid,idx,image) VALUES (" +
                  cid + "," + col.items[k].idx + ",'" +
                  btoa(col.items[k].svg) + "')",
                  function () { insertNext(k + 1); });
              })(0);
            });
        });
    });
  }
};

function artFinishMint(cid, col) {
  // provenance: seed + config + per-item traits, so the design is reproducible
  var meta = [];
  for (var i = 0; i < col.items.length; i++) {
    meta.push({ idx: col.items[i].idx, key: col.items[i].key,
                score: col.items[i].score, traits: col.items[i].traits });
  }
  MDS.sql("INSERT INTO art_meta (collectionid,seed,config,items) VALUES (" +
    cid + ",'" + engineSqlEsc(ART_SEED) + "','" +
    engineSqlEsc(JSON.stringify(ART_CFG)) + "','" +
    engineSqlEsc(JSON.stringify(meta)) + "')",
    function () {
      MDS.comms.solo("mint", function () {});
      artSetStatus("g-status",
        "minting started — runs in the background, watch the Catalogue", "ok");
      $("g-mint-btn").disabled = false;
      toast("Minting started");
      studioShow("hub");
      show("view-collections");
      loadCollectionList();
    });
}

/* ---------- export: store-only zip (no dependencies) ---------- */

var CRC_TABLE = (function () {
  var t = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function strBytes(s) {
  // UTF-8 encode
  var u = unescape(encodeURIComponent(s));
  var b = new Uint8Array(u.length);
  for (var i = 0; i < u.length; i++) { b[i] = u.charCodeAt(i); }
  return b;
}

function le16(v) { return [v & 255, (v >> 8) & 255]; }
function le32(v) {
  return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
}

function makeZip(files) {
  var parts = [];
  var central = [];
  var offset = 0;
  for (var i = 0; i < files.length; i++) {
    var nameB = strBytes(files[i].name);
    var data = strBytes(files[i].data);
    var crc = crc32(data);
    var head = [].concat(
      [0x50, 0x4B, 3, 4], le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(crc), le32(data.length), le32(data.length),
      le16(nameB.length), le16(0));
    parts.push(new Uint8Array(head), nameB, data);
    var cent = [].concat(
      [0x50, 0x4B, 1, 2], le16(20), le16(20), le16(0), le16(0), le16(0),
      le16(0), le32(crc), le32(data.length), le32(data.length),
      le16(nameB.length), le16(0), le16(0), le16(0), le16(0), le32(0),
      le32(offset));
    central.push(new Uint8Array(cent), nameB);
    offset += head.length + nameB.length + data.length;
  }
  var centralLen = 0;
  for (var j = 0; j < central.length; j++) { centralLen += central[j].length; }
  var end = [].concat(
    [0x50, 0x4B, 5, 6], le16(0), le16(0), le16(files.length),
    le16(files.length), le32(centralLen), le32(offset), le16(0));
  var all = parts.concat(central, [new Uint8Array(end)]);
  return new Blob(all, { type: "application/zip" });
}

function downloadBlob(name, data, mime) {
  var blob = (data instanceof Blob) ? data : new Blob([data], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

$("g-export-btn").onclick = function () {
  var size = artMintSize();
  var col = artCollection(ART_SEED, size, ART_CFG);
  if (col.error) { artSetStatus("g-status", col.error, "err"); return; }
  var files = [];
  var meta = { name: $("g-name").value.trim() || "atelier-collection",
               seed: ART_SEED, generator: "Atelier 4.1.8", items: [] };
  for (var i = 0; i < col.items.length; i++) {
    var it = col.items[i];
    files.push({ name: ("00" + it.idx).slice(-3) + ".svg", data: it.svg });
    meta.items.push({ idx: it.idx, file: ("00" + it.idx).slice(-3) + ".svg",
                      key: it.key, score: it.score, traits: it.traits });
  }
  meta.config = ART_CFG;
  files.push({ name: "metadata.json", data: JSON.stringify(meta, null, 2) });
  downloadBlob(meta.name.replace(/[^A-Za-z0-9_-]+/g, "_") + ".zip",
               makeZip(files), "application/zip");
  toast(size + " SVGs + metadata.json exported");
};

/* ---------- persistence ---------- */

function artSaveStudio() {
  MDS.keypair.set("studio", JSON.stringify(ART_STUDIO), function () {});
}

function artLoadStudio(cb) {
  MDS.keypair.get("studio", function (res) {
    if (res.status && res.value) {
      try {
        var s = JSON.parse(res.value);
        if (s.cfgs) {
          ART_STUDIO = s;
          /* drop configs for styles that no longer exist; migrate the rest
           * onto the current slot set (new slots appear with defaults,
           * user rarity edits survive) */
          for (var k in ART_STUDIO.cfgs) {
            if (!ART_STUDIO.cfgs.hasOwnProperty(k)) { continue; }
            if (!ART_STYLES[k]) { delete ART_STUDIO.cfgs[k]; }
            else { ART_STUDIO.cfgs[k] = artMigrateConfig(ART_STUDIO.cfgs[k]); }
          }
        }
        if (!ART_STUDIO.preview) { ART_STUDIO.preview = 12; }
      } catch (e) {}
    }
    ART_SEED = ART_STUDIO.seed || "atelier-genesis";
    $("art-seed").value = ART_SEED;
    artActivateStyle(ART_STUDIO.style);
    cb();
  });
}

/* ---------- boot + entry (driven from app.js) ---------- */

function artInitMetaTable(cb) {
  MDS.sql(
    "CREATE TABLE IF NOT EXISTS `art_meta` (" +
    " `id` bigint auto_increment primary key," +
    " `collectionid` bigint NOT NULL," +
    " `seed` varchar(256)," +
    " `config` clob," +
    " `items` clob)", cb);
}

var ART_BOOTED = false;
var ART_RENDERED = false;

/* called once from app.js's inited chain: tables + saved studio state */
function artStudioBoot(cb) {
  artLoadStudio(function () {
    ART_BOOTED = true;
    if (cb) { cb(); }
  });
}

/* called every time the № 4 wizard opens: lazy first render (18 style
 * thumbnails are not free), fresh preview thereafter */
function artStudioEnter() {
  if (!ART_RENDERED) {
    ART_RENDERED = true;
    artRenderStylePicker();
    artRenderSlots();
  }
  artRenderPreview();
}
