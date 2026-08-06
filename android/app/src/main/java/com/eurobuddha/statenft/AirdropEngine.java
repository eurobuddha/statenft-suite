package com.eurobuddha.statenft;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/**
 * Batch airdrop: deliver owned stamped lots to a recipient list, one
 * identity-preserving transfer txn per coin, resumable across ticks.
 * The UTXO set (coin departed) is the only success signal — txnpost
 * status is never trusted.
 *
 * Job: {"localid":7,"tokenid":"0x…","entries":[
 *   {"idx":3,"coinid":"0x…","addr":"Mx…","coin":{…},"status":"PENDING|POSTED|DONE|FAIL","postedat":0,"error":""}]}
 */
public final class AirdropEngine {

    public interface Done { void done(String message); }

    private static final int REPOST_BLOCKS = 6;

    private AirdropEngine() {}

    /* ---- job store (one job per collection) ---- */

    public static JSONObject job(Context c, long localId) {
        return LocalStore.loadDraft(c, "airdrop_" + localId);
    }

    public static void saveJob(Context c, JSONObject j) {
        LocalStore.saveDraft(c, "airdrop_" + j.optLong("localid"), j);
        registerJob(c, j.optLong("localid"), true);
    }

    public static void clearJob(Context c, long localId) {
        LocalStore.clearDraft(c, "airdrop_" + localId);
        registerJob(c, localId, false);
    }

    private static void registerJob(Context c, long localId, boolean active) {
        JSONObject idx = LocalStore.loadDraft(c, "airdrop_index");
        if (idx == null) idx = new JSONObject();
        try {
            if (active) idx.put(String.valueOf(localId), 1);
            else idx.remove(String.valueOf(localId));
        } catch (Exception ignored) {}
        LocalStore.saveDraft(c, "airdrop_index", idx);
    }

    public static JSONObject createJob(StateNft.Meta meta, List<StateNft.Item> items, List<String> addrs) {
        JSONObject j = new JSONObject();
        try {
            j.put("localid", meta.localId);
            j.put("tokenid", meta.tokenid);
            JSONArray entries = new JSONArray();
            int n = Math.min(items.size(), addrs.size());
            for (int i = 0; i < n; i++) {
                StateNft.Item it = items.get(i);
                if (it.coin == null) continue;
                JSONObject e = new JSONObject();
                e.put("idx", it.index);
                e.put("coinid", it.coin.optString("coinid"));
                e.put("addr", addrs.get(i));
                e.put("coin", it.coin);
                e.put("status", "PENDING");
                e.put("postedat", 0);
                entries.put(e);
            }
            j.put("entries", entries);
        } catch (Exception ignored) {}
        return j;
    }

    public static int[] progress(JSONObject j) {
        JSONArray es = j == null ? null : j.optJSONArray("entries");
        if (es == null) return new int[]{0, 0};
        int done = 0;
        for (int i = 0; i < es.length(); i++) {
            if ("DONE".equals(es.optJSONObject(i).optString("status"))) done++;
        }
        return new int[]{done, es.length()};
    }

    /* ---- tick: advance every active job one step ---- */

    public static void tick(Context ctx, NodeApi node, Done done) {
        JSONObject idx = LocalStore.loadDraft(ctx, "airdrop_index");
        if (idx == null || idx.length() == 0) return;
        JSONArray names = idx.names();
        if (names == null) return;
        node.cmd("block", new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONObject r = json.optJSONObject("response");
                int tip = r == null ? 0 : r.optInt("block", 0);
                tickJob(ctx, node, names, 0, tip, done);
            }
            @Override public void onError(String message) { /* next tick */ }
        });
    }

    /* Per-coin `coins coinid:` checks — a full-state token query on a large
     * embed collection can exceed the 256KB IPC cap; single-coin replies
     * cannot. One transfer is posted per tick. */
    private static void tickJob(Context ctx, NodeApi node, JSONArray ids, int i, int tip, Done done) {
        if (i >= ids.length()) return;
        long localId = Long.parseLong(ids.optString(i, "0"));
        JSONObject j = job(ctx, localId);
        Runnable next = () -> tickJob(ctx, node, ids, i + 1, tip, done);
        if (j == null) { registerJob(ctx, localId, false); next.run(); return; }
        JSONArray es = j.optJSONArray("entries");
        if (es == null) { clearJob(ctx, localId); next.run(); return; }
        stepEntry(ctx, node, j, es, 0, tip, localId, new boolean[]{false}, done, next);
    }

    private static void stepEntry(Context ctx, NodeApi node, JSONObject j, JSONArray es, int k,
                                  int tip, long localId, boolean[] postedThisTick, Done done, Runnable next) {
        if (k >= es.length()) {
            saveJob(ctx, j);
            boolean allDone = true;
            for (int q = 0; q < es.length(); q++) {
                String st = es.optJSONObject(q) == null ? "FAIL" : es.optJSONObject(q).optString("status");
                if (!"DONE".equals(st) && !"FAIL".equals(st)) { allDone = false; break; }
            }
            if (allDone) {
                int[] p = progress(j);
                done.done("Airdrop finished — " + p[0] + "/" + p[1] + " lots delivered");
            }
            next.run();
            return;
        }
        JSONObject e = es.optJSONObject(k);
        Runnable advance = () -> stepEntry(ctx, node, j, es, k + 1, tip, localId, postedThisTick, done, next);
        if (e == null) { advance.run(); return; }
        String st = e.optString("status");
        if ("DONE".equals(st) || "FAIL".equals(st)) { advance.run(); return; }

        node.cmd("coins coinid:" + e.optString("coinid"), new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONArray cs = json.optJSONArray("response");
                boolean present = cs != null && cs.length() > 0;
                String status = e.optString("status");
                if ("POSTED".equals(status)) {
                    if (!present) {
                        put(e, "status", "DONE");
                        advance.run();
                        return;
                    }
                    if (tip - e.optInt("postedat", 0) >= REPOST_BLOCKS) put(e, "status", "PENDING");
                    else { advance.run(); return; }
                }
                if (!"PENDING".equals(e.optString("status"))) { advance.run(); return; }
                if (!present) {
                    put(e, "status", "FAIL");
                    put(e, "error", "coin no longer in wallet");
                    advance.run();
                    return;
                }
                if (postedThisTick[0]) { advance.run(); return; }
                JSONObject coin = e.optJSONObject("coin");
                if (coin == null || !StateNft.replayableState(coin)) {
                    put(e, "status", "FAIL");
                    put(e, "error", "malformed coin state");
                    advance.run();
                    return;
                }
                postedThisTick[0] = true;
                String txn = "drop" + localId + "x" + e.optInt("idx");
                MintEngine.postTxn(node, txn,
                        StateNft.transferCommands(txn, j.optString("tokenid"), coin, e.optString("addr")),
                        () -> {
                            put(e, "status", "POSTED");
                            put(e, "postedat", tip);
                            put(e, "error", "");
                            done.done("Airdrop: lot " + e.optInt("idx") + " posted");
                            advance.run();
                        },
                        err -> {
                            put(e, "error", err);
                            done.done("Airdrop: lot " + e.optInt("idx") + " failed: " + err);
                            advance.run();
                        });
            }
            @Override public void onError(String message) { advance.run(); }
        });
    }

    private static void put(JSONObject o, String k, Object v) {
        try { o.put(k, v); } catch (Exception ignored) {}
    }
}
