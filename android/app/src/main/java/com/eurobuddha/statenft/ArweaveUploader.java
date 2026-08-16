package com.eurobuddha.statenft;

import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.util.LinkedHashMap;
import java.util.List;

/** Arweave transport via ArDrive Turbo — permanent, pay-once storage with no
 *  account: identity is the profile's RSA JWK (see Ans104), balance attaches to
 *  its address (fund at https://turbo.ar.io), files under ~100 KiB are free.
 *  Single files → one data item at gateway/<txid>. Directories (edition plates)
 *  → N items + an arweave/paths manifest, so the sealed base+idx+ext contract
 *  holds at gateway/<manifestTxid>/<name>. Fresh URLs take ~5-10 min to start
 *  serving — callers trust the Turbo receipt (see MainActivity verify guards). */
final class ArweaveUploader implements Hosting.Uploader, Hosting.DirUploader {

    static final String DEFAULT_ENDPOINT = "https://upload.ardrive.io";
    static final String PAYMENT_SERVICE = "https://payment.ardrive.io";
    static final long FREE_TIER_BYTES = 100L * 1024;   // per-file Turbo subsidy threshold

    private final Hosting.Profile profile;
    private Ans104.Jwk jwk;

    ArweaveUploader(Hosting.Profile p) { this.profile = p; }

    private Ans104.Jwk jwk() throws Hosting.HostingException {
        if (jwk != null) return jwk;
        String json = profile.secret("jwk");
        if (json.isEmpty()) throw new Hosting.HostingException(
                "No Arweave wallet in this profile — open the destination editor and generate or paste one");
        try { jwk = Ans104.parseJwk(json); } catch (Exception e) {
            throw new Hosting.HostingException("Arweave wallet unreadable — re-paste the JWK JSON in the destination editor");
        }
        return jwk;
    }

    @Override public String putFile(byte[] bytes, String relPath, String mime) throws Hosting.HostingException {
        String id = uploadItem(bytes, mime == null ? "application/octet-stream" : mime, relPath);
        return Hosting.publicUrl(profile, id, false);
    }

    @Override public String putDirectory(List<Hosting.Entry> files, Hosting.ProgressCb cb) throws Hosting.HostingException {
        LinkedHashMap<String, String> nameToId = new LinkedHashMap<>();
        int done = 0;
        for (Hosting.Entry e : files) {
            String name = e.relPath.substring(e.relPath.lastIndexOf('/') + 1);
            nameToId.put(name, uploadItem(e.bytes, e.mime, e.relPath));
            done++;
            if (cb != null) cb.onProgress(done, files.size() + 1, name);
        }
        String indexName = nameToId.keySet().iterator().next();
        byte[] manifest = manifestJson(nameToId, indexName).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String manifestId = uploadItem(manifest, "application/x.arweave-manifest+json", "manifest");
        if (cb != null) cb.onProgress(files.size() + 1, files.size() + 1, "manifest");
        return Hosting.publicUrl(profile, manifestId, true);
    }

    /** Content-addressed: identical bytes re-upload idempotently, nothing can be
     *  overwritten — same posture as PinataUploader. */
    @Override public boolean exists(String relPath) { return false; }

    /* ==================== transport ==================== */

    private String uploadItem(byte[] bytes, String mime, String relPath) throws Hosting.HostingException {
        String endpoint = Hosting.trimSlash(profile.cfgStr("endpoint"));
        if (endpoint.isEmpty()) endpoint = DEFAULT_ENDPOINT;
        try {
            Ans104.DataItem item = Ans104.createAndSign(jwk(), bytes,
                    new String[][]{ { "Content-Type", mime }, { "App-Name", "Atelier" } });
            HttpURLConnection con = Hosting.open(endpoint + "/v1/tx", "POST");
            con.setRequestProperty("Content-Type", "application/octet-stream");
            con.setDoOutput(true);
            con.setFixedLengthStreamingMode(item.totalLength());
            try (java.io.OutputStream out = con.getOutputStream()) { item.writeTo(out); }
            int code = con.getResponseCode();
            String body = Hosting.readBody(con);
            con.disconnect();
            if (code >= 200 && code < 300) {
                String id = parseUploadId(body);
                // Turbo echoes the id it derived; trust ours if the body is odd
                return id.isEmpty() ? item.id : id;
            }
            if (code == 402) {
                throw new Hosting.HostingException(insufficientFundsMessage(
                        Ans104.addressFromJwk(profile.secret("jwk")), bytes.length, priceEstimate(bytes.length)));
            }
            throw new Hosting.HostingException("Turbo upload failed (HTTP " + code + ") at " + relPath
                    + (body.isEmpty() ? "" : ": " + body.substring(0, Math.min(300, body.length()))));
        } catch (Hosting.HostingException he) {
            throw he;
        } catch (Exception e) {
            throw new Hosting.HostingException("Arweave upload failed at " + relPath + ": " + e.getClass().getSimpleName()
                    + (e.getMessage() == null ? "" : " — " + e.getMessage()));
        }
    }

    /* ==================== pure helpers (JVM-tested) ==================== */

    /** arweave/paths manifest — the shared base the mint's base+idx+ext contract needs. */
    static String manifestJson(LinkedHashMap<String, String> nameToId, String indexName) {
        JSONObject paths = new JSONObject();
        for (java.util.Map.Entry<String, String> e : nameToId.entrySet()) {
            JSONObject id = new JSONObject();
            Hosting.put(id, "id", e.getValue());
            Hosting.put(paths, e.getKey(), id);
        }
        JSONObject index = new JSONObject();
        Hosting.put(index, "path", indexName);
        JSONObject m = new JSONObject();
        Hosting.put(m, "manifest", "arweave/paths");
        Hosting.put(m, "version", "0.1.0");
        Hosting.put(m, "index", index);
        Hosting.put(m, "paths", paths);
        return m.toString();
    }

    static String parseUploadId(String body) {
        try { return new JSONObject(body).optString("id", ""); }
        catch (Exception e) { return ""; }
    }

    static String insufficientFundsMessage(String address, long bytes, String estimate) {
        return "Insufficient Turbo balance for this " + bytes + "-byte upload"
                + (estimate.isEmpty() ? "" : " (≈ " + estimate + ")")
                + ". Fund your Arweave address " + address
                + " at https://turbo.ar.io (20 MiB ≈ $0.61; files under ~100 KiB are free).";
    }

    /** Live price for n bytes as a human string, "" on any failure — best-effort
     *  only, used for the pre-upload confirm and the 402 message. */
    static String priceEstimate(long bytes) {
        try {
            HttpURLConnection con = Hosting.open(PAYMENT_SERVICE + "/v1/price/bytes/" + bytes, "GET");
            con.setConnectTimeout(5000); con.setReadTimeout(8000);
            String winc = new JSONObject(Hosting.readBody(con)).optString("winc", "");
            con.disconnect();
            if (winc.isEmpty()) return "";
            HttpURLConnection rc = Hosting.open(PAYMENT_SERVICE + "/v1/rates", "GET");
            rc.setConnectTimeout(5000); rc.setReadTimeout(8000);
            JSONObject rates = new JSONObject(Hosting.readBody(rc));
            rc.disconnect();
            double perGibWinc = Double.parseDouble(rates.optString("winc", "0"));
            double usdPerGib = rates.optJSONObject("fiat") == null ? 0 : rates.optJSONObject("fiat").optDouble("usd", 0);
            if (perGibWinc <= 0 || usdPerGib <= 0) return winc + " credits";
            double usd = Double.parseDouble(winc) / perGibWinc * usdPerGib;
            return String.format(java.util.Locale.US, "$%.2f (%s credits)", usd, winc);
        } catch (Exception e) { return ""; }
    }
}
