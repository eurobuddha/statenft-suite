package com.eurobuddha.statenft;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PSSParameterSpec;
import java.security.spec.RSAPrivateCrtKeySpec;

/** ANS-104 data items for Arweave uploads via ArDrive Turbo — signature type 1
 *  (RSA-PSS 4096). Pure JDK crypto (Conscrypt/SunRsaSign provide SHA256withRSA/PSS
 *  on API 28+ and host JVMs), so this class has zero Android imports and the whole
 *  format is pinned against arbundles-generated fixtures in Ans104Test.
 *
 *  Layout: sigType(2 LE) | sig(512) | owner(512 = raw RSA modulus) | target
 *  presence byte | anchor presence byte | tag count(8 LE) | tag bytes len(8 LE) |
 *  Avro tags | data. Signature = RSA-PSS over the 48-byte deepHash digest of
 *  [ "dataitem","1","1", owner, target, anchor, tagsAvro, data ].
 *  id = b64url(sha256(signature)); address = b64url(sha256(owner)). */
final class Ans104 {

    private Ans104() {}

    /* ==================== JWK ==================== */

    static final class Jwk {
        final RSAPrivateCrtKey key;
        final byte[] owner;   // raw modulus bytes, exactly 512 — kept verbatim from the JWK
        Jwk(RSAPrivateCrtKey key, byte[] owner) { this.key = key; this.owner = owner; }
    }

    /** Parse an Arweave JWK (n,e,d,p,q,dp,dq,qi base64url). The decoded n bytes are
     *  kept verbatim as the owner field — never round-tripped through BigInteger,
     *  whose toByteArray() prepends a sign byte. */
    static Jwk parseJwk(String json) throws Exception {
        JSONObject j = new JSONObject(json);
        byte[] n = b64uDecode(j.getString("n"));
        RSAPrivateCrtKeySpec spec = new RSAPrivateCrtKeySpec(
                new BigInteger(1, n),
                new BigInteger(1, b64uDecode(j.getString("e"))),
                new BigInteger(1, b64uDecode(j.getString("d"))),
                new BigInteger(1, b64uDecode(j.getString("p"))),
                new BigInteger(1, b64uDecode(j.getString("q"))),
                new BigInteger(1, b64uDecode(j.getString("dp"))),
                new BigInteger(1, b64uDecode(j.getString("dq"))),
                new BigInteger(1, b64uDecode(j.getString("qi"))));
        RSAPrivateCrtKey key = (RSAPrivateCrtKey) KeyFactory.getInstance("RSA").generatePrivate(spec);
        return new Jwk(key, leftPad(n, 512));
    }

    /** Fresh RSA-4096 wallet as Arweave JWK JSON. Takes seconds on-device — run off
     *  the main thread. */
    static String generateJwkJson() throws Exception {
        KeyPairGenerator kg = KeyPairGenerator.getInstance("RSA");
        kg.initialize(4096);
        RSAPrivateCrtKey k = (RSAPrivateCrtKey) kg.generateKeyPair().getPrivate();
        JSONObject j = new JSONObject();
        j.put("kty", "RSA");
        j.put("n", b64u(unsigned(k.getModulus())));
        j.put("e", b64u(unsigned(k.getPublicExponent())));
        j.put("d", b64u(unsigned(k.getPrivateExponent())));
        j.put("p", b64u(unsigned(k.getPrimeP())));
        j.put("q", b64u(unsigned(k.getPrimeQ())));
        j.put("dp", b64u(unsigned(k.getPrimeExponentP())));
        j.put("dq", b64u(unsigned(k.getPrimeExponentQ())));
        j.put("qi", b64u(unsigned(k.getCrtCoefficient())));
        return j.toString();
    }

    /** Wallet address = b64url(sha256(raw modulus bytes)). */
    static String addressFromJwk(String json) throws Exception {
        byte[] n = leftPad(b64uDecode(new JSONObject(json).getString("n")), 512);
        return b64u(MessageDigest.getInstance("SHA-256").digest(n));
    }

    /* ==================== tags (Avro block encoding) ==================== */

    /** Avro array-of-{name,value} blocks: ZigZag-varint count, per tag ZigZag-varint
     *  length-prefixed name and value bytes, terminated by a zero block. Zero tags
     *  encode as ZERO bytes (arbundles convention, pinned by fixture), not a lone
     *  terminator. */
    static byte[] avroTags(String[][] tags) {
        if (tags == null || tags.length == 0) return new byte[0];
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeZigZag(out, tags.length);
        for (String[] t : tags) {
            byte[] name = utf8(t[0]);
            byte[] value = utf8(t[1]);
            writeZigZag(out, name.length);
            out.write(name, 0, name.length);
            writeZigZag(out, value.length);
            out.write(value, 0, value.length);
        }
        out.write(0);   // terminator block
        return out.toByteArray();
    }

    private static void writeZigZag(ByteArrayOutputStream out, long v) {
        long z = (v << 1) ^ (v >> 63);
        while ((z & ~0x7FL) != 0) {
            out.write((int) ((z & 0x7F) | 0x80));
            z >>>= 7;
        }
        out.write((int) z);
    }

    /* ==================== deep hash ==================== */

    /** Arweave 2.0 deepHash of the data-item signature preimage. All eight elements
     *  are blobs; the list fold is sha384(acc ‖ blobHash(elem)). */
    static byte[] deepHashDataItem(byte[] owner, byte[] target, byte[] anchor, byte[] tagsAvro, byte[] data) {
        byte[][] elems = { utf8("dataitem"), utf8("1"), utf8("1"), owner,
                target == null ? new byte[0] : target,
                anchor == null ? new byte[0] : anchor,
                tagsAvro, data };
        byte[] acc = sha384(utf8("list" + elems.length));
        for (byte[] e : elems) acc = sha384(concat(acc, blobHash(e)));
        return acc;
    }

    private static byte[] blobHash(byte[] data) {
        return sha384(concat(sha384(utf8("blob" + data.length)), sha384(data)));
    }

    /* ==================== data item ==================== */

    /** header holds everything up to the payload; data is the caller's array by
     *  reference — never concatenated (a 60 MB external would double in memory). */
    static final class DataItem {
        final byte[] header;
        final byte[] data;
        final String id;
        DataItem(byte[] header, byte[] data, String id) { this.header = header; this.data = data; this.id = id; }
        long totalLength() { return (long) header.length + data.length; }
        void writeTo(OutputStream out) throws IOException { out.write(header); out.write(data); }
    }

    static DataItem createAndSign(Jwk jwk, byte[] data, String[][] tags) throws Exception {
        byte[] tagsAvro = avroTags(tags);
        byte[] digest = deepHashDataItem(jwk.owner, null, null, tagsAvro, data);
        Signature s = pss();
        s.initSign(jwk.key);
        s.update(digest);
        byte[] sig = s.sign();
        if (sig.length != 512) throw new IllegalStateException("unexpected RSA-PSS signature length " + sig.length);

        ByteArrayOutputStream h = new ByteArrayOutputStream(2 + 512 + 512 + 2 + 16 + tagsAvro.length);
        h.write(1); h.write(0);                       // signature type 1, little-endian
        h.write(sig, 0, sig.length);
        h.write(jwk.owner, 0, jwk.owner.length);
        h.write(0);                                   // target absent
        h.write(0);                                   // anchor absent
        writeLongLE(h, tags == null ? 0 : tags.length);
        writeLongLE(h, tagsAvro.length);
        h.write(tagsAvro, 0, tagsAvro.length);

        String id = b64u(MessageDigest.getInstance("SHA-256").digest(sig));
        return new DataItem(h.toByteArray(), data, id);
    }

    /** RSA-PSS(SHA-256, MGF1-SHA256, salt 32). Android Conscrypt names it
     *  "SHA256withRSA/PSS"; host JDKs (SunRsaSign) only have "RSASSA-PSS" —
     *  both take the same PSSParameterSpec. */
    static Signature pss() throws Exception {
        Signature s;
        try { s = Signature.getInstance("SHA256withRSA/PSS"); }
        catch (java.security.NoSuchAlgorithmException e) { s = Signature.getInstance("RSASSA-PSS"); }
        s.setParameter(new PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1));
        return s;
    }

    private static void writeLongLE(ByteArrayOutputStream out, long v) {
        for (int i = 0; i < 8; i++) out.write((int) ((v >>> (8 * i)) & 0xFF));
    }

    /* ==================== small helpers ==================== */

    static String b64u(byte[] b) { return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
    static byte[] b64uDecode(String s) { return java.util.Base64.getUrlDecoder().decode(s); }

    /** Unsigned big-endian magnitude — strips BigInteger's leading sign byte. */
    private static byte[] unsigned(BigInteger v) {
        byte[] b = v.toByteArray();
        if (b.length > 1 && b[0] == 0) {
            byte[] out = new byte[b.length - 1];
            System.arraycopy(b, 1, out, 0, out.length);
            return out;
        }
        return b;
    }

    private static byte[] leftPad(byte[] b, int len) {
        if (b.length == len) return b;
        if (b.length > len) {   // strip leading zeros (defensive)
            int off = b.length - len;
            for (int i = 0; i < off; i++) if (b[i] != 0) throw new IllegalArgumentException("value longer than " + len + " bytes");
            byte[] out = new byte[len];
            System.arraycopy(b, off, out, 0, len);
            return out;
        }
        byte[] out = new byte[len];
        System.arraycopy(b, 0, out, len - b.length, b.length);
        return out;
    }

    private static byte[] utf8(String s) { return s.getBytes(java.nio.charset.StandardCharsets.UTF_8); }

    private static byte[] sha384(byte[] b) {
        try { return MessageDigest.getInstance("SHA-384").digest(b); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }
}
