/* Atelier photo intake — deterministic median-cut color quantizer. ES5,
 * page-side only (service.js never loads this; the mint snapshots final
 * SVGs into SQL). The studio center-crops the picked photo onto a 48x48
 * canvas and feeds the ImageData here; the result is the master grid the
 * photo pack (art.js artSetPhoto) turns into pixel-cartoon variants.
 * Everything happens on-device — the original photo never leaves the page. */

function pqHex2(v) {
  v = Math.max(0, Math.min(255, Math.round(v)));
  var h = v.toString(16);
  return h.length < 2 ? "0" + h : h;
}

/* rgba: flat Uint8ClampedArray (ImageData.data), w*h pixels, alpha ignored.
 * Returns { cols, rows, cells: [palette index per pixel], palette: [#hex] }.
 * Deterministic: box choice, split channel and ties all resolve by fixed
 * order, so the same photo always quantizes to the same master. */
function photoQuantize(rgba, w, h, k) {
  var total = w * h;
  var px = new Array(total);
  var i;
  for (i = 0; i < total; i++) {
    px[i] = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
  }
  var all = new Array(total);
  for (i = 0; i < total; i++) { all[i] = i; }
  var boxes = [all];

  function boxRange(idxs) {
    var mins = [255, 255, 255], maxs = [0, 0, 0];
    for (var j = 0; j < idxs.length; j++) {
      var p = px[idxs[j]];
      for (var c = 0; c < 3; c++) {
        if (p[c] < mins[c]) { mins[c] = p[c]; }
        if (p[c] > maxs[c]) { maxs[c] = p[c]; }
      }
    }
    var ch = 0, range = maxs[0] - mins[0];
    if (maxs[1] - mins[1] > range) { ch = 1; range = maxs[1] - mins[1]; }
    if (maxs[2] - mins[2] > range) { ch = 2; range = maxs[2] - mins[2]; }
    return { ch: ch, range: range };
  }

  while (boxes.length < k) {
    var bi = -1, bRange = 0, bCh = 0;
    for (i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) { continue; }
      var br = boxRange(boxes[i]);
      if (br.range > bRange) { bRange = br.range; bi = i; bCh = br.ch; }
    }
    if (bi < 0 || bRange === 0) { break; }   // flat boxes only — done
    var idxs = boxes[bi];
    (function (c) {
      idxs.sort(function (a, b) { return (px[a][c] - px[b][c]) || (a - b); });
    })(bCh);
    var half = idxs.length >> 1;
    boxes.splice(bi, 1, idxs.slice(0, half), idxs.slice(half));
  }

  var palette = [];
  var cells = new Array(total);
  for (i = 0; i < boxes.length; i++) {
    var sum = [0, 0, 0], list = boxes[i];
    for (var j = 0; j < list.length; j++) {
      var p = px[list[j]];
      sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2];
      cells[list[j]] = i;
    }
    palette.push("#" + pqHex2(sum[0] / list.length) +
                 pqHex2(sum[1] / list.length) + pqHex2(sum[2] / list.length));
  }
  return { cols: w, rows: h, cells: cells, palette: palette };
}

/* node-side tests need this on module.exports; the page just uses globals */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { photoQuantize: photoQuantize };
}
