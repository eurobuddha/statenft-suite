/* FILTR narrow-viewport tab strip.
 *
 * On viewports <=900px the CSS pins the image stage on top and turns the two
 * side rails into a single flickable pane selected by the sticky bottom tab
 * bar (#filtr-tabs). This file only toggles the .ftab-on / .on classes — it
 * never moves or rebuilds the panes, so every element id filtr.js binds to
 * keeps working in both layouts. On desktop the tab bar is display:none and
 * the added classes are inert.
 */
"use strict";

var FILTR_TAB_MAP = [
  { tab: "filtr-tab-import",   pane: "filtr-panel-import" },
  { tab: "filtr-tab-presets",  pane: "filtr-panel-presets" },
  { tab: "filtr-tab-effects",  pane: "filtr-panel-effects" },
  { tab: "filtr-tab-tune",     pane: "filtr-acc-effect" },
  { tab: "filtr-tab-adjust",   pane: "filtr-acc-adjust" },
  { tab: "filtr-tab-post",     pane: "filtr-acc-post" },
  { tab: "filtr-tab-annotate", pane: "filtr-acc-annotate" },
  { tab: "filtr-tab-save",     pane: "filtr-acc-save" },
];

var FILTR_TAB_ACTIVE = "filtr-panel-import";

function filtrTabSelect(paneId) {
  FILTR_TAB_ACTIVE = paneId;
  for (var i = 0; i < FILTR_TAB_MAP.length; i++) {
    var m = FILTR_TAB_MAP[i];
    var pane = document.getElementById(m.pane);
    var tab = document.getElementById(m.tab);
    if (pane) { pane.classList.toggle("ftab-on", m.pane === paneId); }
    if (tab) {
      tab.classList.toggle("on", m.pane === paneId);
      if (m.pane === paneId && tab.scrollIntoView) {
        tab.scrollIntoView({ block: "nearest", inline: "center" });
      }
    }
  }
}

(function filtrTabsInit() {
  for (var i = 0; i < FILTR_TAB_MAP.length; i++) {
    (function (m) {
      var tab = document.getElementById(m.tab);
      if (tab) { tab.addEventListener("click", function () { filtrTabSelect(m.pane); }); }
    })(FILTR_TAB_MAP[i]);
  }
  /* first image load flicks Import -> Effects so the controls are at hand */
  var meta = document.getElementById("filtr-meta");
  if (meta && typeof MutationObserver !== "undefined") {
    var advanced = false;
    new MutationObserver(function () {
      if (advanced || FILTR_TAB_ACTIVE !== "filtr-panel-import") { return; }
      if ((meta.textContent || "").indexOf("no image") === -1) {
        advanced = true;
        filtrTabSelect("filtr-panel-effects");
      }
    }).observe(meta, { childList: true, characterData: true, subtree: true });
  }
  filtrTabSelect(FILTR_TAB_ACTIVE);
})();
