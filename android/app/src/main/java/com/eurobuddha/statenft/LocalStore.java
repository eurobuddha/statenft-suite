package com.eurobuddha.statenft;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

public final class LocalStore {
    private static final String PREF = "statenft_suite";
    private static final String KEY_COLLECTIONS = "collections";
    private static final String KEY_PENDING = "pending";

    private LocalStore() {}

    /* The collections blob embeds base64 images (hundreds of KB); parse it
     * once and keep the tree — callers hammer load()/findById() per card
     * and per slot on the UI thread. Single-process app, so the cache is
     * authoritative; save() keeps it in step. */
    private static JSONArray sCollections = null;

    public static synchronized JSONArray load(Context c) {
        if (sCollections != null) return sCollections;
        String raw = prefs(c).getString(KEY_COLLECTIONS, "[]");
        try { sCollections = new JSONArray(raw); } catch (Exception e) { sCollections = new JSONArray(); }
        return sCollections;
    }

    public static synchronized void save(Context c, JSONArray arr) {
        sCollections = arr;
        prefs(c).edit().putString(KEY_COLLECTIONS, arr.toString()).apply();
    }

    public static long nextId(Context c) {
        SharedPreferences p = prefs(c);
        long id = p.getLong("next_id", 1);
        p.edit().putLong("next_id", id + 1).apply();
        return id;
    }

    public static void upsert(Context c, JSONObject row) {
        JSONArray arr = load(c);
        long id = row.optLong("id", 0);
        String tokenid = row.optString("tokenid", "");
        boolean done = false;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject cur = arr.optJSONObject(i);
            if (cur != null && (cur.optLong("id", -1) == id
                    || (!tokenid.isEmpty() && tokenid.equals(cur.optString("tokenid", ""))))) {
                try { arr.put(i, row); } catch (Exception ignored) {}
                done = true;
                break;
            }
        }
        if (!done) arr.put(row);
        save(c, arr);
    }

    public static void setPending(Context c, String coinid, int tip) {
        try {
            JSONObject p = pending(c);
            p.put(coinid, tip);
            prefs(c).edit().putString(KEY_PENDING, p.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static boolean pendingOk(Context c, String coinid, int tip) {
        JSONObject p = pending(c);
        if (!p.has(coinid)) return true;
        return tip - p.optInt(coinid, 0) >= 6;
    }

    public static void prunePending(Context c, int tip) {
        JSONObject p = pending(c);
        JSONArray names = p.names();
        if (names == null) return;
        for (int i = 0; i < names.length(); i++) {
            String k = names.optString(i);
            if (tip - p.optInt(k, 0) >= 6) p.remove(k);
        }
        prefs(c).edit().putString(KEY_PENDING, p.toString()).apply();
    }

    /* ---- engine heartbeat (trust: a stalled engine must be visible) ---- */

    public static void recordHeartbeat(Context c, String msg) {
        prefs(c).edit()
                .putLong("engine_tick", System.currentTimeMillis())
                .putString("engine_msg", msg == null ? "" : msg)
                .apply();
    }

    public static long lastHeartbeat(Context c) {
        return prefs(c).getLong("engine_tick", 0);
    }

    /* ---- wizard drafts (nft / token / collection) ---- */

    public static void saveDraft(Context c, String key, JSONObject draft) {
        prefs(c).edit().putString("draft_" + key, draft == null ? "" : draft.toString()).apply();
    }

    public static JSONObject loadDraft(Context c, String key) {
        String raw = prefs(c).getString("draft_" + key, "");
        if (raw == null || raw.isEmpty()) return null;
        try { return new JSONObject(raw); } catch (Exception e) { return null; }
    }

    public static void clearDraft(Context c, String key) {
        prefs(c).edit().remove("draft_" + key).apply();
    }

    public static JSONObject findByTokenid(Context c, String tokenid) {
        if (tokenid == null || tokenid.isEmpty()) return null;
        JSONArray arr = load(c);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject r = arr.optJSONObject(i);
            if (r != null && tokenid.equals(r.optString("tokenid", ""))) return r;
        }
        return null;
    }

    public static synchronized void removeById(Context c, long id) {
        JSONArray arr = load(c);
        JSONArray next = new JSONArray();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject r = arr.optJSONObject(i);
            if (r == null || r.optLong("id", -1) == id) continue;
            next.put(r);
        }
        save(c, next);
    }

    public static JSONObject findById(Context c, long id) {
        JSONArray arr = load(c);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject r = arr.optJSONObject(i);
            if (r != null && r.optLong("id", -1) == id) return r;
        }
        return null;
    }

    private static JSONObject pending(Context c) {
        try { return new JSONObject(prefs(c).getString(KEY_PENDING, "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }
}
