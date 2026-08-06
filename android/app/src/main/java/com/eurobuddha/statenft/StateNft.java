package com.eurobuddha.statenft;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class StateNft {
    public static final String GRAVEYARD =
            "0xABA005476D2B3CD7F251B9783E64C124C9670BB358695F04D91B2057BB64CB49";

    private static final Pattern LEGACY_SCRIPT = Pattern.compile(
            "^IF SIGNEDBY\\((0x[0-9A-Fa-f]+)\\) THEN RETURN TRUE ENDIF RETURN VERIFYOUT\\(@INPUT GETOUTADDR\\(@INPUT\\) @AMOUNT @TOKENID TRUE\\)$");
    private static final Pattern LOCKED_SCRIPT = Pattern.compile(
            "^LET s=PREVSTATE\\(0\\) IF s EQ 0 AND SIGNEDBY\\((0x[0-9A-Fa-f]+)\\) THEN RETURN TRUE ENDIF RETURN SAMESTATE\\(0 [01]\\) AND VERIFYOUT\\(@INPUT GETOUTADDR\\(@INPUT\\) @AMOUNT @TOKENID TRUE\\)$");

    private StateNft() {}

    public static class Meta {
        public String tokenid = "";
        public String name = "Collection";
        public String description = "";
        public String mode = "url";
        public int size = 0;
        public String base = "";
        public String ext = ".png";
        public String icon = "";
        public String externalUrl = "";
        public String webvalidate = "";
        public String creatorPk = "";
        public String creatorAddr = "";
        public String phase = "DONE";
        public String error = "";
        public long localId = 0;
        public int posted = 0;
        public int postedAt = 0;
        public boolean creator = false;
        public boolean created = false;
        public boolean webValid = false;
        public int owned = 0;
        public int minted = 0;
        public int totalSeen = 0;
        public int buriedAt = 0;               // block of confirmed burial (grave shows 50 blocks)
        public JSONObject itemTraits = null;   // collection metadata: {"1":[{trait_type,value}], …}
        public JSONArray attributes = null;    // single-NFT metadata attributes array
    }

    public static class Item {
        public int index;
        public JSONObject coin;
        public String imageUrl = "";
        public boolean owned;
    }

    public static Meta parseMeta(String tokenid, Object tokenNode) {
        Meta m = new Meta();
        m.tokenid = tokenid == null ? "" : tokenid;
        JSONObject root = tokenNode instanceof JSONObject ? (JSONObject) tokenNode : null;
        if (root != null && root.opt("token") instanceof JSONObject) {
            JSONObject wrapped = root.optJSONObject("token");
            if (wrapped != null) {
                try {
                    JSONObject merged = new JSONObject(wrapped.toString());
                    JSONArray names = root.names();
                    if (names != null) {
                        for (int i = 0; i < names.length(); i++) {
                            String k = names.optString(i);
                            if (!"token".equals(k) && !merged.has(k)) merged.put(k, root.opt(k));
                        }
                    }
                    root = merged;
                } catch (Exception ignored) {
                    root = wrapped;
                }
            }
        }
        JSONObject meta = null;
        if (root != null && root.opt("name") instanceof JSONObject) {
            meta = root.optJSONObject("name");
        }
        JSONObject src = meta != null ? meta : root;
        if (src != null) {
            m.name = first(src.optString("name", ""), root.optString("name", ""), "Collection");
            m.description = first(src.optString("description", ""), root.optString("description", ""));
            m.mode = first(src.optString("mode", ""), root.optString("mode", ""), src.optString("base", "").isEmpty() ? "embed" : "url");
            m.size = firstInt(src.opt("size"), root.opt("size"), root.opt("totalamount"), root.opt("total"));
            m.base = first(src.optString("base", ""), root.optString("base", ""));
            m.ext = first(src.optString("ext", ""), root.optString("ext", ""), ".png");
            m.icon = first(src.optString("url", ""), root.optString("url", ""), src.optString("icon", ""), root.optString("icon", ""));
            m.externalUrl = first(src.optString("external_url", ""), root.optString("external_url", ""));
            m.webvalidate = first(src.optString("webvalidate", ""), root.optString("webvalidate", ""));
            m.itemTraits = src.optJSONObject("traits") != null ? src.optJSONObject("traits") : root.optJSONObject("traits");
            m.attributes = src.optJSONArray("attributes") != null ? src.optJSONArray("attributes") : root.optJSONArray("attributes");
        } else if (tokenNode instanceof String) {
            m.name = (String) tokenNode;
        }
        return m;
    }

    public static boolean isCandidate(Meta m) {
        if (m == null || m.size <= 0) return false;
        return "embed".equals(m.mode) || "url".equals(m.mode) || !m.base.isEmpty();
    }

    public static String creatorPk(String script) {
        Matcher a = LOCKED_SCRIPT.matcher(script == null ? "" : script);
        if (a.matches()) return a.group(1);
        Matcher b = LEGACY_SCRIPT.matcher(script == null ? "" : script);
        if (b.matches()) return b.group(1);
        return "";
    }

    public static boolean isStateNftScript(String script) {
        return !creatorPk(script).isEmpty();
    }

    public static String script(String pk, String mode) {
        String range = "url".equals(mode) ? "0 0" : "0 1";
        return "LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY(" + pk + ") THEN RETURN TRUE ENDIF "
                + "RETURN SAMESTATE(" + range + ") AND "
                + "VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)";
    }

    public static JSONObject tokenMetadata(Meta m) {
        JSONObject meta = new JSONObject();
        put(meta, "name", m.name);
        put(meta, "description", m.description == null ? "" : m.description);
        put(meta, "mode", m.mode);
        put(meta, "size", m.size);
        if ("url".equals(m.mode)) {
            put(meta, "base", m.base == null ? "" : m.base);
            put(meta, "ext", m.ext == null || m.ext.isEmpty() ? ".png" : m.ext);
        }
        if (m.icon != null && !m.icon.isEmpty()) {
            put(meta, "url", m.icon.startsWith("http") ? m.icon : "<artimage>" + m.icon);
        }
        if (m.externalUrl != null && !m.externalUrl.isEmpty()) put(meta, "external_url", m.externalUrl);
        return meta;
    }

    public static String state(JSONObject coin, int port) {
        Object rawState = coin == null ? null : coin.opt("state");
        JSONArray st = rawState instanceof JSONArray ? (JSONArray) rawState : null;
        if (st == null && rawState instanceof JSONObject) {
            Object direct = ((JSONObject) rawState).opt(String.valueOf(port));
            if (direct != null) return cleanStateData(direct);
        }
        if (st == null) return null;
        for (int i = 0; i < st.length(); i++) {
            JSONObject s = st.optJSONObject(i);
            if (s == null) continue;
            String p = String.valueOf(s.opt("port"));
            if ((p.matches("^[0-9]+$") && Integer.parseInt(p) == port) || String.valueOf(port).equals(p)) {
                return cleanStateData(s.opt("data"));
            }
        }
        return null;
    }

    public static String stamped(JSONObject coin) {
        String s0 = state(coin, 0);
        return s0 != null && !"0".equals(s0) ? s0 : null;
    }

    public static boolean safeStateValue(Object v) {
        String s = String.valueOf(v);
        return s.matches("^[0-9]+$") || s.matches("^\\[[A-Za-z0-9+/=]*\\]$");
    }

    public static boolean replayableState(JSONObject coin) {
        JSONArray st = coin == null ? null : coin.optJSONArray("state");
        if (st == null) return true;
        for (int i = 0; i < st.length(); i++) {
            JSONObject s = st.optJSONObject(i);
            if (s == null || !String.valueOf(s.opt("port")).matches("^[0-9]+$")
                    || !safeStateValue(s.opt("data"))) {
                return false;
            }
        }
        return true;
    }

    public static String imageUrl(Meta meta, int idx, JSONObject coin) {
        String embedded = state(coin, 1);
        if (embedded != null && embedded.startsWith("[") && embedded.endsWith("]")) {
            return ImageTools.dataUri(embedded.substring(1, embedded.length() - 1));
        }
        if (meta != null && !meta.base.isEmpty()) return meta.base + idx + (meta.ext == null ? "" : meta.ext);
        return IconResolver.resolve(meta == null ? "" : meta.icon);
    }

    public static List<Item> items(Meta meta, JSONArray ownedCoins, JSONArray allCoins) {
        java.util.Map<String, JSONObject> byIndex = new java.util.LinkedHashMap<>();
        java.util.HashSet<String> ownedIds = new java.util.HashSet<>();
        if (ownedCoins != null) {
            for (int i = 0; i < ownedCoins.length(); i++) {
                JSONObject c = ownedCoins.optJSONObject(i);
                if (c == null) continue;
                ownedIds.add(c.optString("coinid", ""));
                String idx = stamped(c);
                if (idx != null && idx.matches("^[0-9]+$")) byIndex.put(idx, c);
            }
        }
        if (allCoins != null) {
            for (int i = 0; i < allCoins.length(); i++) {
                JSONObject c = allCoins.optJSONObject(i);
                if (c == null) continue;
                String idx = stamped(c);
                if (idx != null && idx.matches("^[0-9]+$") && !byIndex.containsKey(idx)) byIndex.put(idx, c);
            }
        }
        List<Item> out = new ArrayList<>();
        int size = meta == null ? 0 : Math.max(0, meta.size);
        for (int i = 1; i <= size; i++) {
            JSONObject c = byIndex.get(String.valueOf(i));
            Item it = new Item();
            it.index = i;
            it.coin = c;
            it.owned = c != null && ownedIds.contains(c.optString("coinid", ""));
            it.imageUrl = imageUrl(meta, i, c);
            out.add(it);
        }
        return out;
    }

    /* Build+sign steps for MintEngine.postTxn, which wraps them in
     * txncreate -> txncheck (balanced) -> signs -> txnbasics -> txnpost. */
    public static List<String> transferCommands(String txn, String tokenid, JSONObject coin, String to) {
        List<String> cmds = new ArrayList<>();
        cmds.add("txninput id:" + txn + " coinid:" + coin.optString("coinid"));
        cmds.add("txnoutput id:" + txn + " amount:1 address:" + to + " tokenid:" + tokenid + " storestate:true");
        JSONArray st = coin.optJSONArray("state");
        if (st != null) {
            for (int i = 0; i < st.length(); i++) {
                JSONObject s = st.optJSONObject(i);
                cmds.add("txnstate id:" + txn + " port:" + s.opt("port") + " value:" + s.opt("data"));
            }
        }
        cmds.add("txnsign id:" + txn + " publickey:auto");
        return cmds;
    }

    public static List<String> buryCommands(String txn, String tokenid, String creatorPk, JSONObject coin, boolean preserve) {
        List<String> cmds = new ArrayList<>();
        cmds.add("txninput id:" + txn + " coinid:" + coin.optString("coinid"));
        cmds.add("txnoutput id:" + txn + " amount:" + coin.optString("tokenamount", "1")
                + " address:" + GRAVEYARD + " tokenid:" + tokenid + " storestate:" + (preserve ? "true" : "false"));
        if (preserve) {
            JSONArray st = coin.optJSONArray("state");
            if (st != null) {
                for (int i = 0; i < st.length(); i++) {
                    JSONObject s = st.optJSONObject(i);
                    cmds.add("txnstate id:" + txn + " port:" + s.opt("port") + " value:" + s.opt("data"));
                }
            }
        }
        cmds.add("txnsign id:" + txn + " publickey:auto");
        if (!creatorPk.isEmpty() && (!preserve || stamped(coin) == null)) {
            cmds.add("txnsign id:" + txn + " publickey:" + creatorPk);
        }
        return cmds;
    }

    /** Wallet-standard single-NFT metadata (NFTwallet-compatible), with an
     *  OpenSea-style attributes array when traits are supplied. */
    public static JSONObject nftMetadata(String name, String desc, String url, String owner,
                                         String externalUrl, String webvalidate, JSONArray attributes) {
        JSONObject meta = new JSONObject();
        put(meta, "name", name);
        put(meta, "description", desc == null ? "" : desc);
        put(meta, "url", url);
        if (owner != null && !owner.isEmpty()) put(meta, "owner", owner);
        if (externalUrl != null && !externalUrl.isEmpty()) put(meta, "external_url", externalUrl);
        if (webvalidate != null && !webvalidate.isEmpty()) put(meta, "webvalidate", webvalidate);
        if (attributes != null && attributes.length() > 0) put(meta, "attributes", attributes);
        put(meta, "nft", "true");
        return meta;
    }

    public static String nftCreateCommand(String name, String desc, String url, String owner,
                                          String externalUrl, String webvalidate, JSONArray attributes,
                                          int editions, String signPk) {
        JSONObject meta = nftMetadata(name, desc, url, owner, externalUrl, webvalidate, attributes);
        String cmd = "tokencreate name:" + meta + " amount:" + editions + " decimals:0";
        if (webvalidate != null && !webvalidate.isEmpty()) cmd += " webvalidate:" + webvalidate;
        if (signPk != null && !signPk.isEmpty()) cmd += " signtoken:" + signPk;
        return cmd;
    }

    public static JSONArray traitsToAttributes(java.util.List<String[]> traits) {
        JSONArray arr = new JSONArray();
        if (traits == null) return arr;
        for (String[] t : traits) {
            if (t == null || t.length < 2 || t[0].trim().isEmpty() || t[1].trim().isEmpty()) continue;
            JSONObject a = new JSONObject();
            put(a, "trait_type", t[0].trim());
            put(a, "value", t[1].trim());
            arr.put(a);
        }
        return arr;
    }

    /** Keys a custom token pair must never overwrite (matches NFTwallet). */
    public static final java.util.Set<String> RESERVED_KEYS = new java.util.HashSet<>(java.util.Arrays.asList(
            "name", "url", "description", "ticker", "webvalidate", "external_url", "owner", "nft", "icon", "attributes"));

    public static JSONObject tokenMeta(String name, String desc, String ticker, String url,
                                       java.util.List<String[]> pairs) {
        JSONObject meta = new JSONObject();
        put(meta, "name", name);
        if (desc != null && !desc.isEmpty()) put(meta, "description", desc);
        if (ticker != null && !ticker.isEmpty()) put(meta, "ticker", ticker);
        if (url != null && !url.isEmpty()) put(meta, "url", url);
        if (pairs != null) {
            for (String[] p : pairs) {
                if (p == null || p.length < 2) continue;
                String k = p[0].trim(), v = p[1].trim();
                if (k.isEmpty() || v.isEmpty() || RESERVED_KEYS.contains(k.toLowerCase())) continue;
                put(meta, k, v);
            }
        }
        return meta;
    }

    /** Fungible token mint. */
    public static String tokenCreateCommand(String name, String desc, String ticker, String url,
                                            long supply, int decimals) {
        return tokenCreateCommand(name, desc, ticker, url, supply, decimals, null);
    }

    public static String tokenCreateCommand(String name, String desc, String ticker, String url,
                                            long supply, int decimals, java.util.List<String[]> pairs) {
        return "tokencreate name:" + tokenMeta(name, desc, ticker, url, pairs)
                + " amount:" + supply + " decimals:" + decimals;
    }

    private static String first(String... vals) {
        for (String v : vals) if (v != null && !v.isEmpty()) return v;
        return "";
    }

    private static int firstInt(Object... vals) {
        for (Object v : vals) {
            if (v == null) continue;
            if (v instanceof Number) return ((Number) v).intValue();
            try {
                String s = String.valueOf(v).trim();
                if (s.endsWith(".0")) s = s.substring(0, s.length() - 2);
                if (!s.isEmpty()) return Integer.parseInt(s);
            } catch (Exception ignored) {}
        }
        return 0;
    }

    private static void put(JSONObject o, String k, Object v) {
        try { o.put(k, v); } catch (Exception ignored) {}
    }

    private static String cleanStateData(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
            s = s.substring(1, s.length() - 1);
        }
        return s;
    }
}
