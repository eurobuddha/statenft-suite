package com.eurobuddha.statenft;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** Hosting core — pure logic + the parity fixtures shared with the MiniDapp
 *  (test/fixtures/hosting/parity.json): slug, templates, public URLs and
 *  kubo NDJSON parsing must agree byte-for-byte across both clients. */
public class HostingTest {

    private static JSONObject fixtures() throws Exception {
        String p = System.getProperty("user.dir");   // android/app
        java.io.File f = new java.io.File(p, "../../test/fixtures/hosting/parity.json");
        return new JSONObject(new String(Files.readAllBytes(Paths.get(f.getCanonicalPath())),
                java.nio.charset.StandardCharsets.UTF_8));
    }

    private static Hosting.Profile profileOf(String type, JSONObject cfg) {
        JSONObject j = new JSONObject();
        Hosting.put(j, "type", type);
        Hosting.put(j, type, cfg);
        return new Hosting.Profile(j);
    }

    @Test public void slugMatchesSharedFixtures() throws Exception {
        JSONArray cases = fixtures().getJSONArray("slug");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            assertEquals(c.getString("in"), c.getString("out"), Hosting.slug(c.getString("in")));
        }
    }

    @Test public void templateFillMatchesSharedFixtures() throws Exception {
        JSONArray cases = fixtures().getJSONArray("template");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            Map<String, String> tokens = new HashMap<>();
            JSONObject t = c.getJSONObject("tokens");
            for (java.util.Iterator<String> it = t.keys(); it.hasNext(); ) {
                String k = it.next();
                tokens.put(k, t.getString(k));
            }
            assertEquals(c.getString("tpl"), c.getString("out"),
                    Hosting.fillTemplate(c.getString("tpl"), tokens));
        }
    }

    @Test public void publicUrlMatchesSharedFixtures() throws Exception {
        JSONArray cases = fixtures().getJSONArray("publicUrl");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            Hosting.Profile p = profileOf(c.getString("type"), c.getJSONObject("cfg"));
            assertEquals(c.getString("type") + "#" + i, c.getString("out"),
                    Hosting.publicUrl(p, c.getString("path"), c.getBoolean("isDir")));
        }
    }

    @Test public void kuboAddParsingMatchesSharedFixtures() throws Exception {
        JSONArray cases = fixtures().getJSONArray("kuboAdd");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            assertEquals("kubo#" + i, c.getString("out"),
                    Hosting.parseKuboAddResponse(c.getString("ndjson"), c.getString("dirName")));
        }
    }

    @Test public void githubBodyCarriesNoShaAndEncodesContent() throws Exception {
        JSONObject o = new JSONObject(Hosting.githubContentsBody(
                "hello".getBytes(java.nio.charset.StandardCharsets.UTF_8), "msg", ""));
        assertEquals("msg", o.getString("message"));
        assertEquals("main", o.getString("branch"));
        assertEquals("aGVsbG8=", o.getString("content"));
        assertTrue("sha must NEVER be sent — its absence is the overwrite refusal",
                !o.has("sha"));
    }

    @Test public void profileRoundTripAndSecretWrap() {
        Hosting.Profile p = Hosting.Profile.fresh(Hosting.TYPE_SFTP);
        Hosting.put(p.j, "name", "eurobuddha.com");
        Hosting.put(p.cfg(), "host", "eurobuddha.com");
        Hosting.put(p.cfg(), "password", Crypt.encrypt("s3cret"));
        Hosting.Profile back = new Hosting.Profile(p.j);
        assertEquals("eurobuddha.com", back.cfgStr("host"));
        // JVM has no AndroidKeyStore -> Crypt falls back to the visible
        // "plain:" form, and decrypt round-trips it
        assertTrue(back.cfgStr("password").startsWith("plain:"));
        assertEquals("s3cret", back.secret("password"));
        assertTrue("toString must redact", !back.toString().contains("s3cret"));
    }

    @Test public void ownHostsCoversConfiguredEndpoints() {
        Hosting.Profile p = profileOf(Hosting.TYPE_KUBO, new JSONObject());
        Hosting.put(p.cfg(), "apiUrl", "http://192.168.1.10:5001");
        Hosting.put(p.cfg(), "gateway", "https://ipfs.eurobuddha.com");
        java.util.HashSet<String> hs = p.ownHosts();
        assertTrue(hs.contains("192.168.1.10"));
        assertTrue(hs.contains("ipfs.eurobuddha.com"));
    }

    /* ---- putSequence over a fake transport ---------------------------- */

    private static class FakeUploader implements Hosting.Uploader {
        final List<String> puts = new ArrayList<>();
        final java.util.Set<String> existing = new java.util.HashSet<>();
        @Override public String putFile(byte[] bytes, String relPath, String mime) {
            puts.add(relPath);
            return "https://x/" + relPath;
        }
        @Override public boolean exists(String relPath) { return existing.contains(relPath); }
    }

    private static List<Hosting.Entry> plates(String dir, int n, String ext) {
        List<Hosting.Entry> out = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            out.add(new Hosting.Entry(new byte[]{ 1 }, dir + "/" + i + ext, "image/png"));
        }
        return out;
    }

    @Test public void putSequenceNamesOneToNAndReturnsBase() throws Exception {
        FakeUploader u = new FakeUploader();
        String base = Hosting.putSequence(u, Hosting.Profile.fresh(Hosting.TYPE_WEBDAV),
                "c", plates("c", 3, ".png"), null);
        assertEquals(List.of("c/1.png", "c/2.png", "c/3.png"), u.puts);
        assertEquals("https://x/c/", base);
    }

    @Test public void putSequenceAbortsWhollyWhenAnyTargetExists() {
        FakeUploader u = new FakeUploader();
        u.existing.add("c/2.png");   // the MIDDLE plate exists remotely
        try {
            Hosting.putSequence(u, Hosting.Profile.fresh(Hosting.TYPE_WEBDAV),
                    "c", plates("c", 3, ".png"), null);
            fail("must refuse");
        } catch (Hosting.HostingException e) {
            assertTrue(e.getMessage().contains("c/2.png"));
        }
        assertTrue("nothing may upload before the batch is proven clear", u.puts.isEmpty());
    }
}
