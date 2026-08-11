/* StateNFT Suite — "Private Viewing" UI.
 * Minting is executed by service.js (engine.js state machine); this page
 * writes collections into SQL and renders live progress.
 */

/* Transfers carry an embedded image TWICE (input coin proof + recreated
 * output state); 16000 b64 chars proven by image-budget-spike.sh (stamp +
 * transfer confirmed on-chain 2026-08-05, state intact). Wallet icons ride
 * in token metadata (proven cheap) at <= 6000. */
var IMG_BUDGET = 16000;
var ICON_BUDGET = 6000;

/* Correct data URI for a sealed b64 payload — sniffs the decoded magic bytes
 * (WebP/JPEG/PNG/SVG) so plates render with an honest mime everywhere. */
function b64src(b64) {
  try {
    var head = atob(String(b64).slice(0, 24));
    if (head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP") { return "data:image/webp;base64," + b64; }
    if (head.charCodeAt(0) === 0xFF && head.charCodeAt(1) === 0xD8) { return "data:image/jpeg;base64," + b64; }
    if (head.charCodeAt(0) === 0x89 && head.slice(1, 4) === "PNG") { return "data:image/png;base64," + b64; }
    var t = head.replace(/^\s+/, "").toLowerCase();
    if (t.indexOf("<svg") === 0 || t.indexOf("<?xml") === 0) { return "data:image/svg+xml;base64," + b64; }
  } catch (e) {}
  return "data:image/jpeg;base64," + b64;
}


/* Wallet icons are ALWAYS square — wallet tiles are square, and a portrait
 * plate dropped in raw letterboxes into an ugly sliver. Cover-crop center,
 * <=512px, WebP with JPEG fallback, within ICON_BUDGET. */
function squareIconFromImage(img) {
  var side0 = Math.min(img.width, img.height);
  var sx = (img.width - side0) / 2, sy = (img.height - side0) / 2;
  var dims = [512, 400, 320, 240, 180];
  var quals = [0.88, 0.78, 0.68, 0.6];
  for (var d = 0; d < dims.length; d++) {
    var side = Math.min(dims[d], side0) || dims[d];
    var cv = document.createElement("canvas");
    cv.width = side; cv.height = side;
    cv.getContext("2d").drawImage(img, sx, sy, side0, side0, 0, 0, side, side);
    for (var q = 0; q < quals.length; q++) {
      var url = cv.toDataURL("image/webp", quals[q]);
      if (url.indexOf("data:image/webp") !== 0) { url = cv.toDataURL("image/jpeg", quals[q]); }
      var b64 = url.split(",")[1];
      if (b64.length <= ICON_BUDGET) { return b64; }
    }
  }
  return "";
}

function compressIconFile(file, cb) {
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () { cb(squareIconFromImage(img)); };
    img.onerror = function () { cb(null); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function squareIconFromB64(b64, cb) {
  var img = new Image();
  img.onload = function () { cb(squareIconFromImage(img)); };
  img.onerror = function () { cb(""); };
  img.src = b64src(b64);
}

var TOKENID = "";
var META = null;          // metadata of the open collection
var OPEN_ROW = null;      // SQL row when viewing a listed collection
var CURRENT = null;       // coin being transferred
var WIZ_IMAGES = [];      // base64 per wizard slot
var WIZ_ICON = "";        // base64 wallet icon (upload)

function $(id) { return document.getElementById(id); }

/* ---------- helpers ---------- */
/* safeUrl / cssUrl / iconSrc / placeholderSVG live in sanitize.js so they can
 * be unit-tested without a DOM - see test/sanitize.test.js */

function stateVar(coin, port) {
  var s = coin.state || [];
  for (var i = 0; i < s.length; i++) {
    if (s[i].port == port) { return "" + s[i].data; }
  }
  return null;
}

function toast(msg, ms) {
  var t = $("toast");
  t.innerText = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.add("hidden"); }, ms || 4000);
}

function shortHash(h) {
  if (!h || h.length < 16) { return h || ""; }
  return h.substring(0, 8) + "…" + h.substring(h.length - 6);
}

function copyText(txt, el) {
  function mark() {
    if (!el) { return; }
    el.classList.add("copied");
    setTimeout(function () { el.classList.remove("copied"); }, 900);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(mark, mark);
  } else {
    var ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta);
    ta.select(); document.execCommand("copy");
    document.body.removeChild(ta); mark();
  }
  toast("copied " + shortHash(txt));
}

function hashChip(el, full) {
  el.innerText = shortHash(full) + " ⧉";
  el.onclick = function (e) { e.stopPropagation(); copyText(full, el); };
}




function coinImage(coin, idx) {
  var p1 = coin ? stateVar(coin, 1) : null;
  if (p1) {
    // base64 payload from coin state: strip the bracket wrapper and allow only
    // base64 characters, so it can never carry a different data: payload
    var b64 = p1.replace(/^\[/, "").replace(/\]$/, "");
    if (/^[A-Za-z0-9+/=]*$/.test(b64)) {
      return b64src(b64);
    }
    return placeholderSVG(idx);
  }
  if (META && META.mode !== "embed" && META.base) {
    var base = safeUrl(META.base);        // http(s) only - no javascript:/data:
    if (base) { return base + idx + (META.ext || ".png"); }
  }
  return placeholderSVG(idx);
}

/* ---------- web-validation shield (wallet-style badge) ---------- */

var VALID_CACHE = {};   // tokenid -> { web, url, block }
var CUR_BLOCK = 0;


function webLinkEl(url) {
  var a = document.createElement("a");
  a.className = "lr-link";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  var safe = safeUrl(url);
  if (safe) { a.href = safe; }
  a.textContent = url || "";          // text node - never parsed as HTML
  a.onclick = function (e) { e.stopPropagation(); };
  return a;
}

function shieldSVG() {
  return "<svg viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path d='M12 2 L20 5 V11 C20 16.5 16.6 20.4 12 22 C7.4 20.4 4 16.5 4 11 V5 Z'" +
    " fill='#D8B76E'/>" +
    "<path d='M8.2 11.8 L11 14.6 L16 9.2' stroke='#14100A' stroke-width='2.4'" +
    " fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>";
}

function makeShield(cls, url) {
  var el = document.createElement("span");
  el.className = "vshield " + cls;
  el.title = "web validated · " + (url || "");
  el.innerHTML = shieldSVG();
  el.onclick = function (e) {
    e.stopPropagation();
    var safe = safeUrl(url);
    if (safe) { window.open(safe, "_blank", "noopener,noreferrer"); }
  };
  return el;
}

function checkValidation(tid, cb) {
  if (!tid) { cb(null); return; }
  var c = VALID_CACHE[tid];
  if (c && CUR_BLOCK - c.block < 20) { cb(c); return; }
  MDS.cmd("tokenvalidate tokenid:" + tid, function (res) {
    var v = { web: false, url: "", block: CUR_BLOCK };
    if (res.status && res.response && res.response.web) {
      v.web = !!res.response.web.valid;
      v.url = res.response.web.url || "";
    }
    VALID_CACHE[tid] = v;
    cb(v);
  });
}

function attachShield(container, cls, tid) {
  checkValidation(tid, function (v) {
    var old = container.querySelector(".vshield");
    if (old) { old.remove(); }
    if (!v || !v.web) { return; }
    // the hero plate shield only makes sense on a visible icon
    if (cls === "vshield-plate" && $("d-icon").classList.contains("hidden")) { return; }
    container.appendChild(makeShield(cls, v.url));
  });
}

/* ---------- navigation ---------- */

function show(view) {
  ["view-collections", "view-create", "view-filtr", "view-detail"].forEach(function (v) {
    $(v).classList.add("hidden");
  });
  $(view).classList.remove("hidden");
  $("tab-collections").classList.toggle("tab-active", view === "view-collections");
  $("tab-create").classList.toggle("tab-active", view === "view-create");
  $("tab-filtr").classList.toggle("tab-active", view === "view-filtr");
}

/* ---------- collections home ---------- */

function skeletons(container, cls, n) {
  container.innerHTML = "";
  for (var i = 0; i < n; i++) {
    var s = document.createElement("div");
    s.className = "skel " + cls;
    container.appendChild(s);
  }
}

function loadCollectionList() {
  MDS.sql("SELECT * FROM collections ORDER BY id DESC", function (res) {
    var rows = res.rows || [];
    var list = $("collection-list");
    list.innerHTML = "";
    var live = rows.filter(function (r) { return r.PHASE !== "BURIED"; });
    // Burial means gone: a fresh grave shows for 50 blocks (so you can see
    // what you just buried), then the row leaves the catalogue forever.
    var buried = rows.filter(function (r) {
      if (r.PHASE !== "BURIED") { return false; }
      var at = parseInt(r.BURIEDAT, 10) || 0;
      return at > 0 && CUR_BLOCK > 0 && (CUR_BLOCK - at) <= 50;
    });
    $("collections-empty").classList.toggle("hidden", (live.length + buried.length) > 0);
    live.forEach(function (row) { list.appendChild(collectionCard(row)); });
    if (buried.length) {
      var head = document.createElement("p");
      head.className = "graveyard-head";
      head.style.gridColumn = "1 / -1";
      head.innerText = "Graveyard · " + buried.length + " buried";
      list.appendChild(head);
      buried.forEach(function (row) {
        var card = collectionCard(row);
        card.classList.add("buried");
        list.appendChild(card);
      });
    }
  });
}

function collectionCard(row) {
  var el = document.createElement("div");
  el.className = "collection-card";
  var phase = row.PHASE;
  var badge;
  if (phase === "DONE") {
    badge = "<span class='badge badge-done'>◆ minted</span>";
  } else if (phase === "BURIED") {
    badge = "<span class='badge badge-buried'>&#8224; buried</span>";
  } else if (phase === "BURY") {
    badge = "<span class='badge badge-live'>&#8224; burying&hellip;</span>";
  } else if (phase === "NEEDIMAGES") {
    badge = "<span class='badge badge-err'>✕ needs images</span>";
  } else if (phase === "DAMAGED") {
    badge = "<span class='badge badge-err'>✕ duplicate seals</span>";
  } else if (row.ERROR) {
    badge = "<span class='badge badge-err'>✕ error</span>";
  } else {
    badge = "<span class='badge badge-live'>◐ minting · " + phase.toLowerCase() + "</span>";
  }
  var who = (parseInt(row.ISCREATOR, 10) === 1)
    ? "<span class='badge badge-done'>◆ minted by you</span>"
    : "<span class='badge badge-dim'>third-party</span>";

  // badge/who are our own literals; row.NAME is untrusted chain metadata and
  // goes in as a text node, never as markup.
  el.innerHTML =
    "<div class='cc-cover'></div>" +
    "<div class='cc-strip'>" +
    "<div class='cc-name'></div>" +
    "<div class='cc-meta'>" + (parseInt(row.SIZE, 10) || 0) + " items · " +
    (row.MODE === "embed" ? "on-chain" : "hosted") + "</div>" +
    "<div class='cc-badges'>" + badge + who + "</div></div>";
  el.querySelector(".cc-name").textContent = row.NAME || "Untitled";

  setCover(el.querySelector(".cc-cover"), row);
  if (row.TOKENID) { attachShield(el, "vshield-card", row.TOKENID); }
  el.onclick = function () { openOwn(row); };
  return el;
}

function setCover(coverEl, row) {
  function apply(src) {
    // preload so a dead URL falls back to icon/placeholder instead of blank
    var safe = cssUrl(src);
    if (!safe) { safe = placeholderSVG(1); }
    var probe = new Image();
    probe.onload = function () {
      coverEl.style.backgroundImage = "url(\"" + safe + "\")";
    };
    probe.onerror = function () {
      var fb = cssUrl(iconSrc(row.ICON)) || placeholderSVG(1);
      if (fb !== safe) { coverEl.style.backgroundImage = "url(\"" + fb + "\")"; }
    };
    probe.src = safe;
  }
  // 1. item #1 image from our items table (created collections)
  MDS.sql("SELECT image FROM items WHERE collectionid=" + row.ID +
          " AND idx=1", function (r) {
    var img = (r.rows && r.rows.length) ? r.rows[0].IMAGE : "";
    if (img) {
      apply(img.indexOf("http") === 0 ? img : b64src(img));
      return;
    }
    // 2. url-mode derivable
    if (row.MODE === "url" && row.BASE) {
      apply(row.BASE + "1" + (row.EXT || ".png"));
      return;
    }
    // 3. embed-mode adopted: pull item #1's image from coin state
    if (row.TOKENID) {
      MDS.cmd("coins relevant:true tokenid:" + row.TOKENID, function (res) {
        var cs = res.status ? res.response : [];
        for (var i = 0; i < cs.length; i++) {
          if (stateVar(cs[i], 0) === "1" && stateVar(cs[i], 1)) {
            apply(b64src(stateVar(cs[i], 1).replace(/^\[/, "").replace(/\]$/, "")));
            return;
          }
        }
        apply(iconSrc(row.ICON) || placeholderSVG(1));
      });
      return;
    }
    apply(iconSrc(row.ICON) || placeholderSVG(1));
  });
}

function openOwn(row) {
  SELF_HEALED = false;
  OPEN_ROW = row;
  TOKENID = row.TOKENID || "";
  META = { name: row.NAME, description: row.DESCRIPTION, mode: row.MODE,
           base: row.BASE, ext: row.EXT, size: parseInt(row.SIZE, 10),
           url: row.ICON };
  showDetail();
}

function openExternal(tid) {
  tid = tid.trim();
  if (tid.indexOf("0x") !== 0) { toast("tokenid must start 0x"); return; }
  MDS.cmd("tokens tokenid:" + tid, function (res) {
    if (!res.status) { toast("token not found on this node"); return; }
    SELF_HEALED = false;
    OPEN_ROW = null;
    TOKENID = tid;
    var t = res.response;
    META = (typeof t.name === "object") ? t.name : { name: "" + t.name };
    if (!META.size) { META.size = parseInt(t.total) || 0; }
    META.script = t.script || "";
    rememberOpened(tid, META, t.script || "");
    showDetail();
  });
}

function rememberOpened(tid, meta, script) {
  MDS.sql("SELECT id FROM collections WHERE tokenid='" + tid + "'", function (r) {
    if (r.rows && r.rows.length) { return; }
    // Only genuine StateNFTs earn a collections row — filing a regular NFT
    // here turns it into a phantom collection (the Jazminima bug). Anything
    // else is still fully viewable via the detail META path, just not stored.
    var pk = engineStateNftPk(script);
    if (!pk) { return; }
    function insert(iscreator) {
      MDS.sql(
        "INSERT INTO collections (name,description,mode,size,base,ext,tokenid," +
        "phase,posted,creatoraddr,creatorpk,origin,icon,iscreator) VALUES ('" +
        engineSqlEsc(meta.name || "Unknown") + "','" +
        engineSqlEsc(meta.description || "") + "','" + (meta.mode || "url") +
        "'," + (parseInt(meta.size, 10) || 0) + ",'" +
        engineSqlEsc(meta.base || "") + "','" + engineSqlEsc(meta.ext || "") +
        "','" + tid + "','DONE',1,'','" + pk + "','opened','" +
        engineSqlEsc(meta.url || "") + "'," + (iscreator ? 1 : 0) + ")",
        function () { loadCollectionList(); });
    }
    if (!pk) { insert(false); return; }
    MDS.cmd("keys action:list publickey:" + pk, function (kr) {
      var keys = kr.status && kr.response ? (kr.response.keys || kr.response) : [];
      var mine = false;
      (keys.length ? keys : []).forEach(function (k) {
        if (k.publickey === pk) { mine = true; }
      });
      insert(mine);
    });
  });
}

/* ---------- detail : Catalogue Raisonné ---------- */

var FILTER = "all";
var SORT_ASC = true;
var INSPECT = null;    // { idx, byIdx, mineIds, size } while the Loupe is open

function showDetail() {
  show("view-detail");
  FILTER = "all"; SORT_ASC = true;
  syncFilterTabs();
  $("d-name").innerText = META.name || "Untitled";
  $("d-desc").innerText = META.description || "";

  var ic = iconSrc(META.url);
  $("d-icon").classList.toggle("hidden", !ic);
  var icCss = cssUrl(ic);
  $("hero-ambient").style.backgroundImage = icCss ? "url(\"" + icCss + "\")" : "none";
  if (ic) { $("d-icon").src = ic; }

  $("d-owner").classList.toggle("hidden", !META.owner);
  if (META.owner) { $("d-owner").innerText = "by " + META.owner; }
  var iscreator = OPEN_ROW && parseInt(OPEN_ROW.ISCREATOR, 10) === 1;
  $("d-creator").classList.toggle("hidden", !iscreator);

  var ext = safeUrl(META.external_url || (OPEN_ROW && OPEN_ROW.EXTERNALURL) || "");
  $("d-external").classList.toggle("hidden", !ext);
  if (ext) {
    $("d-external").href = safeUrl(ext);
    $("d-external").innerText =
      ext.replace(/^https?:\/\//, "").substring(0, 34) + " ↗";
  }

  if (TOKENID) { hashChip($("d-tokenid"), TOKENID); }
  else { $("d-tokenid").innerText = "token not created yet"; }

  $("ledger").classList.toggle("hidden", !TOKENID);
  $("holdings").classList.add("hidden");
  $("filter-row").classList.add("hidden");
  $("contract-pre").classList.add("hidden");
  if (TOKENID) {
    refreshProvenance();
    attachShield($("plate-wrap"), "vshield-plate", TOKENID);
  }

  skeletons($("gallery"), "skel-nft", Math.min(META.size || 4, 8));
  refreshDetail();
}

function ledgerState(rowEl, state) {   // 'ok' | 'bad' | 'none' | 'pending'
  rowEl.classList.remove("lr-ok", "lr-bad", "lr-pending");
  var g = rowEl.querySelector(".lr-glyph");
  if (state === "ok") { rowEl.classList.add("lr-ok"); g.innerHTML = "&#9670;"; }
  else if (state === "bad") { rowEl.classList.add("lr-bad"); g.innerHTML = "&#10005;"; }
  else if (state === "pending") { rowEl.classList.add("lr-pending"); g.innerHTML = "&#9670;"; }
  else { g.innerHTML = "&#9476;"; }
}

function refreshProvenance() {
  ledgerState($("lr-sig"), "pending");
  ledgerState($("lr-web"), "pending");
  MDS.cmd("tokenvalidate tokenid:" + TOKENID, function (res) {
    if (!res.status) {
      ledgerState($("lr-sig"), "none");
      $("lr-sig-val").innerText = "validation unavailable";
      ledgerState($("lr-web"), "none");
      $("lr-web-val").innerText = "—";
      return;
    }
    var v = res.response;
    var sig = v.signature || {};
    if (sig.signed && sig.valid) {
      ledgerState($("lr-sig"), "ok");
      $("lr-sig-val").innerText = shortHash(sig.signedby) + " · signed · valid";
    } else if (sig.signed) {
      ledgerState($("lr-sig"), "bad");
      $("lr-sig-val").innerText = "signature INVALID";
    } else {
      ledgerState($("lr-sig"), "none");
      $("lr-sig-val").innerText = "unsigned — creator proven by contract & stamping";
    }
    var web = v.web || {};
    // keep the shield cache + hero badge in sync with the freshest check
    VALID_CACHE[TOKENID] = { web: !!web.valid, url: web.url || "", block: CUR_BLOCK };
    attachShield($("plate-wrap"), "vshield-plate", TOKENID);

    var wv = $("lr-web-val");
    wv.innerHTML = "";
    if (web.webvalidate) {
      ledgerState($("lr-web"), web.valid ? "ok" : "bad");
      wv.appendChild(webLinkEl(web.url || ""));
      wv.appendChild(document.createTextNode(
        web.valid ? " · valid ✓ (re-checked each block)"
                  : " · " + (web.reason || "invalid")));
    } else {
      ledgerState($("lr-web"), "none");
      wv.innerText = "no web proof declared";
    }
  });
  MDS.cmd("tokens tokenid:" + TOKENID, function (res) {
    if (!res.status) { return; }
    var t = res.response;
    if (t.script) {
      META.script = t.script;
      $("lr-contract-val").innerText =
        "KISS VM · " + META.script.length + " chars — view script";
      $("contract-pre").innerText = META.script;
    }
    // enrich hero from on-chain metadata (owner/external_url/icon are not in
    // the local DB for dapp-created rows)
    if (typeof t.name === "object") {
      if (t.name.traits && !META.traits) { META.traits = t.name.traits; }
      if (t.name.owner && !META.owner) {
        META.owner = t.name.owner;
        $("d-owner").classList.remove("hidden");
        $("d-owner").innerText = "by " + META.owner;
      }
      if (t.name.external_url && !META.external_url) {
        META.external_url = t.name.external_url;
        $("d-external").classList.remove("hidden");
        $("d-external").href = safeUrl(META.external_url);
        $("d-external").innerText = META.external_url
          .replace(/^https?:\/\//, "").substring(0, 34) + " ↗";
      }
      if (t.name.url && !META.url) {
        META.url = t.name.url;
        var ic = iconSrc(META.url);
        if (ic) {
          $("d-icon").classList.remove("hidden");
          $("d-icon").src = ic;
          var icc = cssUrl(ic);
          if (icc) { $("hero-ambient").style.backgroundImage = "url(\"" + icc + "\")"; }
        }
      }
    }
  });
}

function refreshDetail() {
  if ($("view-detail").classList.contains("hidden")) { return; }
  if (OPEN_ROW) {
    MDS.sql("SELECT * FROM collections WHERE id=" + OPEN_ROW.ID, function (res) {
      if (res.rows && res.rows.length) { OPEN_ROW = res.rows[0]; }
      TOKENID = OPEN_ROW.TOKENID || TOKENID;
      if (TOKENID) { hashChip($("d-tokenid"), TOKENID); }
      renderProgress();
      renderGallery();
    });
  } else {
    $("mint-progress").classList.add("hidden");
    $("need-images").classList.add("hidden");
    renderGallery();
  }
}

var RAIL_ORDER = ["CREATE", "MOVE", "SPLIT", "STAMP", "DONE"];

function renderProgress() {
  var box = $("mint-progress");
  if (OPEN_ROW && OPEN_ROW.PHASE === "NEEDIMAGES") {
    box.classList.add("hidden");
    renderNeedImages();
    return;
  }
  $("need-images").classList.add("hidden");
  if (!OPEN_ROW || OPEN_ROW.PHASE === "DONE") { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");

  // DAMAGED parks the rail at the stamp step: the error line carries the story
  var at = RAIL_ORDER.indexOf(OPEN_ROW.PHASE === "DAMAGED" ? "STAMP" : OPEN_ROW.PHASE);
  $("rail-fill").style.width = (at / (RAIL_ORDER.length - 1) * 100) + "%";
  var nodes = box.querySelectorAll(".rail-node");
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].className = "rail-node" + (i < at ? " done" : (i === at ? " now" : ""));
  }
  $("mint-error").innerText = OPEN_ROW.ERROR || "";

  MDS.sql("SELECT idx, coinid FROM items WHERE collectionid=" + OPEN_ROW.ID +
          " ORDER BY idx", function (res) {
    var rows = res.rows || [];
    var done = 0;
    var chips = $("stamp-chips");
    chips.innerHTML = "";
    rows.forEach(function (r) {
      if (r.COINID) { done++; }
      var c = document.createElement("span");
      c.className = "chip" + (r.COINID ? " chip-done" : "");
      c.innerText = "#" + r.IDX;
      chips.appendChild(c);
    });
    $("mp-count").innerText = rows.length
      ? "No. " + done + " / " + rows.length + " stamped" : "";
  });
}

function renderGallery() {
  var g = $("gallery");
  if (!TOKENID) { g.innerHTML = ""; return; }
  MDS.cmd("coins relevant:true tokenid:" + TOKENID, function (mineRes) {
    var mine = mineRes.status ? mineRes.response : [];
    var mineIds = {};
    mine.forEach(function (c) { mineIds[c.coinid] = true; });
    MDS.cmd("coins tokenid:" + TOKENID, function (allRes) {
      var all = allRes.status ? allRes.response : [];
      var seen = {};
      var coins = [];
      all.concat(mine).forEach(function (c) {
        if (!seen[c.coinid]) { seen[c.coinid] = true; coins.push(c); }
      });
      renderCards(coins, mineIds);
    });
  });
}

/* A row marked DONE while the chain still shows unsealed lots is the
 * false-DONE of 2026-08-10 (reserved-but-dropped stamps counted as seals):
 * re-point the engine at the chain and let it finish. Once per visit. */
var SELF_HEALED = false;

function maybeSelfHeal(distinct, size) {
  if (SELF_HEALED || !OPEN_ROW || size <= 0 || distinct >= size) { return; }
  if (OPEN_ROW.PHASE !== "DONE" || parseInt(OPEN_ROW.ISCREATOR, 10) !== 1) { return; }
  SELF_HEALED = true;
  MDS.log("collection " + OPEN_ROW.ID + ": marked DONE but chain shows " +
          distinct + "/" + size + " sealed - self-recovering");
  toast("Chain shows " + distinct + " / " + size + " sealed — resuming this mint");
  MDS.cmd("block", function (bres) {
    var tip = bres.status ? parseInt(bres.response.block, 10) : 0;
    engineRecover(OPEN_ROW, tip, function () {
      /* a failed recover (chain unreadable) leaves the row on DONE —
       * unlatch so the next refresh retries instead of going silent */
      MDS.sql("SELECT phase FROM collections WHERE id=" + OPEN_ROW.ID, function (r) {
        if (r.rows && r.rows.length && r.rows[0].PHASE === "DONE") { SELF_HEALED = false; }
        refreshDetail();
      });
    });
  });
}

function itemStatus(coin, mineIds) {
  if (!coin) { return "unseen"; }
  if (coin.address === GRAVEYARD) { return "entombed"; }
  return mineIds[coin.coinid] ? "mine" : "held";
}

function renderCards(coins, mineIds) {
  var byIdx = {};
  var rawMine = 0;   // ALL owned coins of the token, stamped or not
  coins.forEach(function (c) {
    if (mineIds[c.coinid]) { rawMine++; }
    var idx = stateVar(c, 0);
    if (idx !== null && idx !== "0") { byIdx[idx] = c; }
  });
  var size = META.size || Object.keys(byIdx).length;
  LAST = { byIdx: byIdx, mineIds: mineIds, size: size, rawMine: rawMine };
  maybeSelfHeal(Object.keys(byIdx).length, size);

  // holdings distribution (entombed counts with held for the bar)
  var counts = { mine: 0, held: 0, unseen: 0, entombed: 0 };
  for (var i = 1; i <= size; i++) {
    counts[itemStatus(byIdx["" + i], mineIds)]++;
  }
  counts.held += counts.entombed;
  // danger row: EVERY listed collection offers exactly one action -
  // own coins -> bury (on-chain, safeguarded); own nothing -> remove the
  // list entry (bookkeeping only). Hidden only mid-burial.
  var burying = OPEN_ROW && OPEN_ROW.PHASE === "BURY";
  $("danger-row").classList.toggle("hidden", !OPEN_ROW || burying);
  $("bury-btn").classList.toggle("hidden", !(rawMine > 0));
  /* Recover is offered while a mint of ours is still unfinished */
  $("recover-btn").classList.toggle("hidden",
    !(OPEN_ROW && parseInt(OPEN_ROW.ISCREATOR, 10) === 1 && OPEN_ROW.PHASE &&
      OPEN_ROW.PHASE !== "DONE" && OPEN_ROW.PHASE !== "BURIED" &&
      OPEN_ROW.PHASE !== "DAMAGED"));
  $("sendall-btn").classList.toggle("hidden", !(rawMine > 0));
  $("remove-btn").classList.toggle("hidden", rawMine > 0);
  $("holdings").classList.remove("hidden");
  var line = "No. " + counts.mine + " of " + size + " in this wallet";
  if (counts.held) { line += " — " + counts.held + " held elsewhere"; }
  if (counts.unseen) { line += (counts.held ? "," : " —") + " " + counts.unseen + " unseen"; }
  $("holdings-line").innerText = line;
  $("hb-mine").style.width = (counts.mine / size * 100) + "%";
  $("hb-held").style.width = (counts.held / size * 100) + "%";
  $("hb-unseen").style.width = (counts.unseen / size * 100) + "%";
  $("holdings-stat").innerText = "items " + size + " · supply " + size;

  // filter + sort
  $("filter-row").classList.remove("hidden");
  var order = [];
  for (var n = 1; n <= size; n++) { order.push(n); }
  if (!SORT_ASC) { order.reverse(); }

  var g = $("gallery");
  g.innerHTML = "";
  var shown = 0;
  order.forEach(function (n) {
    var coin = byIdx["" + n];
    var st = itemStatus(coin, mineIds);
    var fst = st === "entombed" ? "held" : st;
    if (FILTER !== "all" && fst !== FILTER) { return; }
    shown++;
    var owned = st === "mine";
    var card = document.createElement("div");
    card.className = "card";
    var badge;
    if (!coin) { badge = "<span class='card-owner owner-unknown'>unseen</span>"; }
    else if (st === "entombed") { badge = "<span class='card-owner owner-other'>&#8224; entombed</span>"; }
    else if (owned) { badge = "<span class='card-owner owner-mine'>◆ mine</span>"; }
    else { badge = "<span class='card-owner owner-other'>held</span>"; }
    // no chain data in this markup - the image src is assigned as a property
    // below so a hostile base URL cannot break out of the attribute
    card.innerHTML =
      badge +
      "<div class='card-frame'><img alt='No. " + n + "' style='opacity:0'/></div>" +
      "<div class='card-body'>" +
      "<div class='card-index'>No. " + n + "</div>" +
      "<span class='chip-hash'></span>" +
      (owned ? "<button class='btn btn-gold'>Transfer</button>" : "") +
      "</div>";
    (function (imgEl, ix) {
      imgEl.onload = function () { imgEl.style.opacity = 1; };
      imgEl.onerror = function () {
        imgEl.onerror = null;
        imgEl.src = placeholderSVG(ix);
        imgEl.style.opacity = 1;
      };
      imgEl.src = coinImage(coin, ix);
    })(card.querySelector("img"), n);

    var chip = card.querySelector(".chip-hash");
    if (coin) { hashChip(chip, coin.coinid); }
    else { chip.innerText = "not tracked"; }

    if (owned) {
      card.querySelector("button").onclick = (function (c, ix) {
        return function (e) { e.stopPropagation(); openModal(c, ix); };
      })(coin, n);
    }
    card.onclick = (function (ix) {
      return function () { openInspector(ix); };
    })(n);
    g.appendChild(card);
  });
  $("showing").innerText = shown + "/" + size;
  if (INSPECT) { fillInspector(INSPECT.idx); }   // live-refresh open Loupe
}

var LAST = null;

function syncFilterTabs() {
  Array.prototype.forEach.call(document.querySelectorAll(".ftab[data-f]"), function (t) {
    t.classList.toggle("ftab-active", t.getAttribute("data-f") === FILTER);
  });
  $("sort-btn").innerHTML = SORT_ASC ? "No.&nbsp;&uarr;" : "No.&nbsp;&darr;";
}

/* ---------- The Loupe : item inspector ---------- */

function openInspector(idx) {
  if (!LAST) { return; }
  INSPECT = { idx: idx };
  document.body.style.overflow = "hidden";
  $("inspector").classList.remove("hidden");
  fillInspector(idx);
  document.addEventListener("keydown", inspectorKeys);
}

function closeInspector() {
  INSPECT = null;
  resetZoom();
  $("inspector").classList.add("hidden");
  document.body.style.overflow = "";
  document.removeEventListener("keydown", inspectorKeys);
}

function fillInspector(idx) {
  INSPECT.idx = idx;
  var size = LAST.size;
  var coin = LAST.byIdx["" + idx];
  var st = itemStatus(coin, LAST.mineIds);
  resetZoom();

  var img = $("insp-img");
  img.style.opacity = 0;
  var src = coinImage(coin, idx);
  img.onload = function () { img.style.opacity = 1; };
  img.onerror = function () { img.onerror = null; img.src = placeholderSVG(idx); };
  img.src = src;
  // pre-decode neighbours
  [idx % size + 1, (idx + size - 2) % size + 1].forEach(function (n) {
    var pre = new Image(); pre.src = coinImage(LAST.byIdx["" + n], n);
  });

  $("insp-caption-no").innerText = "· No. " + idx + " ·";
  $("lot-no").innerText = "No. " + idx;
  $("lot-of").innerText = "of " + size;
  $("lot-coll").innerText = META.name || "";
  var v = VALID_CACHE[TOKENID];
  var lotShield = $("lot-coll").parentNode.querySelector(".vshield");
  if (lotShield) { lotShield.remove(); }
  if (v && v.web) {
    $("lot-coll").parentNode.insertBefore(
      makeShield("vshield-inline", v.url), $("lot-owner"));
  }

  var badge = $("lot-owner");
  badge.className = "card-owner lot-badge " +
    (st === "mine" ? "owner-mine" : st === "held" ? "owner-other" : "owner-unknown");
  badge.innerText = st === "mine" ? "◆ mine" : st;

  hashChip($("lot-token"), TOKENID);
  if (coin) {
    hashChip($("lot-coin"), coin.coinid);
    hashChip($("lot-addr"), coin.address);
  } else {
    $("lot-coin").innerText = "not tracked";
    $("lot-addr").innerText = "—";
  }

  /* traits: token metadata `traits` map (idx -> attributes), sealed at mint
   * by either client's engine. Chain data — rendered via innerText only. */
  var tlist = META.traits ? META.traits["" + idx] : null;
  if (tlist && tlist.length) {
    var tt = $("lot-traits");
    tt.innerHTML = "";
    for (var tq = 0; tq < tlist.length; tq++) {
      var trow = tt.insertRow(-1);
      trow.insertCell(0).innerText = "" + (tlist[tq].trait_type || "");
      trow.insertCell(1).innerText = tlist[tq].value === undefined ? "" : "" + tlist[tq].value;
    }
    $("lot-traits-sec").classList.remove("hidden");
  } else {
    $("lot-traits-sec").classList.add("hidden");
  }

  $("cert-s0").innerText = "STATE:0 → " + idx + " · lot number";
  var p1 = coin ? stateVar(coin, 1) : null;
  $("cert-s1").innerText = p1
    ? "STATE:1 → image · " + (p1.length - 2).toLocaleString() + " chars embedded"
    : (META.mode === "url" ? "image hosted at base URL" : "STATE:1 → not visible on this node");

  var tip = parseInt(($("block-info").innerText || "").replace(/\D/g, ""), 10) || 0;
  if (coin && coin.created && tip) {
    var created = parseInt(coin.created, 10);
    var age = Math.max(0, tip - created);
    var days = Math.round(age * 50 / 86400 * 10) / 10;
    $("lot-age").innerText = age.toLocaleString() + " blocks · ≈ " + days + " days";
    $("lot-minted").innerText = "minted " + created.toLocaleString();
    $("lot-now").innerText = "now " + tip.toLocaleString();
  } else {
    $("lot-age").innerText = "—";
    $("lot-minted").innerText = "minted";
    $("lot-now").innerText = "now";
  }

  $("lot-desc").innerText = META.description || "";
  var ext = safeUrl(META.external_url || "");
  $("lot-external").classList.toggle("hidden", !ext);
  if (ext) {
    $("lot-external").href = safeUrl(ext);
    $("lot-external").innerText = ext.replace(/^https?:\/\//, "").substring(0, 30) + " ↗";
  }

  var mine = st === "mine";
  $("lot-transfer").classList.toggle("hidden", !mine);
  $("lot-copy").classList.toggle("hidden", !coin);
  $("lot-heldnote").classList.toggle("hidden", mine || !coin);
  $("lot-transfer").onclick = function () { if (coin) { openModal(coin, idx); } };
  $("lot-copy").onclick = function () { if (coin) { copyText(coin.coinid, null); } };
}

function inspNav(dir) {
  if (!INSPECT || !LAST) { return; }
  var n = INSPECT.idx + dir;
  if (n < 1) { n = LAST.size; }
  if (n > LAST.size) { n = 1; }
  fillInspector(n);
}

/* zoom: toggle scale(2.5) aimed at the pointer; pan by pointer while zoomed */
var ZOOMED = false;

function resetZoom() {
  ZOOMED = false;
  var f = $("insp-frame");
  f.classList.remove("zoomed");
  $("insp-img").style.transform = "";
}

function inspectorZoom(e) {
  var f = $("insp-frame");
  var img = $("insp-img");
  var r = f.getBoundingClientRect();
  var x = ((e.clientX - r.left) / r.width * 100).toFixed(1);
  var y = ((e.clientY - r.top) / r.height * 100).toFixed(1);
  if (!ZOOMED) {
    ZOOMED = true;
    f.classList.add("zoomed");
    img.style.transformOrigin = x + "% " + y + "%";
    img.style.transform = "scale(2.5)";
  } else {
    resetZoom();
  }
}

function inspectorAim(e) {
  if (!ZOOMED) { return; }
  var f = $("insp-frame");
  var r = f.getBoundingClientRect();
  var x = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100));
  var y = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
  var img = $("insp-img");
  img.style.transition = "none";
  img.style.transformOrigin = x.toFixed(1) + "% " + y.toFixed(1) + "%";
}

function inspectorKeys(e) {
  if (e.key === "ArrowLeft") { inspNav(-1); }
  else if (e.key === "ArrowRight") { inspNav(1); }
  else if (e.key === "Escape") {
    if (ZOOMED) { resetZoom(); } else { closeInspector(); }
  } else if (e.key === "z" || e.key === "Z" || e.key === "Enter") {
    var f = $("insp-frame");
    var r = f.getBoundingClientRect();
    inspectorZoom({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  } else if ((e.key === "t" || e.key === "T") && INSPECT) {
    var coin = LAST.byIdx["" + INSPECT.idx];
    if (coin && LAST.mineIds[coin.coinid]) { openModal(coin, INSPECT.idx); }
  } else if ((e.key === "c" || e.key === "C") && INSPECT) {
    var c2 = LAST.byIdx["" + INSPECT.idx];
    if (c2) { copyText(c2.coinid, null); }
  }
}

/* touch: swipe to navigate / close */
var TOUCH = null;

function inspTouchStart(e) {
  if (e.touches.length === 1) {
    TOUCH = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}

function inspTouchEnd(e) {
  if (!TOUCH) { return; }
  var dx = e.changedTouches[0].clientX - TOUCH.x;
  var dy = e.changedTouches[0].clientY - TOUCH.y;
  TOUCH = null;
  if (ZOOMED) { return; }
  if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)) {
    inspNav(dx < 0 ? 1 : -1);
  } else if (dy >= 80) {
    closeInspector();
  }
}

/* ---------- NEEDIMAGES recovery ---------- */

var NEED_IMAGES = {};
var NEED_COUNT = 0;

/* recovery images obey the SAME signed envelope as fresh mints — the row's
 * real record decides the image budget */
function needImagesBudget() {
  if (!OPEN_ROW) { return IMG_BUDGET; }
  var traits = null;
  try { traits = OPEN_ROW.ITEMTRAITS ? JSON.parse(OPEN_ROW.ITEMTRAITS) : null; } catch (e) {}
  var metaLen = JSON.stringify(artExactMeta(OPEN_ROW.NAME, OPEN_ROW.DESCRIPTION,
    parseInt(OPEN_ROW.SIZE, 10) || 0, OPEN_ROW.ICON || "", OPEN_ROW.EXTERNALURL || "",
    traits)).length;
  var env = engineEnvelope(metaLen);
  return env.ok ? Math.min(IMG_BUDGET, env.imageBudget) : 4000;
}

function renderNeedImages() {
  var box = $("need-images");
  box.classList.remove("hidden");
  MDS.cmd("coins relevant:true tokenid:" + TOKENID, function (res) {
    var stamped = {};
    (res.status ? res.response : []).forEach(function (c) {
      var idx = stateVar(c, 0);
      if (idx !== null) { stamped[idx] = true; }
    });
    var slots = $("need-slots");
    slots.innerHTML = "";
    var size = parseInt(OPEN_ROW.SIZE, 10);
    NEED_COUNT = 0;
    var missing = [];
    for (var mi = 1; mi <= size; mi++) {
      if (!stamped["" + mi]) { missing.push(mi); }
    }
    if (missing.length === 0) {
      // stale record: the chain says every item is stamped - heal to DONE
      box.classList.add("hidden");
      MDS.sql("UPDATE collections SET phase='DONE', error='' WHERE id=" +
              OPEN_ROW.ID, function () {
        toast("All items are already stamped on-chain — collection is complete");
        refreshDetail();
      });
      return;
    }
    $("need-status").innerText = missing.length + " of " + size +
      " items still need images";
    for (var i = 1; i <= size; i++) {
      if (stamped["" + i]) { continue; }
      NEED_COUNT++;
      (function (idx) {
        var slot = document.createElement("label");
        slot.className = "image-slot";
        var img = NEED_IMAGES[idx];
        slot.innerHTML =
          (img ? "<img src='" + b64src(img) + "'/>"
               : "<span class='slot-num'>" + idx + "</span><span class='slot-hint'>add image</span>") +
          "<input type='file' accept='image/*' class='slot-input'/>";
        slot.querySelector("input").onchange = function (e) {
          var f = e.target.files[0];
          if (!f) { return; }
          compressImage(f, needImagesBudget(), function (b64) {
            if (!b64) { toast("could not process image"); return; }
            NEED_IMAGES[idx] = b64;
            renderNeedImages();
          });
        };
        slots.appendChild(slot);
      })(i);
    }
  });
}

function saveNeedImages() {
  var idxs = Object.keys(NEED_IMAGES);
  if (idxs.length < NEED_COUNT) {
    $("need-status").innerText = "all " + NEED_COUNT +
      " missing items need an image before the mint can resume";
    return;
  }
  var pending = idxs.slice();
  (function insertNext() {
    if (!pending.length) {
      MDS.sql("UPDATE collections SET phase='MOVE', error='' WHERE id=" +
              OPEN_ROW.ID, function () {
        NEED_IMAGES = {};
        MDS.comms.solo("mint", function () {});
        toast("Resuming mint in the background");
        refreshDetail();
      });
      return;
    }
    var idx = pending.shift();
    MDS.sql("DELETE FROM items WHERE collectionid=" + OPEN_ROW.ID +
            " AND idx=" + idx, function () {
      MDS.sql("INSERT INTO items (collectionid,idx,image) VALUES (" +
              OPEN_ROW.ID + "," + idx + ",'" + NEED_IMAGES[idx] + "')",
              insertNext);
    });
  })();
}

/* ---------- The Graveyard : burial with safeguards ---------- */

var BURY_ARMED = false;
var BURY_TIMER = null;

function openBuryModal() {
  if (!OPEN_ROW || !LAST) { return; }
  BURY_ARMED = false;
  clearTimeout(BURY_TIMER);
  $("bury-title").innerText = "Bury " + (META.name || "this collection");
  hashChip($("bury-tokenid"), TOKENID);
  $("bury-confirm").value = "";
  $("bury-go").disabled = true;
  $("bury-go").classList.remove("armed");
  $("bury-go").innerText = "Bury forever";
  $("bury-status").innerText = "";

  var thumbs = $("bury-thumbs");
  thumbs.innerHTML = "";
  var mine = 0, held = 0;
  for (var n = 1; n <= LAST.size; n++) {
    var coin = LAST.byIdx["" + n];
    var st = itemStatus(coin, LAST.mineIds);
    if (st === "mine") {
      mine++;
      var img = document.createElement("img");
      img.src = coinImage(coin, n);
      img.onerror = (function (ix) {
        return function () { this.onerror = null; this.src = placeholderSVG(ix); };
      })(n);
      thumbs.appendChild(img);
    } else if (st === "held") { held++; }
  }
  var raw = LAST.rawMine || mine;
  $("bury-count").innerHTML = "You are about to bury <b>" + raw +
    " coin" + (raw === 1 ? "" : "s") + "</b>" +
    (mine < raw ? " (" + mine + " stamped, " + (raw - mine) + " unstamped)"
                : " — " + mine + " of " + LAST.size + " items") + ".";

  var v = VALID_CACHE[TOKENID];
  $("bury-warn-shield").classList.toggle("hidden", !(v && v.web));
  $("bury-warn-held").classList.toggle("hidden", held === 0);
  if (held > 0) {
    $("bury-warn-held").innerHTML = "&#9888; Collectors hold <b>" + held +
      " item" + (held === 1 ? "" : "s") + "</b> of this collection. Burying " +
      "yours does not affect theirs — but the collection lives on without you.";
  }
  $("bury-backdrop").classList.remove("hidden");
}

function closeBuryModal() {
  $("bury-backdrop").classList.add("hidden");
  BURY_ARMED = false;
  clearTimeout(BURY_TIMER);
}

function buryConfirmInput() {
  var match = $("bury-confirm").value.trim() === (META.name || "").trim();
  $("bury-go").disabled = !match;
  if (!match && BURY_ARMED) {
    BURY_ARMED = false;
    $("bury-go").classList.remove("armed");
    $("bury-go").innerText = "Bury forever";
  }
}

function buryGo() {
  if ($("bury-go").disabled || !OPEN_ROW) { return; }
  if (!BURY_ARMED) {
    BURY_ARMED = true;
    $("bury-go").classList.add("armed");
    $("bury-go").innerText = "Click again — forever means forever";
    BURY_TIMER = setTimeout(function () {
      BURY_ARMED = false;
      $("bury-go").classList.remove("armed");
      $("bury-go").innerText = "Bury forever";
    }, 5000);
    return;
  }
  clearTimeout(BURY_TIMER);
  MDS.sql("UPDATE collections SET phase='BURY', error='' WHERE id=" +
          OPEN_ROW.ID, function () {
    MDS.comms.solo("bury", function () {});
    closeBuryModal();
    toast("Burial begun — items are being carried to the graveyard");
    refreshDetail();
    loadCollectionList();
  });
}

/* remove-from-list: no chain effect - just forgets the row (armed 2-click) */
var REMOVE_ARMED = false;
var REMOVE_TIMER = null;

function removeFromList() {
  if (!OPEN_ROW) { return; }
  if (!REMOVE_ARMED) {
    REMOVE_ARMED = true;
    $("remove-btn").classList.add("armed");
    $("remove-btn").innerText = "Click again to remove";
    REMOVE_TIMER = setTimeout(function () {
      REMOVE_ARMED = false;
      $("remove-btn").classList.remove("armed");
      $("remove-btn").innerText = "Remove from list";
    }, 5000);
    return;
  }
  clearTimeout(REMOVE_TIMER);
  REMOVE_ARMED = false;
  var id = OPEN_ROW.ID;
  MDS.sql("DELETE FROM art_meta WHERE collectionid=" + id, function () {});
  MDS.sql("DELETE FROM items WHERE collectionid=" + id, function () {
    MDS.sql("DELETE FROM collections WHERE id=" + id, function () {
      toast("Removed from your list — you hold no coins of it, nothing " +
            "changed on-chain");
      $("remove-btn").classList.remove("armed");
      $("remove-btn").innerText = "Remove from list";
      show("view-collections");
      loadCollectionList();
    });
  });
}

/* ---------- create wizard ---------- */

function wizardMode() {
  var radios = document.getElementsByName("c-mode");
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) { return radios[i].value; }
  }
  return "embed";
}

function rebuildSlots() {
  var n = Math.max(2, Math.min(20, parseInt($("c-size").value, 10) || 0));
  var box = $("image-slots");
  box.innerHTML = "";
  WIZ_IMAGES.length = n;
  for (var i = 1; i <= n; i++) {
    (function (idx) {
      var slot = document.createElement("label");
      slot.className = "image-slot";
      var img = WIZ_IMAGES[idx - 1];
      slot.innerHTML =
        (img ? "<img src='" + b64src(img) + "'/>"
             : "<span class='slot-num'>" + idx + "</span><span class='slot-hint'>add image</span>") +
        "<input type='file' accept='image/*' class='slot-input'/>";
      slot.querySelector("input").onchange = function (e) {
        var f = e.target.files[0];
        if (!f) { return; }
        compressImage(f, IMG_BUDGET, function (b64) {
          if (!b64) { toast("could not process image"); return; }
          WIZ_IMAGES[idx - 1] = b64;
          rebuildSlots();
        });
      };
      box.appendChild(slot);
    })(i);
  }
}

function compressImage(file, budget, cb) {
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      // WebP-first (falls back to JPEG when the browser can't encode it),
      // largest dim that fits the budget wins — matches the Android encoder.
      var dims = [1080, 900, 720, 560, 420, 300];
      var quals = [0.88, 0.78, 0.68, 0.6];
      function encodeAt(dim, q) {
        var cv = document.createElement("canvas");
        var scale = Math.min(1, dim / Math.max(img.width, img.height));
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        var url = cv.toDataURL("image/webp", q);
        if (url.indexOf("data:image/webp") !== 0) { url = cv.toDataURL("image/jpeg", q); }
        return url.split(",")[1];
      }
      for (var d = 0; d < dims.length; d++) {
        for (var i = 0; i < quals.length; i++) {
          var b64 = encodeAt(dims[d], quals[i]);
          if (b64.length <= budget) { cb(b64); return; }
        }
      }
      cb("");
    };
    img.onerror = function () { cb(null); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* Re-encode an already-picked raster b64 down to a (possibly newly smaller)
 * budget — the envelope can shrink after images were chosen, and the user's
 * rule is SHRINK, never fail. SVGs cannot be lossy-shrunk: returns null. */
function reshrinkB64(b64, budget, cb) {
  if (!b64) { cb(""); return; }
  if (b64.length <= budget) { cb(b64); return; }
  if (b64Mime(b64) === "image/svg+xml") { cb(null); return; }
  var img = new Image();
  img.onload = function () {
    /* the ladder must reach the floor — a high stop meant "cannot be shrunk"
     * refusals for budgets a smaller rung fits easily (raster always fits) */
    var dims = [1080, 900, 720, 560, 420, 300, 240, 180, 140];
    var quals = [0.85, 0.75, 0.65, 0.55, 0.45, 0.38];
    for (var d = 0; d < dims.length; d++) {
      var s = Math.min(1, dims[d] / Math.max(img.width, img.height));
      for (var q = 0; q < quals.length; q++) {
        var cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * s));
        cv.height = Math.max(1, Math.round(img.height * s));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        var out = cv.toDataURL("image/jpeg", quals[q]).split(",")[1];
        if (out.length <= budget) { cb(out); return; }
      }
    }
    /* last resort: halve dimensions at floor quality until it fits —
     * "raster always fits" is a law; every slim target relies on it */
    for (var dd = 128; dd >= 16; dd = Math.floor(dd / 2)) {
      var s2 = Math.min(1, dd / Math.max(img.width, img.height));
      var cv2 = document.createElement("canvas");
      cv2.width = Math.max(1, Math.round(img.width * s2));
      cv2.height = Math.max(1, Math.round(img.height * s2));
      cv2.getContext("2d").drawImage(img, 0, 0, cv2.width, cv2.height);
      var out2 = cv2.toDataURL("image/jpeg", 0.35).split(",")[1];
      if (out2.length <= budget) { cb(out2); return; }
    }
    cb(null);
  };
  img.onerror = function () { cb(null); };
  img.src = b64src(b64);
}

function mintCollection() {
  var name = $("c-name").value.trim();
  var size = Math.max(2, Math.min(20, parseInt($("c-size").value, 10) || 0));
  var desc = $("c-desc").value.trim();
  var mode = wizardMode();
  var base = $("c-base").value.trim();
  var ext = $("c-ext").value.trim() || ".png";
  var iconurl = $("c-iconurl").value.trim();
  /* hosted URL beats upload (URLs can animate). Embedded icons carry a CLOSED
   * </artimage> — the engine prepends only the open tag, and strict-XML wallet
   * parsers need the well-formed element. WIZ_ICON itself stays raw b64. */
  var icon = iconurl || (WIZ_ICON ? WIZ_ICON + "</artimage>" : "");
  var webvalidate = $("c-webvalidate").value.trim();
  var externalurl = $("c-externalurl").value.trim();
  var status = $("create-status");
  if (webvalidate && webvalidate.indexOf("http") !== 0) {
    status.innerText = "web validation must be a full https:// URL"; return;
  }
  if (externalurl && externalurl.indexOf("http") !== 0) {
    status.innerText = "external URL must be a full https:// URL"; return;
  }

  if (!name) { status.innerText = "name required"; return; }
  if (mode === "url" && base.indexOf("http") !== 0) {
    status.innerText = "base URL required for hosted mode"; return;
  }
  if (mode === "embed") {
    for (var i = 0; i < size; i++) {
      if (!WIZ_IMAGES[i]) {
        status.innerText = "image missing for item #" + (i + 1); return;
      }
    }
  }

  // verify-before-mint: hosted URLs the mint will seal must serve first
  var hostUrls = [];
  if (mode === "url") { hostUrls.push(base + "1" + ext); hostUrls.push(base + size + ext); }
  if (iconurl && iconurl.indexOf("http") === 0) hostUrls.push(iconurl);
  if (externalurl) hostUrls.push(externalurl);
  // web-validation URL is NOT gated: the proof doc is usually created AFTER
  // mint (it must contain the tokenid, which only exists then). Absent = "not
  // yet validated", never a blocked mint.
  if (hostUrls.length && !mintCollection._hostVerified) {
    status.innerText = "verifying hosted URLs…";
    HOSTING.verify(hostUrls, function (err) {
      if (err) { status.innerText = err; return; }
      mintCollection._hostVerified = true;
      mintCollection();
    });
    return;
  }
  mintCollection._hostVerified = false;

  status.innerText = "preparing...";
  function withIcon(next) {
    if (icon || mode !== "embed" || !WIZ_IMAGES[0]) { next(); return; }
    // no icon chosen: square-crop plate #1 so the wallet tile fills properly
    squareIconFromB64(WIZ_IMAGES[0], function (sq) {
      if (sq) { icon = sq + "</artimage>"; }
      next();
    });
  }
  withIcon(function () {
  /* ALWAYS SIGNED: the envelope (record incl. the 8.4KB signature) decides
   * the image budget — over-budget photos are SHRUNK automatically, never
   * refused, never minted unsigned. SVGs cannot be lossy-shrunk: those refuse. */
  /* FIT-then-refuse: real name/desc/URLs land here and can outweigh any
   * earlier estimate — run the icon ladder (slim -> drop) before refusing. */
  function iconLadder(cb) {
    /* The icon must never starve the plates: an embedded icon inside the
     * record squeezes every plate's image room. Slim/drop it whenever the
     * plates need more room than it leaves — not only when the record fails
     * outright (2026-08-10). A plate deserves PLATE_MIN room; plates already
     * lighter than that never force the icon out. */
    var PLATE_MIN = 6500;
    var need = 0;
    if (mode === "embed") {
      for (var wn = 0; wn < size; wn++) {
        if (WIZ_IMAGES[wn]) {
          need = Math.max(need, Math.min(WIZ_IMAGES[wn].length, PLATE_MIN));
        }
      }
    }
    function happy(env) { return env.ok && env.imageBudget >= need; }
    var env = engineEnvelope(JSON.stringify(
      artExactMeta(name, desc, size, icon, externalurl, null)).length);
    if (happy(env)) { cb(env); return; }
    var raw = (icon && icon.indexOf("http") !== 0)
      ? icon.replace(/<\/artimage>$/, "") : "";
    if (!raw) {
      if (env.ok) { cb(env); return; }   // hosted/no icon: nothing to shed
      status.innerText = env.error; cb(null); return;
    }
    /* Slim the icon to the room ACTUALLY spare once the plates get theirs —
     * a hardcoded target below the shrink floor dropped a chosen icon and
     * showed plate 1 instead (2026-08-11). */
    var envNoIcon = engineEnvelope(JSON.stringify(
      artExactMeta(name, desc, size, "", externalurl, null)).length);
    /* −64: embedding the icon adds its own metadata overhead (JSON field +
     * the artimage wrapper); a slim landing flush on the cap failed the
     * happy() recheck and dropped the icon anyway */
    var iconAllow = envNoIcon.ok ? envNoIcon.imageBudget - need - 64 : 0;
    function dropIcon() {
      icon = "";
      if (envNoIcon.ok) {
        toast("icon dropped so the plates keep their room — wallet shows the identicon");
        cb(envNoIcon); return;
      }
      status.innerText = envNoIcon.error + " — even without an icon; shorten the description";
      cb(null);
    }
    /* 1200 = the ladder's tested floor (pure noise fits it); below that an
     * icon would be mush — drop it instead */
    if (iconAllow < 1200) { dropIcon(); return; }
    reshrinkB64(raw, Math.min(iconAllow, 6000), function (slim) {
      if (slim) {
        var icon2 = slim + "</artimage>";
        var e2 = engineEnvelope(JSON.stringify(
          artExactMeta(name, desc, size, icon2, externalurl, null)).length);
        if (happy(e2)) {
          icon = icon2;
          toast("icon slimmed so the plates keep their room");
          cb(e2); return;
        }
      }
      dropIcon();
    });
  }
  function fitted(next2) {
    iconLadder(function (env) {
      if (!env) { return; }
      if (mode !== "embed") { next2(); return; }
    var budget = Math.min(IMG_BUDGET, env.imageBudget);
    (function shrinkNext(i) {
      if (i >= size) { next2(); return; }
      if (!WIZ_IMAGES[i] || WIZ_IMAGES[i].length <= budget) { shrinkNext(i + 1); return; }
      reshrinkB64(WIZ_IMAGES[i], budget, function (out) {
        if (out === null) {
          status.innerText = "item #" + (i + 1) + " (" + WIZ_IMAGES[i].length +
            "B) cannot be shrunk to the " + budget + "B image budget the signed " +
            "record leaves" + (b64Mime(WIZ_IMAGES[i]) === "image/svg+xml"
              ? " — SVG art cannot be lossy-shrunk; lighten the record instead"
              : " — lighten the record (shorter text, hosted icon)");
          return;
        }
        WIZ_IMAGES[i] = out;
        shrinkNext(i + 1);
      });
    })(0);
    });
  }
  fitted(function () {
  MDS.cmd("getaddress", function (res) {
    if (!res.status) { status.innerText = "getaddress failed"; return; }
    var addr = res.response.address;
    var pk = res.response.publickey;
    MDS.sql(
      "INSERT INTO collections (name,description,mode,size,base,ext,phase," +
      "posted,creatoraddr,creatorpk,origin,icon,webvalidate,externalurl) VALUES ('" +
      engineSqlEsc(name) + "','" + engineSqlEsc(desc) + "','" + mode + "'," +
      size + ",'" + engineSqlEsc(base) + "','" + engineSqlEsc(ext) +
      "','CREATE',0,'" + addr + "','" + pk + "','created','" +
      engineSqlEsc(icon) + "','" + engineSqlEsc(webvalidate) + "','" +
      engineSqlEsc(externalurl) + "')",
      /* iscreator set right after insert (column order safety) */
      function () {
        MDS.sql("SELECT id FROM collections WHERE name='" + engineSqlEsc(name) +
                "' ORDER BY id DESC LIMIT 1", function (r2) {
          var cid = r2.rows[0].ID;
          MDS.sql("UPDATE collections SET iscreator=1 WHERE id=" + cid,
                  function () {});
          var items = [];
          for (var i = 1; i <= size; i++) {
            items.push({ i: i, img: mode === "embed" ? WIZ_IMAGES[i - 1]
                                                     : (base + i + ext) });
          }
          (function insertNext(k) {
            if (k >= items.length) {
              MDS.comms.solo("mint", function () {});
              toast("Minting started — runs in the background");
              WIZ_IMAGES = []; WIZ_ICON = "";
              $("c-name").value = ""; $("c-desc").value = "";
              $("c-iconurl").value = ""; $("c-webvalidate").value = "";
              $("c-externalurl").value = "";
              $("icon-glyph").innerText = "+";
              loadCollectionList();
              MDS.sql("SELECT * FROM collections WHERE id=" + cid, function (r3) {
                openOwn(r3.rows[0]);
              });
              return;
            }
            MDS.sql("INSERT INTO items (collectionid,idx,image) VALUES (" +
                    cid + "," + items[k].i + ",'" + items[k].img + "')",
                    function () { insertNext(k + 1); });
          })(0);
        });
      });
  });
  });   // fitted
  });   // withIcon
}

/* ---------- transfer (full-state preserving) ---------- */

function openModal(coin, idx) {
  CURRENT = { coin: coin, idx: idx };
  $("modal-title").innerText = "Item No. " + idx;
  hashChip($("modal-coin"), coin.coinid);
  $("modal-status").innerText = "";
  $("recipient").value = "";
  $("modal-backdrop").classList.remove("hidden");
}

function closeModal() { $("modal-backdrop").classList.add("hidden"); CURRENT = null; }

function step(cmd, next, fail) {
  MDS.cmd(cmd, function (res) {
    if (!res.status) { fail(res.error || cmd); return; }
    next(res);
  });
}

function doTransfer() {
  if (!CURRENT) { return; }
  var to = $("recipient").value.trim();
  if (!(to.indexOf("0x") === 0 || to.indexOf("Mx") === 0)) {
    $("modal-status").innerText = "invalid address"; return;
  }
  var c = CURRENT.coin, idx = CURRENT.idx;
  var id = "statenft" + Date.now();
  var status = $("modal-status");
  var fail = function (e) {
    status.innerText = "failed: " + e;
    MDS.cmd("txndelete id:" + id, function () {});
  };

  // keepstate TRUE demands the ENTIRE state be recreated - every port verbatim.
  // State can be hostile on legacy collections, and the node parses these
  // commands by whitespace, so refuse rather than replay anything unexpected.
  var st = c.state || [];
  for (var si = 0; si < st.length; si++) {
    if (!/^[0-9]+$/.test("" + st[si].port) ||
        !engineSafeStateValue(st[si].data)) {
      status.innerText = "refusing to transfer: this coin carries malformed " +
        "state (port " + st[si].port + ")";
      return;
    }
  }
  var states = st.map(function (s) {
    return "txnstate id:" + id + " port:" + s.port + " value:" + s.data;
  });

  /* Honest pre-check: definition + state ride TWICE per transfer (+~12K sig)
   * under the 64KB cap. Collections minted before the joint guard can carry
   * loads that can NEVER transfer — say so instead of posting a doomed txn. */
  var stateLen = 0;
  for (var sl = 0; sl < st.length; sl++) { stateLen += ("" + st[sl].data).length; }
  var stF = stateLen;
  MDS.cmd("tokens tokenid:" + TOKENID, function (tres) {
    var defLen = (tres.status && tres.response) ? JSON.stringify(tres.response).length : 0;
    if (defLen > 0 && defLen + stF > ENGINE_PAIR_BUDGET + 1000) {
      status.innerText = "this lot cannot fit a transfer under the chain's 64KB " +
        "cap (record " + defLen + "B + state " + stF + "B, both carried twice) — " +
        "it was minted before the transfer-budget guard. Burial is the only exit.";
      return;
    }
    doTransferGo(to, c, idx, id, states, status, fail);
  });
}

function doTransferGo(to, c, idx, id, states, status, fail) {
  status.innerText = "building transaction...";
  step("txncreate id:" + id, function () {
    step("txninput id:" + id + " coinid:" + c.coinid, function () {
      step("txnoutput id:" + id + " amount:1 address:" + to +
           " tokenid:" + TOKENID + " storestate:true", function () {
        (function setState(k) {
          if (k >= states.length) {
            status.innerText = "signing...";
            step("txnsign id:" + id + " publickey:auto", function () {
              step("txnbasics id:" + id, function () {
                step("txnpost id:" + id, function () {
                  MDS.cmd("txndelete id:" + id, function () {});
                  status.innerText = "posted — awaiting confirmation...";
                  watchDeparture(c.coinid, idx);
                }, fail);
              }, fail);
            }, fail);
            return;
          }
          step(states[k], function () { setState(k + 1); }, fail);
        })(0);
      }, fail);
    }, fail);
  }, fail);
}

function watchDeparture(coinid, idx) {
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    MDS.cmd("coins relevant:true tokenid:" + TOKENID, function (res) {
      var still = (res.status ? res.response : []).some(function (c) {
        return c.coinid === coinid;
      });
      if (!still) {
        clearInterval(timer);
        closeModal();
        toast("Item No. " + idx + " transferred — identity intact");
        refreshDetail();
      } else if (tries > 20) {
        clearInterval(timer);
        var s = $("modal-status");
        if (s) { s.innerText = "not confirmed after ~7 min — the spend may have been rejected"; }
      }
    });
  }, 20000);
}

/* ---------- boot ---------- */

function setBlock(b) {
  CUR_BLOCK = parseInt(b, 10) || CUR_BLOCK;
  var chip = $("block-info");
  chip.innerText = "block " + b;
  chip.classList.add("tick");
  setTimeout(function () { chip.classList.remove("tick"); }, 700);
}

/* One-time healing: 'opened' rows whose script never fingerprinted as a
 * StateNFT are phantoms (the Jazminima bug) — regular NFTs belong in the
 * Singles section, not the collections grid. Verify each against the node
 * and delete the impostors. */
function cleanupPhantomRows(done) {
  MDS.sql("SELECT id, tokenid FROM collections WHERE origin='opened' " +
          "AND tokenid<>''", function (res) {
    engineEach(res.rows || [], function (row, next) {
      MDS.cmd("tokens tokenid:" + row.TOKENID, function (tres) {
        var script = (tres.status && tres.response) ? tres.response.script : "";
        if (engineStateNftPk(script)) { next(); return; }
        MDS.log("StateNFT: row " + row.ID + " is not a StateNFT - unfiling");
        MDS.sql("DELETE FROM art_meta WHERE collectionid=" + row.ID, function () {});
        MDS.sql("DELETE FROM collections WHERE id=" + row.ID, function () { next(); });
      });
    }, function () { if (done) { done(); } });
  });
}

MDS.init(function (msg) {
  if (msg.event === "inited") {
    engineInitTables(function () {
      artInitMetaTable(function () {
        sendInitTable(function () {
          artStudioBoot(function () {});
        });
      });
      cleanupPhantomRows(function () { loadCollectionList(); loadSingles(); });
    });
    MDS.cmd("block", function (res) {
      if (res.status) { setBlock(res.response.block); }
    });
  } else if (msg.event === "NEWBLOCK") {
    var b = msg.data && msg.data.txpow ? msg.data.txpow.header.block : null;
    if (b) { setBlock(b); }
    loadCollectionList();
    refreshDetail();
    if (TOKENID && !$("view-detail").classList.contains("hidden")) {
      refreshProvenance();
    }
  } else if (msg.event === "NEWBALANCE") {
    refreshDetail();
  }
});

$("tab-collections").onclick = function () { show("view-collections"); loadCollectionList(); };
$("tab-create").onclick = function () { show("view-create"); rebuildSlots(); };
$("tab-filtr").onclick = function () { show("view-filtr"); filtrEnter(); };
$("back-btn").onclick = function () { show("view-collections"); loadCollectionList(); };
$("open-btn").onclick = function () { openExternal($("tokenid-input").value); };
$("tokenid-input").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { openExternal(this.value); }
});
$("rescan-btn").onclick = function () {
  toast("Scanning wallet for StateNFT collections...");
  engineAdopt(function () { loadCollectionList(); toast("Rescan complete"); });
};
$("need-save-btn").onclick = saveNeedImages;
$("c-size").onchange = rebuildSlots;
Array.prototype.forEach.call(document.getElementsByName("c-mode"), function (r) {
  r.onchange = function () {
    var url = wizardMode() === "url";
    $("url-fields").classList.toggle("hidden", !url);
    $("embed-fields").classList.toggle("hidden", url);
  };
});
function onIconPick(e) {
  var f = e.target.files[0];
  if (!f) { return; }
  compressIconFile(f, function (b64) {
    if (!b64) { toast("could not process icon"); return; }
    WIZ_ICON = b64;
    $("icon-slot").innerHTML =
      "<img src='" + b64src(b64) + "'/>" +
      "<input type='file' accept='image/*' class='slot-input' id='icon-file'/>";
    $("icon-file").onchange = onIconPick;
  });
}
$("icon-file").onchange = onIconPick;
$("mint-btn").onclick = mintCollection;
$("recover-btn").onclick = function () {
  if (!OPEN_ROW) { return; }
  var cid = OPEN_ROW.ID;
  toast("reading the chain\u2026");
  MDS.cmd("block", function (br) {
    var tip = br.status && br.response ? parseInt(br.response.block, 10) : 0;
    MDS.sql("SELECT * FROM collections WHERE id=" + cid, function (r) {
      if (!r.status || !r.rows.length) { toast("no local mint row"); return; }
      var row = r.rows[0];
      row.SIZE = parseInt(row.SIZE, 10);
      engineRecover(row, tip, function () {
        toast("mint recovered - phase re-derived from the chain");
        MDS.comms.solo("mint", function () {});
        loadCollectionList();
      });
    });
  });
};

$("bury-btn").onclick = openBuryModal;
$("remove-btn").onclick = removeFromList;
$("bury-cancel").onclick = closeBuryModal;
$("bury-go").onclick = buryGo;
$("bury-confirm").addEventListener("input", buryConfirmInput);
$("bury-backdrop").addEventListener("click", function (e) {
  if (e.target === this) { closeBuryModal(); }
});
$("cancel-btn").onclick = closeModal;
$("send-btn").onclick = doTransfer;
$("modal-backdrop").addEventListener("click", function (e) {
  if (e.target === this) { closeModal(); }
});

/* Catalogue Raisonné controls */
Array.prototype.forEach.call(document.querySelectorAll(".ftab[data-f]"), function (t) {
  t.onclick = function () {
    FILTER = t.getAttribute("data-f");
    syncFilterTabs();
    renderGallery();
  };
});
$("sort-btn").onclick = function () {
  SORT_ASC = !SORT_ASC;
  syncFilterTabs();
  renderGallery();
};
$("lr-contract").onclick = function () {
  $("contract-pre").classList.toggle("hidden");
};
$("lr-sig").onclick = $("lr-web").onclick = function () {
  if (!TOKENID) { return; }
  toast("re-checking provenance...");
  refreshProvenance();
};
$("lr-sig").title = $("lr-web").title = "click to re-verify";
$("lr-sig").style.cursor = $("lr-web").style.cursor = "pointer";
$("hb-mine").onclick = function () { FILTER = "mine"; syncFilterTabs(); renderGallery(); };
$("hb-held").onclick = function () { FILTER = "held"; syncFilterTabs(); renderGallery(); };
$("hb-unseen").onclick = function () { FILTER = "unseen"; syncFilterTabs(); renderGallery(); };

/* The Loupe controls */
$("insp-close").onclick = closeInspector;
$("insp-prev").onclick = function () { inspNav(-1); };
$("insp-next").onclick = function () { inspNav(1); };
$("insp-frame").onclick = inspectorZoom;
$("insp-frame").addEventListener("mousemove", inspectorAim);
$("insp-stage").addEventListener("touchstart", inspTouchStart, { passive: true });
$("insp-stage").addEventListener("touchend", inspTouchEnd, { passive: true });
$("insp-stage").addEventListener("click", function (e) {
  if (e.target === this) { closeInspector(); }
});

/* ============================================================
   ATELIER STUDIO — single-NFT + custom-token wizards, singles &
   tokens catalogue. Mirrors the native Android build's metadata
   conventions exactly (nft:"true", owner, attributes, artimage).
   ============================================================ */

var ARTIMAGE_BUDGET = 9000;
var NFT_ART = "";        // sealed b64 (compressed raster or sanitized SVG)
var NFT_TRAITS = [];     // [ [type, value] ]
var TOKEN_ICON = "";
var TOKEN_PAIRS = [];    // [ [key, value] ]
var RESERVED_KEYS = ["name", "url", "description", "ticker", "webvalidate",
                     "external_url", "owner", "nft", "icon", "attributes"];

function validCmdUrl(u) {
  return !u || (u.indexOf(" ") < 0 && u.indexOf('"') < 0 &&
                u.indexOf("'") < 0 && u.indexOf(";") < 0);
}

/* SVG lane: strip active content before sealing — mirrors SvgSanitizer.java */
function svgSanitize(text) {
  if (!/^\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg/i.test(text)) { return null; }
  var s = text;
  s = s.replace(/<!DOCTYPE[\s\S]*?>|<!ENTITY[\s\S]*?>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script\s*>|<script[^>]*\/\s*>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>|<foreignObject[^>]*\/\s*>/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*(["'])(?!#)[^"']*\2/gi, "");
  return s.replace(/^\s+|\s+$/g, "");
}

function b64Unicode(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

/* ---------- studio hub ---------- */

function studioShow(panel) {
  $("studio-hub").classList.toggle("hidden", panel !== "hub");
  $("wiz-collection").classList.toggle("hidden", panel !== "collection");
  $("wiz-nft").classList.toggle("hidden", panel !== "nft");
  $("wiz-token").classList.toggle("hidden", panel !== "token");
  $("wiz-art").classList.toggle("hidden", panel !== "art");
  $("wiz-hosting").classList.toggle("hidden", panel !== "hosting");
}

$("hub-collection").onclick = function () { studioShow("collection"); };
$("hub-nft").onclick = function () { studioShow("nft"); updateNftPreview(); };
$("hub-token").onclick = function () { studioShow("token"); updateTokenPreview(); };
$("hub-art").onclick = function () { studioShow("art"); artStudioEnter(); };
$("hub-hosting").onclick = function () { studioShow("hosting"); hostingRender(); };
$("coll-hub-back").onclick = function () { studioShow("hub"); };
$("nft-hub-back").onclick = function () { studioShow("hub"); };
$("token-hub-back").onclick = function () { studioShow("hub"); };
$("art-hub-back").onclick = function () { studioShow("hub"); };
$("host-hub-back").onclick = function () { studioShow("hub"); };

/* ============ HOSTING (No 5) ============ */

var HOST_EDIT = null;   // profile object being edited (null = list view)

function hostingRender() {
  $("host-editor").classList.add("hidden");
  HOSTING.load(function (profiles) {
    var list = $("host-list");
    list.innerHTML = "";
    if (!profiles.length) {
      list.innerHTML = "<p class='cert-note'>No destinations yet. Add one, then use the "
        + "Upload buttons in the wizards. No server? A free Pinata key pins to IPFS.</p>";
    }
    profiles.forEach(function (p, i) {
      var row = document.createElement("div");
      row.className = "collection-card";
      row.style.padding = "0.7rem 0.9rem";
      row.innerHTML = "<b>" + esc(p.name || "(unnamed)") + "</b> <span class='mono'>"
        + esc(p.type) + (p.def ? " · default" : "") + "</span>";
      var btns = document.createElement("div");
      btns.style.marginTop = "0.4rem";
      btns.appendChild(hbtn("Test", function () { hostingTest(p); }));
      btns.appendChild(hbtn("Edit", function () { hostingEdit(p); }));
      if (!p.def) btns.appendChild(hbtn("Make default", function () {
        profiles.forEach(function (q) { q.def = (q === p); });
        HOSTING.save(profiles, function () { hostingRender(); });
      }));
      btns.appendChild(hbtn("Delete", function () {
        profiles.splice(i, 1);
        HOSTING.save(profiles, function () { hostingRender(); });
      }));
      row.appendChild(btns);
      list.appendChild(row);
    });
  });
}

function hbtn(label, fn) {
  var b = document.createElement("button");
  b.className = "btn btn-ghost";
  b.style.marginRight = "0.3rem";
  b.textContent = label;
  b.onclick = fn;
  return b;
}

function esc(s) { return ("" + s).replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }); }

function hostingEdit(p) {
  HOST_EDIT = p || { v: 1, id: "hp_" + Date.now(), name: "", type: "webdav", def: false,
    pathTemplate: "atelier/{collection}/{name}-{ts}{ext}", dirTemplate: "atelier/{collection}-{ts}", webdav: {} };
  if (!HOST_EDIT[HOST_EDIT.type]) HOST_EDIT[HOST_EDIT.type] = {};
  $("host-editor").classList.remove("hidden");
  $("host-name").value = HOST_EDIT.name || "";
  $("host-type").value = HOST_EDIT.type;
  hostingShowFields();
  $("host-status").innerText = "";
}

function hostingShowFields() {
  var t = $("host-type").value;
  ["webdav", "kubo", "pinata", "github"].forEach(function (k) {
    $("host-f-" + k).classList.toggle("hidden", k !== t);
  });
  if (HOST_EDIT) {
    var c = HOST_EDIT[t] || {};
    var keys = { webdav: ["endpoint", "user", "password", "urlPrefix"],
                 kubo: ["apiUrl", "gateway"], pinata: ["jwt", "gateway"],
                 github: ["owner", "repo", "branch", "token", "serve", "pagesPrefix"] };
    (keys[t] || []).forEach(function (k) {
      var el = $("host-" + t + "-" + k);
      if (el) el.value = c[k] || "";
    });
  }
}

$("host-type").onchange = function () {
  if (HOST_EDIT) { HOST_EDIT.type = $("host-type").value; if (!HOST_EDIT[HOST_EDIT.type]) HOST_EDIT[HOST_EDIT.type] = {}; }
  hostingShowFields();
};
$("host-add").onclick = function () { hostingEdit(null); };
$("host-cancel").onclick = function () { HOST_EDIT = null; $("host-editor").classList.add("hidden"); };

function hostingCollect() {
  var t = $("host-type").value;
  HOST_EDIT.type = t;
  HOST_EDIT.name = $("host-name").value.trim();
  var keys = { webdav: ["endpoint", "user", "password", "urlPrefix"],
               kubo: ["apiUrl", "gateway"], pinata: ["jwt", "gateway"],
               github: ["owner", "repo", "branch", "token", "serve", "pagesPrefix"] };
  var c = HOST_EDIT[t] || {};
  (keys[t] || []).forEach(function (k) {
    var el = $("host-" + t + "-" + k);
    if (el) c[k] = el.value.trim();
  });
  HOST_EDIT[t] = c;
  return HOST_EDIT.name !== "";
}

$("host-save").onclick = function () {
  if (!hostingCollect()) { $("host-status").innerText = "Give the destination a name"; return; }
  HOSTING.load(function (profiles) {
    var found = false;
    for (var i = 0; i < profiles.length; i++) if (profiles[i].id === HOST_EDIT.id) { profiles[i] = HOST_EDIT; found = true; }
    if (!found) profiles.push(HOST_EDIT);
    if (profiles.length === 1) profiles[0].def = true;
    HOSTING.save(profiles, function () { HOST_EDIT = null; hostingRender(); });
  });
};

$("host-test").onclick = function () {
  if (!hostingCollect()) { $("host-status").innerText = "Give the destination a name"; return; }
  var p = HOST_EDIT;
  HOSTING.load(function (profiles) {
    var found = false;
    for (var i = 0; i < profiles.length; i++) if (profiles[i].id === p.id) { profiles[i] = p; found = true; }
    if (!found) profiles.push(p);
    if (profiles.length === 1) profiles[0].def = true;
    HOSTING.save(profiles, function () { hostingTest(p); });
  });
};

function hostingTest(p) {
  $("host-status").innerText = "Testing " + (p.name || "") + "…";
  HOSTING.testProfile(p, function (msg) { $("host-status").innerText = msg; });
}

/* ---- upload buttons in the wizards ---- */

var HOST_UP_LANE = "", HOST_UP_TARGET = "";

document.addEventListener("click", function (ev) {
  var b = ev.target;
  if (!b || !b.classList || !b.classList.contains("host-up")) return;
  ev.preventDefault();
  HOSTING.load(function (profiles) {
    var def = HOSTING.getDefault(profiles);
    if (!def) { toast("Set up a destination in Studio → Hosting"); studioShow("hosting"); hostingRender(); return; }
    HOST_UP_LANE = b.getAttribute("data-lane");
    HOST_UP_TARGET = b.getAttribute("data-target");
    var f = $("host-file");
    f.multiple = (HOST_UP_LANE === "collplates");
    f.value = "";
    f.click();
  });
});

$("host-file").onchange = function () {
  var files = Array.prototype.slice.call(this.files || []);
  if (!files.length) return;
  HOSTING.load(function (profiles) {
    var p = HOSTING.getDefault(profiles);
    if (!p) { toast("No hosting destination"); return; }
    var collSlug = HOSTING.slug($("c-name") ? $("c-name").value || "atelier" : "atelier");
    if (HOST_UP_LANE === "collplates") {
      hostUploadPlates(p, files, collSlug);
    } else {
      hostUploadSingle(p, files[0], collSlug);
    }
  });
};

function extFromType(mime) {
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
            "image/gif": ".gif", "image/svg+xml": ".svg" })[mime] || ".png";
}

function hostUploadSingle(p, file, collSlug) {
  toast("Uploading to " + p.name + "…");
  var lane = HOST_UP_LANE, target = HOST_UP_TARGET;
  var mime = file.type || "image/png";
  // icon lanes get squared/compressed; external/full-res pass through
  if (lane === "collicon" || lane === "tokicon") {
    squareWebp(file, 512, function (blob) {
      HOSTING.uploadSingle(p, blob, "image/webp", ".webp", collSlug, lane, function (err, url) {
        hostDone(err, url, target);
      });
    });
  } else {
    HOSTING.uploadSingle(p, file, mime, extFromType(mime), collSlug, lane, function (err, url) {
      hostDone(err, url, target);
    });
  }
}

function hostUploadPlates(p, files, collSlug) {
  toast("Uploading " + files.length + " plates to " + p.name + "…");
  var ext0 = null, plates = [];
  for (var i = 0; i < files.length; i++) {
    var e = extFromType(files[i].type || "image/png");
    if (ext0 === null) ext0 = e;
    else if (ext0 !== e) { toast("All plates must share one file type"); return; }
    plates.push({ blob: files[i], mime: files[i].type || "image/png", ext: e });
  }
  HOSTING.uploadPlates(p, plates, collSlug, function (err, base) {
    if (err) { toast(err); return; }
    HOSTING.verify([base + "1" + ext0, base + files.length + ext0], function (verr) {
      if (verr) { toast(verr); return; }
      if ($("c-base")) $("c-base").value = base;
      if ($("c-ext")) $("c-ext").value = ext0;
      // switch to hosted mode
      var urlRadio = document.querySelector("input[name='c-mode'][value='url']");
      if (urlRadio) { urlRadio.checked = true; urlRadio.dispatchEvent(new Event("change")); }
      toast("Uploaded ✓ — base URL filled");
    });
  });
}

function hostDone(err, url, target) {
  if (err) { toast(err); return; }
  HOSTING.verify([url], function (verr) {
    if (verr) { toast(verr); return; }
    if ($(target)) $(target).value = url;
    toast("Uploaded ✓ — URL filled");
  });
}

function squareWebp(file, side, cb) {
  var img = new Image();
  img.onload = function () {
    var s = Math.min(img.width, img.height);
    var cv = document.createElement("canvas");
    cv.width = side; cv.height = side;
    cv.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, side, side);
    cv.toBlob(function (b) { cb(b); }, "image/webp", 0.85);
  };
  img.onerror = function () { cb(file); };
  img.src = URL.createObjectURL(file);
}
/* entering the Studio tab always lands on the hub */
$("tab-create").addEventListener("click", function () { studioShow("hub"); });
$("tab-collections").addEventListener("click", function () { loadSingles(); });

/* ---------- single NFT ---------- */

function nftArtPicked(f) {
  if (!f) { return; }
  var isSvg = /\.svg$/i.test(f.name || "") || f.type === "image/svg+xml";
  if (isSvg) {
    var r = new FileReader();
    r.onload = function () {
      var clean = svgSanitize("" + r.result);
      if (!clean) { toast("that SVG could not be made inert"); return; }
      var b64 = b64Unicode(clean);
      if (b64.length > ARTIMAGE_BUDGET) { toast("SVG too large for the artimage budget"); return; }
      NFT_ART = b64;
      nftArtShow();
    };
    r.readAsText(f);
    return;
  }
  compressImage(f, ARTIMAGE_BUDGET, function (b64) {
    if (!b64) { toast("could not compress that image"); return; }
    NFT_ART = b64;
    nftArtShow();
  });
}

function nftArtShow() {
  var drop = $("nft-art-drop");
  drop.classList.add("filled");
  drop.style.backgroundImage = "url(\"" + cssUrl(b64src(NFT_ART)) + "\")";
  $("nft-art-hint").innerText = "";
  updateNftPreview();
}

function renderTraits() {
  var box = $("n-traits");
  box.innerHTML = "";
  NFT_TRAITS.forEach(function (t, i) {
    var row = document.createElement("div");
    row.className = "trait-row";
    var k = document.createElement("input");
    k.type = "text"; k.value = t[0]; k.readOnly = true;
    var v = document.createElement("input");
    v.type = "text"; v.value = t[1]; v.readOnly = true;
    var del = document.createElement("button");
    del.className = "row-del"; del.innerText = "×";
    del.onclick = function () { NFT_TRAITS.splice(i, 1); renderTraits(); };
    row.appendChild(k); row.appendChild(v); row.appendChild(del);
    box.appendChild(row);
  });
  updateNftPreview();
}

$("n-trait-add").onclick = function () {
  var t = $("n-trait-type").value.trim();
  var v = $("n-trait-value").value.trim();
  if (!t || !v) { toast("both trait and value needed"); return; }
  if (NFT_TRAITS.length >= 12) { toast("12 traits maximum"); return; }
  NFT_TRAITS.push([t, v]);
  $("n-trait-type").value = ""; $("n-trait-value").value = "";
  renderTraits();
};

function nftMeta(artPlaceholder) {
  var meta = {
    name: $("n-name").value.trim() || "Untitled",
    description: $("n-desc").value.trim(),
    url: artPlaceholder !== undefined ? artPlaceholder
        : "<artimage>" + NFT_ART + "</artimage>"
  };
  var owner = $("n-owner").value.trim();
  var ext = $("n-external").value.trim();
  var web = $("n-webvalidate").value.trim();
  if (owner) { meta.owner = owner; }
  if (ext) { meta.external_url = ext; }
  if (web) { meta.webvalidate = web; }
  if (NFT_TRAITS.length) {
    meta.attributes = NFT_TRAITS.map(function (t) {
      return { trait_type: t[0], value: t[1] };
    });
  }
  meta.nft = "true";
  return meta;
}

function updateNftPreview() {
  if (!$("n-preview")) { return; }
  var ph = NFT_ART ? "<artimage>" + NFT_ART.length + " chars</artimage>" : "<artimage>…</artimage>";
  $("n-preview").innerText = JSON.stringify(nftMeta(ph), null, 2);
}

["n-name", "n-desc", "n-owner", "n-external", "n-webvalidate", "n-editions"]
  .forEach(function (id) { $(id).addEventListener("input", updateNftPreview); });
$("nft-art-file").onchange = function () { nftArtPicked(this.files[0]); this.value = ""; };

$("nft-mint-btn").onclick = function () {
  var name = $("n-name").value.trim();
  var editions = parseInt($("n-editions").value, 10) || 1;
  var status = $("nft-status");
  if (!name) { status.innerText = "a title is required"; return; }
  if (!NFT_ART) { status.innerText = "choose the artwork first"; return; }
  if (editions < 1 || editions > 1000) { status.innerText = "editions must be 1–1000"; return; }
  if (!validCmdUrl($("n-external").value.trim()) || !validCmdUrl($("n-webvalidate").value.trim())) {
    status.innerText = "URLs must not contain spaces, quotes or semicolons"; return;
  }
  status.innerText = "sealing\u2026";
  var web = $("n-webvalidate").value.trim();
  /* ALWAYS SIGNED: the artwork rides inside the token record with the 8.4KB
   * signature. editions>1 must also split (3 records/txn), editions=1 only
   * sends (2 records/txn) — compute the art budget and SHRINK to fit. */
  function fitArt(cb) {
    var sansLen = JSON.stringify(nftMeta()).length - NFT_ART.length;
    var bound = editions > 1 ? ENGINE_META_MAX
                             : (ENGINE_PAIR_BUDGET - ENGINE_DEF_WRAPPER - ENGINE_DEF_SIGN);
    var artBudget = bound - sansLen - 24;   // artimage tag slack
    if (artBudget < 1500) {
      status.innerText = "title/description/URLs leave only " + artBudget +
        "B for the artwork - shorten the text";
      return;
    }
    if (NFT_ART.length <= artBudget) { cb(); return; }
    reshrinkB64(NFT_ART, artBudget, function (out) {
      if (out === null) {
        status.innerText = "this artwork (" + NFT_ART.length + "B) cannot be " +
          "shrunk to the " + artBudget + "B the signed record allows" +
          (editions > 1 ? " with " + editions + " editions - fewer editions help" : "");
        return;
      }
      NFT_ART = out;
      toast("artwork auto-shrunk to keep the NFT signed and sendable");
      cb();
    });
  }
  function post(signPk) {
    if (!signPk) { status.innerText = "no signing key — mint refused (ALWAYS SIGNED)"; return; }
    var cmd = "tokencreate name:" + JSON.stringify(nftMeta()) +
              " amount:" + editions + " decimals:0";
    if (web) { cmd += " webvalidate:" + web; }
    cmd += " signtoken:" + signPk;
    MDS.cmd(cmd, function (res) {
      if (!res.status) {
        status.innerText = "mint failed: " + (res.error || "node refused");
        return;
      }
      status.innerText = "";
      toast("NFT sealed — appears in the catalogue once confirmed");
      NFT_ART = ""; NFT_TRAITS = [];
      $("n-name").value = ""; $("n-desc").value = ""; $("n-external").value = "";
      $("n-webvalidate").value = ""; $("n-editions").value = "1";
      $("nft-art-drop").classList.remove("filled");
      $("nft-art-drop").style.backgroundImage = "";
      $("nft-art-hint").innerText = "+ choose artwork";
      renderTraits();
      studioShow("hub");
    });
  }
  fitArt(function () {
    MDS.cmd("getaddress", function (res) {
      if (!res.status || !res.response || !res.response.publickey) {
        status.innerText = "could not fetch the signing key - node offline?";
        return;
      }
      post(res.response.publickey);   // ALWAYS signed
    });
  });
};

/* ---------- custom token ---------- */

function renderPairs() {
  var box = $("t-pairs");
  box.innerHTML = "";
  TOKEN_PAIRS.forEach(function (p, i) {
    var row = document.createElement("div");
    row.className = "pair-row";
    var k = document.createElement("input");
    k.type = "text"; k.value = p[0]; k.readOnly = true;
    var v = document.createElement("input");
    v.type = "text"; v.value = p[1]; v.readOnly = true;
    var del = document.createElement("button");
    del.className = "row-del"; del.innerText = "×";
    del.onclick = function () { TOKEN_PAIRS.splice(i, 1); renderPairs(); };
    row.appendChild(k); row.appendChild(v); row.appendChild(del);
    box.appendChild(row);
  });
  updateTokenPreview();
}

$("t-pair-add").onclick = function () {
  var k = $("t-pair-key").value.trim();
  var v = $("t-pair-value").value.trim();
  if (!k || !v) { toast("both field and value needed"); return; }
  if (RESERVED_KEYS.indexOf(k.toLowerCase()) >= 0) { toast("'" + k + "' is a reserved field"); return; }
  if (TOKEN_PAIRS.length >= 10) { toast("10 custom fields maximum"); return; }
  TOKEN_PAIRS.push([k, v]);
  $("t-pair-key").value = ""; $("t-pair-value").value = "";
  renderPairs();
};

$("t-icon-file").onchange = function () {
  var f = this.files[0];
  this.value = "";
  if (!f) { return; }
  compressIconFile(f, function (b64) {
    if (!b64) { toast("could not fit that image into an icon"); return; }
    TOKEN_ICON = b64;
    $("t-icon-slot").style.backgroundImage = "url(\"" + cssUrl(b64src(b64)) + "\")";
    $("t-icon-glyph").innerText = "";
    updateTokenPreview();
  });
};

function tokenIconValue(placeholder) {
  var url = $("t-iconurl").value.trim();
  if (url) { return url; }
  if (TOKEN_ICON) {
    /* closed element — strict-XML wallet parsers need </artimage> */
    return placeholder ? "<artimage>" + TOKEN_ICON.length + " chars</artimage>"
                       : "<artimage>" + TOKEN_ICON + "</artimage>";
  }
  return "";
}

function tokenMeta(placeholder) {
  var meta = { name: $("t-name").value.trim() || "Unnamed" };
  var desc = $("t-desc").value.trim();
  var tick = $("t-ticker").value.trim();
  var icon = tokenIconValue(placeholder);
  if (desc) { meta.description = desc; }
  if (tick) { meta.ticker = tick; }
  if (icon) { meta.url = icon; }
  TOKEN_PAIRS.forEach(function (p) {
    if (RESERVED_KEYS.indexOf(p[0].toLowerCase()) < 0) { meta[p[0]] = p[1]; }
  });
  return meta;
}

function updateTokenPreview() {
  if (!$("t-preview")) { return; }
  $("t-preview").innerText = JSON.stringify(tokenMeta(true), null, 2);
}

["t-name", "t-ticker", "t-supply", "t-decimals", "t-desc", "t-iconurl"]
  .forEach(function (id) { $(id).addEventListener("input", updateTokenPreview); });

$("token-mint-btn").onclick = function () {
  var status = $("token-status");
  var name = $("t-name").value.trim();
  var supply = parseInt($("t-supply").value, 10) || 0;
  var dec = parseInt($("t-decimals").value, 10) || 0;
  if (!name) { status.innerText = "a name is required"; return; }
  if (supply < 1) { status.innerText = "supply must be a positive whole number"; return; }
  if (dec < 0 || dec > 16) { status.innerText = "decimals must be 0–16"; return; }
  if (!validCmdUrl($("t-iconurl").value.trim())) {
    status.innerText = "icon URL must not contain spaces, quotes or semicolons"; return;
  }
  status.innerText = "minting\u2026";
  /* ALWAYS SIGNED: the record (icon + pairs + signature) must stay splittable
   * - auto-slim the icon into the envelope rather than refuse. */
  function tokenFit(cb) {
    var metaLen = JSON.stringify(tokenMeta(false)).length;
    if (metaLen <= ENGINE_META_MAX) { cb(); return; }
    if (!TOKEN_ICON) {
      status.innerText = "record " + metaLen + "B exceeds the " + ENGINE_META_MAX +
        "B signed budget - shorten the description or custom fields";
      return;
    }
    var iconBudget = ENGINE_META_MAX - (metaLen - TOKEN_ICON.length) - 24;
    reshrinkB64(TOKEN_ICON, Math.max(1200, iconBudget), function (out) {
      if (out === null || JSON.stringify(tokenMeta(false)).length - TOKEN_ICON.length + out.length > ENGINE_META_MAX) {
        status.innerText = "icon + fields exceed the signed record budget - " +
          "use a hosted icon URL or shorter fields";
        return;
      }
      TOKEN_ICON = out;
      toast("icon auto-slimmed to keep the token signed");
      cb();
    });
  }
  tokenFit(function () {
  MDS.cmd("getaddress", function (ka) {
    if (!ka.status || !ka.response || !ka.response.publickey) {
      status.innerText = "could not fetch the signing key - node offline?";
      return;
    }
  MDS.cmd("tokencreate name:" + JSON.stringify(tokenMeta(false)) +
          " amount:" + supply + " decimals:" + dec +
          " signtoken:" + ka.response.publickey, function (res) {
    if (!res.status) {
      status.innerText = "mint failed: " + (res.error || "node refused");
      return;
    }
    status.innerText = "";
    toast("token minted — appears in the catalogue once confirmed");
    TOKEN_ICON = ""; TOKEN_PAIRS = [];
    $("t-name").value = ""; $("t-ticker").value = ""; $("t-desc").value = "";
    $("t-iconurl").value = ""; $("t-supply").value = "1000000"; $("t-decimals").value = "0";
    $("t-icon-slot").style.backgroundImage = "";
    $("t-icon-glyph").innerText = "+";
    renderPairs();
    studioShow("hub");
  });
  });
  });
};

/* ---------- singles & tokens catalogue ---------- */


/* Token metadata lives at two possible levels: our mints put everything in
 * the name-object; marketplace mints nest the name-object but keep url &co
 * at the top level. Read BOTH — exactly like the native app's parseMeta. */
function tokenField(row, key) {
  var t = row.token;
  if (typeof t !== "object" || !t) { return ""; }
  var m = (t.name && typeof t.name === "object") ? t.name : null;
  return (m && m[key]) || t[key] || "";
}
function tokenIconOf(row) {
  return tokenField(row, "url") || tokenField(row, "image") || tokenField(row, "icon");
}

function loadSingles() {
  MDS.cmd("balance", function (res) {
    if (!res.status) { return; }
    var bal = res.response || [];
    var singles = [], tokens = [];
    for (var i = 0; i < bal.length; i++) {
      var row = bal[i];
      if (row.tokenid === "0x00") { continue; }
      var t = row.token;
      if (typeof t !== "object" || !t) { tokens.push(row); continue; }
      // StateNFT collections live in the collections grid, not here
      if (tokenField(row, "mode") && tokenField(row, "size")) { continue; }
      var total = parseInt(row.total, 10) || 0;
      var isNft = tokenField(row, "nft") === "true" ||
        (tokenIconOf(row) && total > 0 && total <= 100 && !tokenField(row, "ticker"));
      if (isNft) { singles.push(row); } else { tokens.push(row); }
    }
    var sBox = $("singles-list"); sBox.innerHTML = "";
    $("singles-head").classList.toggle("hidden", singles.length === 0);
    $("singles-count").innerText = singles.length || "";
    singles.forEach(function (row) { sBox.appendChild(singleCard(row)); });
    var tBox = $("tokens-list"); tBox.innerHTML = "";
    $("tokens-head").classList.toggle("hidden", tokens.length === 0);
    $("tokens-count").innerText = tokens.length || "";
    tokens.forEach(function (row) { tBox.appendChild(tokenRowEl(row)); });
  });
}

function singleCard(row) {
  var el = document.createElement("div");
  el.className = "nft-card";
  el.innerHTML =
    "<img class='nft-img' alt=''/>" +
    "<div class='nft-body'><div class='nft-no'></div><div class='cc-name'></div>" +
    "<div class='cc-sub'></div></div>";
  var img = el.querySelector("img");
  img.onerror = function () { this.onerror = null; this.src = placeholderSVG(1); };
  img.src = iconSrc(tokenIconOf(row)) || placeholderSVG(1);
  el.querySelector(".nft-no").textContent = "ed. " + (row.total || "1");
  el.querySelector(".cc-name").textContent = tokenField(row, "name") || (typeof row.token === "string" ? row.token : "NFT");
  el.querySelector(".cc-sub").textContent = shortHash(row.tokenid);
  el.onclick = function () { copyText(row.tokenid, null); };
  return el;
}

function tokenRowEl(row) {
  var t = row.token;
  var name = (typeof t === "string") ? t : (tokenField(row, "name") || "Token");
  var el = document.createElement("div");
  el.className = "token-row";
  el.innerHTML =
    "<img alt=''/><div class='tr-copy'><div class='tr-name'></div>" +
    "<div class='tr-sub'></div></div><span class='chip-hash'>id</span>";
  var img = el.querySelector("img");
  img.onerror = function () { this.onerror = null; this.src = placeholderSVG(1); };
  img.src = iconSrc(tokenIconOf(row)) || placeholderSVG(1);
  var tick = tokenField(row, "ticker");
  el.querySelector(".tr-name").textContent =
    name + (tick ? " · " + ("" + tick).toUpperCase() : "");
  el.querySelector(".tr-sub").textContent =
    "supply " + (row.total || "?") + " · " + shortHash(row.tokenid);
  el.querySelector(".chip-hash").onclick = function () { copyText(row.tokenid, this); };
  return el;
}

/* ---------- send the whole collection (background queue) ----------
 * The dispatch itself lives in sendall.js, driven block by block from
 * service.js — it survives this page closing. Here we only enqueue and
 * report the queue state. */

function openSendAll() {
  if (!LAST) { return; }
  var coins = [];
  Object.keys(LAST.byIdx).forEach(function (ix) {
    var c = LAST.byIdx[ix];
    if (c && LAST.mineIds[c.coinid]) { coins.push(c); }
  });
  if (!coins.length) { toast("no owned lots to send"); return; }
  $("sendall-count").innerText = coins.length + " sealed lot" +
    (coins.length === 1 ? "" : "s") + " in this wallet will be dispatched.";
  $("sendall-status").innerText = "";
  $("sendall-go").disabled = false;
  MDS.sql("SELECT * FROM send_queue WHERE tokenid='" + engineSqlEsc(TOKENID) +
          "' ORDER BY id DESC LIMIT 1", function (res) {
    var s = (res.rows && res.rows.length) ? res.rows[0] : null;
    if (s && s.STATUS === "ACTIVE") {
      $("sendall-status").innerText = "a send is already running — " +
        coins.length + " lot(s) still to depart.";
      $("sendall-go").disabled = true;
    } else if (s && s.STATUS === "ERROR") {
      $("sendall-status").innerText = "last send errored: " + (s.ERROR || "?") +
        " — you can start again.";
    }
  });
  $("sendall-backdrop").classList.remove("hidden");
}

function sendAllGo() {
  var to = $("sendall-recipient").value.trim().replace(/ /g, "");
  var status = $("sendall-status");
  if (!sendValidAddress(to)) {
    status.innerText = "recipient must be a plain 0x… or Mx… address"; return;
  }
  var coins = [];
  Object.keys(LAST.byIdx).forEach(function (ix) {
    var c = LAST.byIdx[ix];
    if (c && LAST.mineIds[c.coinid]) { coins.push(c); }
  });
  if (!coins.length) { status.innerText = "no owned lots to send"; return; }
  $("sendall-go").disabled = true;
  MDS.sql("SELECT id FROM send_queue WHERE tokenid='" + engineSqlEsc(TOKENID) +
          "' AND status='ACTIVE'", function (r) {
    if (r.rows && r.rows.length) {
      status.innerText = "a send is already running for this collection";
      return;
    }
    MDS.cmd("block", function (b) {
      var tip = b.status ? parseInt(b.response.block, 10) : 0;
      MDS.sql("INSERT INTO send_queue (tokenid,recipient,total,status," +
              "startedat) VALUES ('" + engineSqlEsc(TOKENID) + "','" + to +
              "'," + coins.length + ",'ACTIVE'," + tip + ")",
        function () {
          MDS.comms.solo("send", function () {});
          status.innerText = "";
          toast("Sending " + coins.length + " lots in the background — all " +
                "transfers post now and retry each block until the chain " +
                "confirms; you can close this page");
          $("sendall-recipient").value = "";
          setTimeout(function () {
            $("sendall-backdrop").classList.add("hidden");
            renderGallery();
          }, 1400);
        });
    });
  });
}

$("sendall-btn").onclick = openSendAll;
$("sendall-cancel").onclick = function () { $("sendall-backdrop").classList.add("hidden"); };
$("sendall-go").onclick = sendAllGo;
$("sendall-backdrop").addEventListener("click", function (e) {
  if (e.target === this) { this.classList.add("hidden"); }
});
