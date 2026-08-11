/* Hosting (MiniDapp) — upload chosen photos to the user's own storage and
 * hand back the public URLs the mint seals. Browser side of the Android
 * Hosting.java: the pure helpers (slug / fillTemplate / publicUrl /
 * parseKuboAdd) are byte-parity with the Java, pinned by the SHARED fixtures
 * in test/fixtures/hosting/parity.json. Transport is browser fetch() —
 * MDS.net.POST is string-only, no good for binary — so the HTTP backends are
 * WebDAV, kubo, Pinata and GitHub (all CORS-reachable when the user enables
 * it). SFTP is Android-only; hidden here. Verification uses MDS.net.GET
 * (node-side, no CORS). Profiles live in MDS.keypair (on-node, per-dapp). */
"use strict";

var HOSTING = (function () {

  var TYPES = ["webdav", "kubo", "pinata", "github"];   // no sftp in the browser

  /* ---- storage (MDS keypair) ---- */

  function load(cb) {
    MDS.keypair.get("hosting_profiles", function (r) {
      var arr = [];
      try {
        if (r && r.status && r.response && r.response.value) {
          arr = JSON.parse(decodeURIComponent(r.response.value));
        }
      } catch (e) { arr = []; }
      cb(Array.isArray(arr) ? arr : []);
    });
  }

  function save(profiles, cb) {
    MDS.keypair.set("hosting_profiles", encodeURIComponent(JSON.stringify(profiles)),
      function (r) { if (cb) cb(r && r.status); });
  }

  function getDefault(profiles) {
    for (var i = 0; i < profiles.length; i++) if (profiles[i].def) return profiles[i];
    return profiles.length ? profiles[0] : null;
  }

  /* ---- pure helpers (parity with Hosting.java) ---- */

  function slug(s) {
    if (s == null) s = "";
    var out = ("" + s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (out.length > 40) out = out.substring(0, 40).replace(/-$/, "");
    return out === "" ? "x" : out;
  }

  function fillTemplate(tpl, tokens) {
    var out = tpl == null ? "" : tpl;
    for (var k in tokens) {
      if (tokens.hasOwnProperty(k)) {
        out = out.split("{" + k + "}").join(tokens[k] == null ? "" : tokens[k]);
      }
    }
    return out;
  }

  function ts36() { return Math.floor(Date.now() / 1000).toString(36); }
  function rand4() { return (0x10000 + Math.floor(Math.random() * 0xFFFF)).toString(16).substring(1); }

  function trimSlash(s) {
    if (!s) return "";
    return s.charAt(s.length - 1) === "/" ? s.substring(0, s.length - 1) : s;
  }

  function cfgOf(p) { return p[p.type] || {}; }

  function publicUrl(p, relPathOrCid, isDir) {
    var c = cfgOf(p), type = p.type, tail = isDir ? "/" : "";
    if (type === "kubo" || type === "pinata") {
      var gw = trimSlash(c.gateway || "");
      if (!gw && type === "pinata") gw = "https://gateway.pinata.cloud";
      return gw + "/ipfs/" + relPathOrCid + tail;
    }
    if (type === "github") {
      if (c.serve === "pages") return trimSlash(c.pagesPrefix || "") + "/" + relPathOrCid + tail;
      return "https://raw.githubusercontent.com/" + c.owner + "/" + c.repo
        + "/" + (c.branch || "main") + "/" + relPathOrCid + tail;
    }
    return trimSlash(c.urlPrefix || "") + "/" + relPathOrCid + tail;
  }

  function parseKuboAdd(ndjson, dirName) {
    if (!ndjson) return "";
    var lines = ndjson.split("\n"), last = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      try {
        var o = JSON.parse(line);
        if (o.Name === dirName) return o.Hash || "";
        if (o.Hash) last = o.Hash;
      } catch (e) { }
    }
    return (dirName == null || dirName === "") ? last : "";
  }

  /* ---- transport (browser fetch) ---- */

  function b64(bytes, cb) {
    var blob = bytes instanceof Blob ? bytes : new Blob([bytes]);
    var r = new FileReader();
    r.onload = function () { cb(("" + r.result).split(",")[1]); };
    r.readAsDataURL(blob);
  }

  // WebDAV PUT (Basic auth). files: [{blob, rel, mime}]
  function putWebdav(p, files, done) {
    var c = cfgOf(p), endpoint = trimSlash(c.endpoint || "");
    var auth = c.user ? ("Basic " + btoa(c.user + ":" + (c.password || ""))) : null;
    var i = 0, base = "";
    (function next() {
      if (i >= files.length) { done(null, files.length === 1 ? publicUrl(p, files[0].rel, false) : base); return; }
      var f = files[i];
      var headers = { "Content-Type": f.mime || "application/octet-stream" };
      if (auth) headers.Authorization = auth;
      fetch(endpoint + "/" + f.rel, { method: "PUT", headers: headers, body: f.blob })
        .then(function (res) {
          if (!res.ok) { done("WebDAV PUT failed (HTTP " + res.status + ") at " + f.rel); return; }
          base = publicUrl(p, f.rel.replace(/[^/]*$/, ""), false);
          i++; next();
        })
        .catch(function (e) { done("WebDAV unreachable — " + e + " (check CORS on your server)"); });
    })();
  }

  // kubo /api/v0/add — one multipart with N parts under "dir/"
  function putKubo(p, files, isDir, done) {
    var c = cfgOf(p);
    var fd = new FormData();
    for (var i = 0; i < files.length; i++) {
      fd.append("file", files[i].blob, (isDir ? "dir/" : "") + files[i].name);
    }
    var pin = c.pin === false ? "false" : "true";
    fetch(trimSlash(c.apiUrl || "") + "/api/v0/add?pin=" + pin + "&cid-version=1&progress=false",
      { method: "POST", body: fd })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var cid = parseKuboAdd(text, isDir ? "dir" : "");
        if (!cid) { done("kubo add returned no CID"); return; }
        done(null, publicUrl(p, cid, isDir));
      })
      .catch(function (e) { done("kubo unreachable — " + e + " (enable CORS on the node: ipfs config API.HTTPHeaders.Access-Control-Allow-Origin)"); });
  }

  function putPinata(p, files, isDir, done) {
    var c = cfgOf(p);
    if (!c.jwt) { done("No Pinata JWT in the profile"); return; }
    var fd = new FormData();
    for (var i = 0; i < files.length; i++) {
      fd.append("file", files[i].blob, (isDir ? "dir/" : "") + files[i].name);
    }
    fetch("https://api.pinata.cloud/pinning/pinFileToIPFS",
      { method: "POST", headers: { Authorization: "Bearer " + c.jwt }, body: fd })
      .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j, status: res.status }; }); })
      .then(function (r) {
        if (!r.ok) { done("Pinata pin failed (HTTP " + r.status + ")" + (r.status === 401 ? " — check the JWT" : "")); return; }
        if (!r.j.IpfsHash) { done("Pinata returned no CID"); return; }
        done(null, publicUrl(p, r.j.IpfsHash, isDir));
      })
      .catch(function (e) { done("Pinata unreachable — " + e); });
  }

  // GitHub contents API PUT (JSON b64). No sha -> 422 on overwrite.
  function putGithub(p, files, done) {
    var c = cfgOf(p), i = 0, base = "";
    (function next() {
      if (i >= files.length) { done(null, files.length === 1 ? publicUrl(p, files[0].rel, false) : base); return; }
      var f = files[i];
      b64(f.blob, function (content) {
        fetch("https://api.github.com/repos/" + c.owner + "/" + c.repo + "/contents/" + f.rel,
          { method: "PUT",
            headers: { Authorization: "Bearer " + c.token, Accept: "application/vnd.github+json",
                       "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
            body: JSON.stringify({ message: "atelier: " + f.rel, content: content, branch: c.branch || "main" }) })
          .then(function (res) {
            if (res.status === 422) { done("GitHub refused: " + f.rel + " already exists (never overwritten)"); return; }
            if (res.status === 401 || res.status === 403) { done("GitHub auth failed (HTTP " + res.status + ") — check the token"); return; }
            if (!res.ok) { done("GitHub upload failed (HTTP " + res.status + ") at " + f.rel); return; }
            base = publicUrl(p, f.rel.replace(/[^/]*$/, ""), false);
            i++; next();
          })
          .catch(function (e) { done("GitHub unreachable — " + e); });
      });
    })();
  }

  /* ---- orchestration ---- */

  // single file -> {blob, mime, ext}; lane names the field
  function uploadSingle(p, blob, mime, ext, collSlug, laneName, done) {
    var rel = fillTemplate(p.pathTemplate || "atelier/{collection}/{name}-{ts}{ext}", {
      collection: collSlug, name: laneName, ext: ext, ts: ts36(), rand: rand4(), idx: ""
    });
    var files = [{ blob: blob, rel: rel, name: rel.replace(/^.*\//, ""), mime: mime }];
    dispatch(p, files, false, function (err, url) { done(err, url); });
  }

  // N plates -> base + ext
  function uploadPlates(p, plates, collSlug, done) {
    // plates: [{blob, mime, ext}] in order; homogeneous ext enforced by caller
    var dirRel = fillTemplate(p.dirTemplate || "atelier/{collection}-{ts}", {
      collection: collSlug, ts: ts36(), rand: rand4()
    });
    var files = [];
    for (var i = 0; i < plates.length; i++) {
      files.push({ blob: plates[i].blob, rel: dirRel + "/" + (i + 1) + plates[i].ext,
                   name: (i + 1) + plates[i].ext, mime: plates[i].mime });
    }
    dispatch(p, files, true, function (err, base) { done(err, base); });
  }

  function dispatch(p, files, isDir, done) {
    switch (p.type) {
      case "webdav": putWebdav(p, files, done); break;
      case "kubo":   putKubo(p, files, isDir, done); break;
      case "pinata": putPinata(p, files, isDir, done); break;
      case "github": putGithub(p, files, done); break;
      default: done("This destination type isn't available in the browser (SFTP is Android-only)");
    }
  }

  /* ---- verification (node-side GET, no CORS) ---- */

  function verify(urls, done) {
    var i = 0;
    (function next() {
      if (i >= urls.length) { done(null); return; }
      MDS.net.GET(urls[i], function (res) {
        if (!res || !res.status || !res.response || !res.response.web) {
          done("Hosted URL does not serve: " + urls[i]); return;
        }
        i++; next();
      });
    })();
  }

  function testProfile(p, done) {
    var nonce = "atelier-" + Date.now();
    var blob = new Blob([nonce], { type: "text/plain" });
    var rel = fillTemplate("atelier/probe/{ts}-{rand}.txt", { ts: ts36(), rand: rand4() });
    var files = [{ blob: blob, rel: rel, name: rel.replace(/^.*\//, ""), mime: "text/plain" }];
    dispatch(p, files, false, function (err, url) {
      if (err) { done("failed: " + err); return; }
      verify([url], function (verr) {
        done(verr ? ("uploaded ✓ but fetch failed: " + verr) : ("uploaded ✓ · fetched ✓\n" + url));
      });
    });
  }

  return {
    TYPES: TYPES, load: load, save: save, getDefault: getDefault,
    slug: slug, fillTemplate: fillTemplate, publicUrl: publicUrl, parseKuboAdd: parseKuboAdd,
    ts36: ts36, rand4: rand4,
    uploadSingle: uploadSingle, uploadPlates: uploadPlates, verify: verify, testProfile: testProfile
  };
})();
