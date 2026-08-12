/* FILTR narrow-viewport bottom-sheet controller (replaces filtr-tabs.js).
 *
 * On desktop (>900px) FILTR renders its untouched 3-column layout and this file
 * does nothing. On a narrow viewport (the Android app always; MDS on a phone)
 * it turns FILTR into a Snapseed-style editor: the image is the hero, a fixed
 * category bar sits at the very bottom, and tapping a category slides a sheet UP
 * above the bar (never covering it) holding that category's controls.
 *
 * It works by MOVING the real control elements (by id) from the desktop rails /
 * toolbar into the sheet's per-category slots. Moving a DOM node preserves its
 * id and every event listener filtr.js bound, so the engine is untouched. When
 * the viewport widens past 900px the elements are moved back to their exact home
 * and the desktop layout is intact again.
 */
"use strict";

var FSHEET_BP = 900;

/* category -> the element ids to relocate into that category's sheet slot */
var FSHEET_CATS = {
  import:    ["filtr-drop", "filtr-meta"],
  transform: ["filtr-tool-crop", "filtr-rotl", "filtr-rotr", "filtr-fliph",
              "filtr-flipv", "filtr-tool-erase", "filtr-resize"],
  effects:   ["filtr-fx-list", "filtr-fx-controls"],
  presets:   ["filtr-presets"],
  adjust:    ["filtr-adjust-controls"],
  post:      ["filtr-post-controls"],
  annotate:  ["filtr-tool-bubble", "filtr-tool-text", "filtr-annotate-controls"],
  save:      ["filtr-save-mint", "filtr-save-photo", "filtr-save-png", "filtr-save-jpg"]
};
/* the persistent action buttons that move to the top bar */
var FSHEET_TOPBAR = ["filtr-undo", "filtr-redo", "filtr-ab", "filtr-fit", "filtr-apply"];
var FSHEET_TITLES = { import: "Import", transform: "Transform", effects: "Effects",
  presets: "Presets", adjust: "Adjust", post: "Post FX", annotate: "Annotate", save: "Save" };

var FSHEET_ON = false;        // are we currently in narrow (relocated) mode?
var FSHEET_HOMES = {};        // id -> { parent, next } for exact restore
var FSHEET_ACTIVE = null;
var FSHEET_SEEN_IMG = false;

function fsheetEl(id) { return document.getElementById(id); }

function fsheetRecordHome(id) {
  var el = fsheetEl(id);
  if (el && !FSHEET_HOMES[id]) {
    FSHEET_HOMES[id] = { parent: el.parentNode, next: el.nextSibling };
  }
  return el;
}

/** Move an element into a container (records its home first). */
function fsheetMove(id, into) {
  var el = fsheetRecordHome(id);
  if (el && into) into.appendChild(el);
}

/** Enter narrow mode: relocate the top-bar buttons and every category's controls
 *  into the sheet slots. Idempotent. */
function fsheetSetup() {
  if (FSHEET_ON) return;
  var topbar = fsheetEl("filtr-topbar");
  var sbody = fsheetEl("filtr-sbody");
  if (!topbar || !sbody) return;
  var i;
  for (i = 0; i < FSHEET_TOPBAR.length; i++) fsheetMove(FSHEET_TOPBAR[i], topbar);
  for (var cat in FSHEET_CATS) {
    if (!FSHEET_CATS.hasOwnProperty(cat)) continue;
    var slot = sbody.querySelector('.filtr-slot[data-cat="' + cat + '"]');
    var ids = FSHEET_CATS[cat];
    for (i = 0; i < ids.length; i++) fsheetMove(ids[i], slot);
  }
  FSHEET_ON = true;
}

/** Leave narrow mode: put every relocated element back exactly where it was. */
function fsheetTeardown() {
  if (!FSHEET_ON) return;
  fsheetClose();
  for (var id in FSHEET_HOMES) {
    if (!FSHEET_HOMES.hasOwnProperty(id)) continue;
    var el = fsheetEl(id), home = FSHEET_HOMES[id];
    if (el && home.parent) home.parent.insertBefore(el, home.next);
  }
  FSHEET_HOMES = {};
  FSHEET_ON = false;
  FSHEET_ACTIVE = null;
}

function fsheetOpen(cat) {
  if (!FSHEET_ON) return;
  var sbody = fsheetEl("filtr-sbody");
  var slots = sbody.querySelectorAll(".filtr-slot");
  for (var i = 0; i < slots.length; i++) {
    slots[i].classList.toggle("on", slots[i].getAttribute("data-cat") === cat);
  }
  fsheetEl("filtr-sheet-title").textContent = FSHEET_TITLES[cat] || "";
  fsheetEl("filtr-sheet").classList.add("on");
  fsheetEl("filtr-scrim").classList.add("on");
  var cats = document.querySelectorAll("#filtr-catbar .filtr-cat");
  for (var c = 0; c < cats.length; c++) {
    cats[c].classList.toggle("active", cats[c].getAttribute("data-cat") === cat);
  }
  FSHEET_ACTIVE = cat;
}

function fsheetClose() {
  var sheet = fsheetEl("filtr-sheet"), scrim = fsheetEl("filtr-scrim");
  if (sheet) { sheet.classList.remove("on"); sheet.classList.remove("big"); }
  if (scrim) scrim.classList.remove("on");
  var cats = document.querySelectorAll("#filtr-catbar .filtr-cat");
  for (var c = 0; c < cats.length; c++) cats[c].classList.remove("active");
  FSHEET_ACTIVE = null;
}

/** React to viewport width: set up or tear down the narrow layout, then re-fit
 *  the image to the (now differently-sized) stage — auto-fit is always on. */
function fsheetSync() {
  var narrow = window.innerWidth <= FSHEET_BP;
  if (narrow && !FSHEET_ON) fsheetSetup();
  else if (!narrow && FSHEET_ON) fsheetTeardown();
  if (typeof filtrFit === "function") {
    // let the layout settle, then fit-to-pane so the image is always centred
    setTimeout(function () { try { filtrFit(); } catch (e) {} }, 70);
  }
}

(function fsheetInit() {
  // wire the category bar
  var cats = document.querySelectorAll("#filtr-catbar .filtr-cat");
  for (var c = 0; c < cats.length; c++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        var cat = btn.getAttribute("data-cat");
        if (FSHEET_ACTIVE === cat) fsheetClose(); else fsheetOpen(cat);
      });
    })(cats[c]);
  }
  var close = fsheetEl("filtr-sheet-close"); if (close) close.addEventListener("click", fsheetClose);
  var scrim = fsheetEl("filtr-scrim"); if (scrim) scrim.addEventListener("click", fsheetClose);
  var grip = fsheetEl("filtr-grip");
  var expand = fsheetEl("filtr-sheet-expand");
  function toggleBig() { var s = fsheetEl("filtr-sheet"); if (s) s.classList.toggle("big"); }
  if (grip) grip.addEventListener("click", toggleBig);
  if (expand) expand.addEventListener("click", toggleBig);

  // first image load flicks open Effects so the editor is immediately usable
  var meta = fsheetEl("filtr-meta");
  if (meta && typeof MutationObserver !== "undefined") {
    new MutationObserver(function () {
      if (FSHEET_SEEN_IMG || !FSHEET_ON) return;
      if ((meta.textContent || "").indexOf("no image") === -1) {
        FSHEET_SEEN_IMG = true;
        fsheetOpen("effects");
      }
    }).observe(meta, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener("resize", fsheetSync);
  fsheetSync();
})();
