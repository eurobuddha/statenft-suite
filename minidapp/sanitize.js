/* StateNFT — sanitizers for untrusted chain metadata.
 *
 * Token metadata (name, description, icon url, webvalidate/external URLs) and
 * coin state are written by WHOEVER MINTED OR LAST SPENT the coin. Anyone can
 * send this wallet an NFT and have it adopted automatically, and this MiniDapp
 * holds WRITE permission on the node — so every one of those values is
 * untrusted input. Never interpolate it into markup; never navigate to it or
 * feed it to CSS without passing it through here first.
 *
 * ES5 only (shared with the page and testable standalone under node).
 * Regression tests: test/sanitize.test.js — every helper below has BOTH an
 * "attack is rejected" and a "real data still passes" assertion.
 */

/* Chain metadata (token name, description, webvalidate/external URLs) is written
 * by WHOEVER MINTED THE TOKEN — anyone can send us an NFT and have it adopted
 * automatically. It is untrusted input: never interpolate it into markup, and
 * never navigate to it without an http(s) scheme check. */
function safeUrl(url) {
  url = "" + url;
  // http(s) only, and no characters that could break out of an attribute or a
  // CSS declaration if this value is ever interpolated rather than assigned
  if (!/^https?:\/\//i.test(url)) { return ""; }
  if (/["'<>`\\\s]/.test(url)) { return ""; }
  return url;
}

/* Safe value for a CSS url("...") - either a data: image URI we generated or
 * an http(s) URL. Only a double quote, backslash or newline can escape a
 * double-quoted url() token; semicolons, parens and single quotes are legal
 * inside it and MUST stay allowed (a base64 data URI contains ";base64,",
 * and our placeholder SVG carries single quotes). */
function cssUrl(src) {
  if (!src) { return ""; }
  src = "" + src;
  if (/["\\\r\n]/.test(src)) { return ""; }
  if (/^data:image\/(jpeg|png|gif|webp|svg\+xml)[;,]/i.test(src)) { return src; }
  return safeUrl(src);
}

/* Decode the first few bytes of a base64 payload without atob/Buffer so this
 * file works identically in the browser and the node test sandbox. */
function b64Head(b64, n) {
  var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = [];
  for (var i = 0; i + 3 < b64.length && out.length < n; i += 4) {
    var c0 = A.indexOf(b64[i]), c1 = A.indexOf(b64[i + 1]);
    var c2 = A.indexOf(b64[i + 2]), c3 = A.indexOf(b64[i + 3]);
    if (c0 < 0 || c1 < 0) { break; }
    out.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) { out.push(((c1 & 15) << 4) | (c2 >> 2)); }
    if (c2 >= 0 && c3 >= 0) { out.push(((c2 & 3) << 6) | c3); }
  }
  return out;
}

/* Sniff a sealed b64 payload's mime from its magic bytes (WebP/JPEG/PNG/SVG). */
function b64Mime(b64) {
  var h = b64Head(b64, 16);
  function ch(i) { return h[i] === undefined ? -1 : h[i]; }
  if (ch(0) === 82 && ch(1) === 73 && ch(2) === 70 && ch(3) === 70 &&
      ch(8) === 87 && ch(9) === 69 && ch(10) === 66 && ch(11) === 80) { return "image/webp"; }
  if (ch(0) === 0xFF && ch(1) === 0xD8) { return "image/jpeg"; }
  if (ch(0) === 0x89 && ch(1) === 80 && ch(2) === 78 && ch(3) === 71) { return "image/png"; }
  var text = "";
  for (var i = 0; i < h.length; i++) { text += String.fromCharCode(h[i]); }
  text = text.replace(/^\s+/, "").toLowerCase();
  if (text.indexOf("<svg") === 0 || text.indexOf("<?xml") === 0) { return "image/svg+xml"; }
  return "image/jpeg";
}

/* Wallet icon from token metadata: either a hosted http(s) URL or the
 * <artimage> base64 convention. Both are attacker-supplied, so the scheme is
 * allowlisted and the payload restricted to base64 characters. */
function iconSrc(icon) {
  if (!icon) { return null; }
  var raw = ("" + icon).indexOf("<artimage>") === 0
    ? ("" + icon).substring(10) : ("" + icon);
  var hosted = safeUrl(raw);
  if (hosted) { return hosted; }
  if (/^[A-Za-z0-9+/=]+$/.test(raw)) { return "data:" + b64Mime(raw) + ";base64," + raw; }
  return null;
}

function placeholderSVG(idx) {
  var svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>" +
    "<rect width='200' height='200' fill='#0D0D11'/>" +
    "<circle cx='100' cy='88' r='52' fill='none' stroke='#D8B76E' stroke-opacity='0.55' stroke-width='1.5'/>" +
    "<text x='100' y='102' font-family='Georgia' font-style='italic' font-size='40' fill='#D8B76E' text-anchor='middle'>" + idx + "</text>" +
    "<text x='100' y='170' font-family='monospace' font-size='9' letter-spacing='4' fill='#8B8B98' text-anchor='middle'>STATE NFT</text>" +
    "</svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
