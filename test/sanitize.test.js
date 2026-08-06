/* Regression tests for minidapp/sanitize.js — the untrusted-metadata guards.
 *
 * WHY BOTH DIRECTIONS: v3.5.0 shipped a cssUrl blocklist that correctly
 * rejected every attack payload AND silently rejected every legitimate data:
 * image URI, so all on-chain artwork degraded to a placeholder for two
 * releases. A validator needs "real data still passes" assertions as much as
 * "the attack is blocked" ones. Every case below is paired.
 *
 * Run: node test/sanitize.test.js   (no dependencies, no DOM)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "minidapp", "sanitize.js");
const sandbox = {};
vm.runInNewContext(fs.readFileSync(SRC, "utf8"), sandbox, { filename: SRC });
const { safeUrl, cssUrl, iconSrc, placeholderSVG } = sandbox;

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) { failures++; }
  const shown = JSON.stringify(actual);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}` +
    (ok ? "" : `\n         expected ${JSON.stringify(expected)}, got ${shown}`));
}
function rejects(fn, name, input) { check(name, fn(input), fn === iconSrc ? null : ""); }
function accepts(fn, name, input) {
  const out = fn(input);
  const ok = !!out;
  if (!ok) { failures++; }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}` +
    (ok ? "" : `\n         expected a usable value, got ${JSON.stringify(out)}`));
}

/* Real values taken from live collections on this node, so the tests fail if a
 * guard ever stops accepting what the app itself produces. */
const REAL = {
  proofUrl: "https://eurobuddha.com/tokens/proofs/dlnwnfts.txt",
  animatedIcon: "https://eurobuddha.com/tokens/dlnw.gif",
  externalUrl: "https://eurobuddha.com/tokens/dlnw.html",
  embeddedJpeg: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD",
  artimageIcon: "<artimage>/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD",
};

console.log("safeUrl — attacks rejected");
rejects(safeUrl, "attribute break-out", "https://x' onmouseover='MDS.cmd(\"send address:0xEVIL amount:999\")");
rejects(safeUrl, "javascript: scheme", "javascript:alert(document.domain)");
rejects(safeUrl, "data:text/html", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==");
rejects(safeUrl, "css declaration escape", 'https://x");}#a{background:url(https://evil/');
rejects(safeUrl, "protocol-relative", "//evil.example/x.png");
rejects(safeUrl, "angle bracket", "https://x<script>alert(1)</script>");
rejects(safeUrl, "backtick", "https://x`whoami`");

console.log("safeUrl — real values accepted");
check("web proof URL", safeUrl(REAL.proofUrl), REAL.proofUrl);
check("animated gif icon", safeUrl(REAL.animatedIcon), REAL.animatedIcon);
check("external collection URL", safeUrl(REAL.externalUrl), REAL.externalUrl);
check("http (not just https)", safeUrl("http://127.0.0.1:9003/x.png"), "http://127.0.0.1:9003/x.png");

console.log("cssUrl — attacks rejected");
rejects(cssUrl, "quote closes url()", 'https://x");}body{background:url(https://evil/');
rejects(cssUrl, "backslash escape", "https://x\\22 );}body{x:1");
rejects(cssUrl, "newline injection", "https://x\n}body{background:red}");
rejects(cssUrl, "javascript: scheme", "javascript:alert(1)");
rejects(cssUrl, "data:text/html", "data:text/html;base64,PHN2Zz4=");

console.log("cssUrl — real values accepted  [the v3.5.0 regression]");
accepts(cssUrl, "embedded jpeg data URI (contains ';base64,')", REAL.embeddedJpeg);
accepts(cssUrl, "generated placeholder SVG (contains single quotes)", placeholderSVG(7));
accepts(cssUrl, "hosted animated gif", REAL.animatedIcon);

console.log("iconSrc — attacks rejected");
rejects(iconSrc, "javascript: scheme", "javascript:alert(1)");
rejects(iconSrc, "artimage with CSS escape", '<artimage>abc");}body{x:url(evil');
rejects(iconSrc, "artimage with markup", "<artimage><img src=x onerror=alert(1)>");
rejects(iconSrc, "empty", "");

console.log("iconSrc — real values accepted");
check("hosted animated gif", iconSrc(REAL.animatedIcon), REAL.animatedIcon);
check("raw webp b64 gets an honest webp mime",
  iconSrc("UklGRj8/Pz9XRUJQVlA4"), "data:image/webp;base64,UklGRj8/Pz9XRUJQVlA4");
check("webp data URI allowed in cssUrl",
  cssUrl("data:image/webp;base64,UklGRg=="), "data:image/webp;base64,UklGRg==");
accepts(iconSrc, "<artimage> base64 icon", REAL.artimageIcon);
check("artimage decodes to a jpeg data URI",
  iconSrc(REAL.artimageIcon).indexOf("data:image/jpeg;base64,") === 0, true);

console.log("placeholderSVG — self-consistency");
check("is an svg data URI", placeholderSVG(3).indexOf("data:image/svg+xml") === 0, true);
check("carries the item number", decodeURIComponent(placeholderSVG(3)).indexOf(">3<") > -1, true);

console.log(failures === 0
  ? "\nsanitize.test.js: all assertions passed"
  : `\nsanitize.test.js: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
