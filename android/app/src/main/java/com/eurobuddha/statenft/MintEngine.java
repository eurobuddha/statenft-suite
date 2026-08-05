package com.eurobuddha.statenft;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

public final class MintEngine {
    public interface Done {
        void done(String message);
    }

    private static final int CREATE_TIMEOUT = 20;

    private MintEngine() {}

    public static void tick(Context ctx, NodeApi node, Done done) {
        cmd(node, "block", new Cb() {
            @Override public void ok(JSONObject block) {
                int tip = block.optJSONObject("response") == null ? 0 : block.optJSONObject("response").optInt("block", 0);
                LocalStore.prunePending(ctx, tip);
                JSONArray rows = LocalStore.load(ctx);
                tickRow(ctx, node, rows, 0, tip, done);
            }
            @Override public void fail(String e) { done.done("Mint tick failed: " + e); }
        });
    }

    private static void tickRow(Context ctx, NodeApi node, JSONArray rows, int i, int tip, Done done) {
        if (i >= rows.length()) { done.done("Mint engine idle"); return; }
        JSONObject row = rows.optJSONObject(i);
        if (row == null) { tickRow(ctx, node, rows, i + 1, tip, done); return; }
        String phase = row.optString("phase", "DONE");
        if ("DONE".equals(phase) || "BURIED".equals(phase) || "NEEDIMAGES".equals(phase)) {
            tickRow(ctx, node, rows, i + 1, tip, done);
            return;
        }
        if ("CREATE".equals(phase)) phaseCreate(ctx, node, row, tip, done);
        else if ("MOVE".equals(phase)) phaseMove(ctx, node, row, tip, done);
        else if ("SPLIT".equals(phase)) phaseSplit(ctx, node, row, tip, done);
        else if ("STAMP".equals(phase)) phaseStamp(ctx, node, row, tip, done);
        else if ("BURY".equals(phase)) done.done("Bury is handled from the Bury screen");
        else tickRow(ctx, node, rows, i + 1, tip, done);
    }

    public static void resumeNow(Context ctx, NodeApi node, Done done) {
        tick(ctx, node, done);
    }

    private static void phaseCreate(Context ctx, NodeApi node, JSONObject row, int tip, Done done) {
        cmd(node, "balance", new Cb() {
            @Override public void ok(JSONObject res) {
                JSONArray bal = res.optJSONArray("response");
                List<String> candidates = new ArrayList<>();
                if (bal != null) {
                    for (int i = 0; i < bal.length(); i++) {
                        JSONObject b = bal.optJSONObject(i);
                        if (b == null) continue;
                        JSONObject t = b.optJSONObject("token");
                        if (t == null) continue;
                        if (row.optString("name").equals(t.optString("name"))
                                && row.optInt("size") == t.optInt("size")
                                && row.optString("mode").equals(t.optString("mode"))) {
                            candidates.add(b.optString("tokenid"));
                        }
                    }
                }
                findMatchingToken(ctx, node, row, candidates, 0, new ArrayList<>(), tip, done);
            }
            @Override public void fail(String e) { setError(ctx, row, e, done); }
        });
    }

    private static void findMatchingToken(Context ctx, NodeApi node, JSONObject row, List<String> cands,
                                          int i, List<String> matches, int tip, Done done) {
        if (i >= cands.size()) {
            if (matches.size() > 1) {
                setError(ctx, row, "ambiguous mint: " + matches.size() + " tokens match", done);
                return;
            }
            if (matches.size() == 1) {
                put(row, "tokenid", matches.get(0));
                setPhase(ctx, row, "MOVE", done);
                return;
            }
            postTokenCreate(ctx, node, row, tip, done);
            return;
        }
        String tid = cands.get(i);
        cmd(node, "tokens tokenid:" + tid, new Cb() {
            @Override public void ok(JSONObject res) {
                JSONObject t = res.optJSONObject("response");
                String script = t == null ? "" : t.optString("script", "");
                if (StateNft.script(row.optString("creatorpk"), row.optString("mode")).equals(script)) matches.add(tid);
                findMatchingToken(ctx, node, row, cands, i + 1, matches, tip, done);
            }
            @Override public void fail(String e) {
                findMatchingToken(ctx, node, row, cands, i + 1, matches, tip, done);
            }
        });
    }

    private static void postTokenCreate(Context ctx, NodeApi node, JSONObject row, int tip, Done done) {
        if (row.optInt("posted", 0) == 1) {
            int waited = tip - row.optInt("postedat", 0);
            if (row.optInt("postedat", 0) == 0 || waited < CREATE_TIMEOUT) {
                done.done("Waiting for tokencreate confirmation");
                return;
            }
            put(row, "posted", 0);
            setError(ctx, row, "tokencreate did not confirm within " + CREATE_TIMEOUT + " blocks - retrying", done);
            return;
        }
        StateNft.Meta m = metaFromRow(row);
        String cmd = "tokencreate name:" + StateNft.tokenMetadata(m).toString()
                + " amount:" + row.optInt("size")
                + " decimals:0"
                + " script:\"" + StateNft.script(row.optString("creatorpk"), row.optString("mode")) + "\""
                + " state:{\"0\":\"0\"}"
                + " signtoken:" + row.optString("creatorpk");
        if (!row.optString("webvalidate").isEmpty()) cmd += " webvalidate:" + row.optString("webvalidate");
        cmd(node, cmd, new Cb() {
            @Override public void ok(JSONObject res) {
                put(row, "posted", 1);
                put(row, "postedat", tip);
                put(row, "error", "");
                LocalStore.upsert(ctx, row);
                done.done("Tokencreate posted");
            }
            @Override public void fail(String e) { setError(ctx, row, e, done); }
        });
    }

    private static void phaseMove(Context ctx, NodeApi node, JSONObject row, int tip, Done done) {
        tokenCoins(node, row.optString("tokenid"), mine -> {
            if (mine.length() == 0) { done.done("Waiting for mint coin"); return; }
            List<JSONObject> strays = new ArrayList<>();
            for (int i = 0; i < mine.length(); i++) {
                JSONObject c = mine.optJSONObject(i);
                if (c != null && !row.optString("creatoraddr").equals(c.optString("address"))) strays.add(c);
            }
            if (strays.isEmpty()) { setPhase(ctx, row, "SPLIT", done); return; }
            JSONObject c = strays.get(0);
            if (!LocalStore.pendingOk(ctx, c.optString("coinid"), tip)) { done.done("Move pending"); return; }
            LocalStore.setPending(ctx, c.optString("coinid"), tip);
            String id = "mv" + row.optLong("id");
            List<String> steps = new ArrayList<>();
            steps.add("txninput id:" + id + " coinid:" + c.optString("coinid"));
            steps.add("txnoutput id:" + id + " amount:" + c.optString("tokenamount")
                    + " address:" + row.optString("creatoraddr")
                    + " tokenid:" + row.optString("tokenid") + " storestate:true");
            steps.add("txnstate id:" + id + " port:0 value:0");
            steps.add("txnsign id:" + id + " publickey:auto");
            steps.add("txnsign id:" + id + " publickey:" + row.optString("creatorpk"));
            postTxn(node, id, steps, () -> done.done("Move posted"), e -> setError(ctx, row, e, done));
        }, e -> setError(ctx, row, e, done));
    }

    private static void phaseSplit(Context ctx, NodeApi node, JSONObject row, int tip, Done done) {
        tokenCoins(node, row.optString("tokenid"), coins -> {
            int units = 0;
            List<JSONObject> bigs = new ArrayList<>();
            for (int i = 0; i < coins.length(); i++) {
                JSONObject c = coins.optJSONObject(i);
                if (c == null) continue;
                int amt = parseInt(c.optString("tokenamount", "0"));
                if (amt == 1) units++;
                else if (amt > 1) bigs.add(c);
            }
            if (units >= row.optInt("size") && bigs.isEmpty()) { setPhase(ctx, row, "STAMP", done); return; }
            if (bigs.isEmpty()) { done.done("Waiting for split coins"); return; }
            JSONObject c = bigs.get(0);
            if (!LocalStore.pendingOk(ctx, c.optString("coinid"), tip)) { done.done("Split pending"); return; }
            LocalStore.setPending(ctx, c.optString("coinid"), tip);
            splitCoin(node, row, c, Math.min(3, parseInt(c.optString("tokenamount", "1"))),
                    () -> done.done("Split posted"), e -> setError(ctx, row, e, done));
        }, e -> setError(ctx, row, e, done));
    }

    private static void splitCoin(NodeApi node, JSONObject row, JSONObject coin, int k, Runnable ok, java.util.function.Consumer<String> fail) {
        int n = parseInt(coin.optString("tokenamount", "0"));
        if (k > n) k = n;
        String id = "sp" + row.optLong("id");
        List<String> steps = new ArrayList<>();
        steps.add("txninput id:" + id + " coinid:" + coin.optString("coinid"));
        for (int i = 0; i < k; i++) {
            steps.add("txnoutput id:" + id + " amount:1 address:" + row.optString("creatoraddr")
                    + " tokenid:" + row.optString("tokenid") + " storestate:true");
        }
        if (n - k > 0) {
            steps.add("txnoutput id:" + id + " amount:" + (n - k) + " address:" + row.optString("creatoraddr")
                    + " tokenid:" + row.optString("tokenid") + " storestate:true");
        }
        steps.add("txnstate id:" + id + " port:0 value:0");
        steps.add("txnsign id:" + id + " publickey:auto");
        int finalK = k;
        postTxn(node, id, steps, ok, e -> {
            if (e.contains("size too large") && finalK > 1) splitCoin(node, row, coin, finalK / 2, ok, fail);
            else fail.accept(e);
        });
    }

    private static void phaseStamp(Context ctx, NodeApi node, JSONObject row, int tip, Done done) {
        tokenCoins(node, row.optString("tokenid"), coins -> {
            HashSet<String> used = new HashSet<>();
            List<JSONObject> blanks = new ArrayList<>();
            for (int i = 0; i < coins.length(); i++) {
                JSONObject c = coins.optJSONObject(i);
                if (c == null) continue;
                String idx = StateNft.stamped(c);
                if (idx != null) used.add(idx);
                else if ("1".equals(c.optString("tokenamount"))) blanks.add(c);
            }
            updateCoinIds(row, coins);
            if (used.size() >= row.optInt("size")) { setPhase(ctx, row, "DONE", done); return; }
            if (blanks.isEmpty()) { LocalStore.upsert(ctx, row); done.done("Waiting for blank unit coins"); return; }
            int idx = firstFree(row.optInt("size"), used);
            JSONObject c = blanks.get(0);
            if (!LocalStore.pendingOk(ctx, c.optString("coinid"), tip)) {
                LocalStore.upsert(ctx, row);
                done.done("Stamp pending");
                return;
            }
            String img = itemImage(row, idx);
            if ("embed".equals(row.optString("mode")) && img.isEmpty()) {
                put(row, "phase", "NEEDIMAGES");
                put(row, "error", "missing image for item #" + idx);
                LocalStore.upsert(ctx, row);
                done.done(row.optString("error"));
                return;
            }
            LocalStore.setPending(ctx, c.optString("coinid"), tip);
            String id = "st" + row.optLong("id") + "x" + idx;
            List<String> steps = new ArrayList<>();
            steps.add("txninput id:" + id + " coinid:" + c.optString("coinid"));
            steps.add("txnoutput id:" + id + " amount:1 address:" + row.optString("creatoraddr")
                    + " tokenid:" + row.optString("tokenid") + " storestate:true");
            steps.add("txnstate id:" + id + " port:0 value:" + idx);
            if ("embed".equals(row.optString("mode"))) steps.add("txnstate id:" + id + " port:1 value:[" + img + "]");
            steps.add("txnsign id:" + id + " publickey:auto");
            postTxn(node, id, steps, () -> done.done("Stamped item #" + idx), e -> setError(ctx, row, e, done));
        }, e -> setError(ctx, row, e, done));
    }

    private static void postTxn(NodeApi node, String id, List<String> steps, Runnable ok, java.util.function.Consumer<String> fail) {
        cmd(node, "txndelete id:" + id, new Cb() {
            @Override public void ok(JSONObject ignored) { build(); }
            @Override public void fail(String e) { build(); }
            private void build() {
                List<String> build = new ArrayList<>();
                List<String> signs = new ArrayList<>();
                for (String s : steps) {
                    if (s.startsWith("txnsign")) signs.add(s);
                    else build.add(s);
                }
                List<String> cmds = new ArrayList<>();
                cmds.add("txncreate id:" + id);
                cmds.addAll(build);
                runCommands(node, cmds, () -> checkAndSign(node, id, signs, ok, fail), e -> cleanup(node, id, fail, e));
            }
        });
    }

    private static void checkAndSign(NodeApi node, String id, List<String> signs, Runnable ok, java.util.function.Consumer<String> fail) {
        cmd(node, "txncheck id:" + id, new Cb() {
            @Override public void ok(JSONObject res) {
                JSONArray coins = res.optJSONObject("response") == null ? null : res.optJSONObject("response").optJSONArray("coins");
                boolean bad = coins == null || coins.length() == 0;
                if (coins != null) {
                    for (int i = 0; i < coins.length(); i++) {
                        JSONObject c = coins.optJSONObject(i);
                        if (c != null && !"0".equals(c.optString("difference"))) bad = true;
                    }
                }
                if (bad) { cleanup(node, id, fail, "unbalanced txn " + id); return; }
                List<String> cmds = new ArrayList<>(signs);
                cmds.add("txnbasics id:" + id);
                cmds.add("txnpost id:" + id);
                runCommands(node, cmds, () -> {
                    cmd(node, "txndelete id:" + id, new Cb() {
                        @Override public void ok(JSONObject ignored) { ok.run(); }
                        @Override public void fail(String e) { ok.run(); }
                    });
                }, e -> cleanup(node, id, fail, e));
            }
            @Override public void fail(String e) { cleanup(node, id, fail, e); }
        });
    }

    private static void runCommands(NodeApi node, List<String> cmds, Runnable ok, java.util.function.Consumer<String> fail) {
        runCommandAt(node, cmds, 0, ok, fail);
    }

    private static void runCommandAt(NodeApi node, List<String> cmds, int i, Runnable ok, java.util.function.Consumer<String> fail) {
        if (i >= cmds.size()) { ok.run(); return; }
        cmd(node, cmds.get(i), new Cb() {
            @Override public void ok(JSONObject res) { runCommandAt(node, cmds, i + 1, ok, fail); }
            @Override public void fail(String e) { fail.accept(e); }
        });
    }

    private static void cleanup(NodeApi node, String id, java.util.function.Consumer<String> fail, String e) {
        cmd(node, "txndelete id:" + id, new Cb() {
            @Override public void ok(JSONObject ignored) { fail.accept(e); }
            @Override public void fail(String ignored) { fail.accept(e); }
        });
    }

    private static void tokenCoins(NodeApi node, String tid, CoinsCb ok, java.util.function.Consumer<String> fail) {
        cmd(node, "coins relevant:true tokenid:" + tid, new Cb() {
            @Override public void ok(JSONObject res) {
                JSONArray arr = res.optJSONArray("response");
                ok.ok(arr == null ? new JSONArray() : arr);
            }
            @Override public void fail(String e) { fail.accept(e); }
        });
    }

    private static void cmd(NodeApi node, String command, Cb cb) {
        node.cmd(command, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                if (json.optBoolean("status", false)) cb.ok(json);
                else cb.fail(json.optString("error", json.optString("response", command + " failed")));
            }
            @Override public void onError(String message) { cb.fail(message); }
        });
    }

    private static void setPhase(Context ctx, JSONObject row, String phase, Done done) {
        put(row, "phase", phase);
        put(row, "error", "");
        LocalStore.upsert(ctx, row);
        done.done("Collection " + row.optString("name") + " -> " + phase);
    }

    private static void setError(Context ctx, JSONObject row, String error, Done done) {
        put(row, "error", error);
        LocalStore.upsert(ctx, row);
        done.done(error);
    }

    static StateNft.Meta metaFromRow(JSONObject row) {
        StateNft.Meta m = new StateNft.Meta();
        m.localId = row.optLong("id");
        m.name = row.optString("name", "Collection");
        m.description = row.optString("description", "");
        m.mode = row.optString("mode", "url");
        m.size = row.optInt("size", 0);
        m.base = row.optString("base", "");
        m.ext = row.optString("ext", ".png");
        m.icon = row.optString("icon", "");
        m.externalUrl = row.optString("externalurl", "");
        m.webvalidate = row.optString("webvalidate", "");
        m.creatorPk = row.optString("creatorpk", "");
        m.creatorAddr = row.optString("creatoraddr", "");
        m.tokenid = row.optString("tokenid", "");
        m.phase = row.optString("phase", "DONE");
        m.error = row.optString("error", "");
        m.posted = row.optInt("posted", 0);
        m.postedAt = row.optInt("postedat", 0);
        m.creator = true;
        m.created = true;
        return m;
    }

    static JSONObject rowFromMeta(StateNft.Meta m, JSONArray items) {
        JSONObject row = new JSONObject();
        put(row, "id", m.localId);
        put(row, "name", m.name);
        put(row, "description", m.description);
        put(row, "mode", m.mode);
        put(row, "size", m.size);
        put(row, "base", m.base);
        put(row, "ext", m.ext);
        put(row, "icon", m.icon);
        put(row, "webvalidate", m.webvalidate);
        put(row, "externalurl", m.externalUrl);
        put(row, "creatoraddr", m.creatorAddr);
        put(row, "creatorpk", m.creatorPk);
        put(row, "tokenid", m.tokenid);
        put(row, "phase", m.phase);
        put(row, "posted", m.posted);
        put(row, "postedat", m.postedAt);
        put(row, "error", m.error);
        put(row, "items", items == null ? new JSONArray() : items);
        return row;
    }

    static JSONArray localItems(JSONObject row) {
        JSONArray items = row.optJSONArray("items");
        return items == null ? new JSONArray() : items;
    }

    private static void updateCoinIds(JSONObject row, JSONArray coins) {
        JSONArray items = localItems(row);
        for (int i = 0; i < coins.length(); i++) {
            JSONObject c = coins.optJSONObject(i);
            if (c == null) continue;
            String idx = StateNft.stamped(c);
            if (idx == null || !idx.matches("^[0-9]+$")) continue;
            for (int j = 0; j < items.length(); j++) {
                JSONObject it = items.optJSONObject(j);
                if (it != null && it.optInt("idx") == parseInt(idx)) put(it, "coinid", c.optString("coinid"));
            }
        }
        put(row, "items", items);
    }

    private static String itemImage(JSONObject row, int idx) {
        JSONArray items = localItems(row);
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it != null && it.optInt("idx") == idx) return it.optString("image", "");
        }
        return "";
    }

    private static int firstFree(int size, HashSet<String> used) {
        for (int i = 1; i <= size; i++) if (!used.contains(String.valueOf(i))) return i;
        return size;
    }

    private static int parseInt(String s) {
        try { return Integer.parseInt(s); } catch (Exception e) { return 0; }
    }

    private static void put(JSONObject o, String k, Object v) {
        try { o.put(k, v); } catch (Exception ignored) {}
    }

    private interface Cb {
        void ok(JSONObject res);
        void fail(String e);
    }

    private interface CoinsCb {
        void ok(JSONArray coins);
    }
}
