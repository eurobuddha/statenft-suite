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
                tickRow(ctx, node, rows, 0, tip, false, done);
            }
            @Override public void fail(String e) { done.done("Mint tick failed: " + e); }
        });
    }

    // Every active row advances one step per tick; an errored or waiting row
    // must never starve the ones after it (matches engine.js engineTick).
    private static void tickRow(Context ctx, NodeApi node, JSONArray rows, int i, int tip, boolean acted, Done done) {
        if (i >= rows.length()) {
            if (!acted) done.done("Mint engine idle");
            return;
        }
        JSONObject row = rows.optJSONObject(i);
        String phase = row == null ? "DONE" : row.optString("phase", "DONE");
        if (row == null || "DONE".equals(phase) || "BURIED".equals(phase) || "BURY".equals(phase)) {
            tickRow(ctx, node, rows, i + 1, tip, acted, done);
            return;
        }
        final String rowName = row.optString("name", "?");
        Done next = msg -> {
            String line = rowName + " · " + phase + ": " + msg;
            LocalStore.logEvent(ctx, line);
            done.done(line);
            tickRow(ctx, node, rows, i + 1, tip, true, done);
        };
        if ("CREATE".equals(phase)) phaseCreate(ctx, node, row, tip, next);
        else if ("MOVE".equals(phase)) phaseMove(ctx, node, row, tip, next);
        else if ("SPLIT".equals(phase)) phaseSplit(ctx, node, row, tip, next);
        else if ("STAMP".equals(phase)) phaseStamp(ctx, node, row, tip, next);
        else if ("NEEDIMAGES".equals(phase)) phaseNeedImages(ctx, node, row, next);
        else tickRow(ctx, node, rows, i + 1, tip, acted, done);
    }

    public static void resumeNow(Context ctx, NodeApi node, Done done) {
        tick(ctx, node, done);
    }

    private static void phaseCreate(Context ctx, NodeApi node, JSONObject row, int tip, Done done) {
        cmd(node, "balance", new Cb() {
            @Override public void ok(JSONObject res) {
                JSONArray bal = res.optJSONArray("response");
                // tokenids already claimed by another row must not be re-bound
                HashSet<String> bound = new HashSet<>();
                JSONArray all = LocalStore.load(ctx);
                for (int i = 0; i < all.length(); i++) {
                    JSONObject r = all.optJSONObject(i);
                    String tid = r == null ? "" : r.optString("tokenid", "");
                    if (!tid.isEmpty()) bound.add(tid);
                }
                List<String> candidates = new ArrayList<>();
                if (bal != null) {
                    for (int i = 0; i < bal.length(); i++) {
                        JSONObject b = bal.optJSONObject(i);
                        if (b == null) continue;
                        JSONObject t = b.optJSONObject("token");
                        if (t == null) continue;
                        if (row.optString("name").equals(t.optString("name"))
                                && row.optInt("size") == t.optInt("size")
                                && row.optString("mode").equals(t.optString("mode"))
                                && !bound.contains(b.optString("tokenid"))) {
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
        JSONObject tokenMeta = StateNft.tokenMetadata(m);
        JSONObject itemTraits = row.optJSONObject("itemtraits");
        if (itemTraits != null && itemTraits.length() > 0) put(tokenMeta, "traits", itemTraits);
        String cmd = "tokencreate name:" + tokenMeta
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
                if (c != null && !row.optString("creatoraddr").equals(c.optString("address"))
                        && LocalStore.pendingOk(ctx, c.optString("coinid"), tip)) {
                    strays.add(c);
                }
            }
            boolean anyStray = false;
            for (int i = 0; i < mine.length(); i++) {
                JSONObject c = mine.optJSONObject(i);
                if (c != null && !row.optString("creatoraddr").equals(c.optString("address"))) anyStray = true;
            }
            if (!anyStray) { setPhase(ctx, row, "SPLIT", done); return; }
            if (strays.isEmpty()) { done.done("Move confirming…"); return; }
            moveNext(ctx, node, row, tip, strays, 0, done);
        }, e -> setError(ctx, row, e, done));
    }

    private static void moveNext(Context ctx, NodeApi node, JSONObject row, int tip,
                                 List<JSONObject> strays, int i, Done done) {
        if (i >= strays.size()) { done.done("Posted " + strays.size() + " move(s)"); return; }
        JSONObject c = strays.get(i);
        LocalStore.setPending(ctx, c.optString("coinid"), tip);
        String id = "mv" + row.optLong("id") + "x" + i;
        List<String> steps = new ArrayList<>();
        steps.add("txninput id:" + id + " coinid:" + c.optString("coinid"));
        steps.add("txnoutput id:" + id + " amount:" + c.optString("tokenamount")
                + " address:" + row.optString("creatoraddr")
                + " tokenid:" + row.optString("tokenid") + " storestate:true");
        steps.add("txnstate id:" + id + " port:0 value:0");
        steps.add("txnsign id:" + id + " publickey:auto");
        steps.add("txnsign id:" + id + " publickey:" + row.optString("creatorpk"));
        postTxn(node, id, steps,
                () -> moveNext(ctx, node, row, tip, strays, i + 1, done),
                e -> setError(ctx, row, e, done));
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
            List<JSONObject> ready = new ArrayList<>();
            for (JSONObject c : bigs) {
                if (LocalStore.pendingOk(ctx, c.optString("coinid"), tip)) ready.add(c);
            }
            if (ready.isEmpty()) { done.done("Splits confirming…"); return; }
            /* Honest escalation: a ready coin here means a posted split's
             * pending TTL expired. If the unit count hasn't moved after three
             * such cycles, the txn is being rejected by consensus (too heavy
             * for the 64KB TxPoW even at unit+change) — say so and stop
             * hammering the chain. Progress resets the counter, so a slow
             * confirmation self-heals. */
            int lastUnits = row.optInt("splitunits", -1);
            int retries = row.optInt("splitretries", 0);
            if (lastUnits >= 0 && units <= lastUnits) {
                retries++;
                if (retries >= 3) {
                    put(row, "splitretries", retries);
                    setError(ctx, row, "split cannot fit the chain's 64KB transaction cap — "
                            + "this token's definition (icon + traits) is too heavy. "
                            + "Bury this collection and re-mint with a lighter icon or fewer traits.", done);
                    return;
                }
            } else {
                retries = 0;
            }
            put(row, "splitretries", retries);
            put(row, "splitunits", units);
            LocalStore.upsert(ctx, row);
            /* Every token-carrying output (and the input) embeds the FULL token
             * definition — icon + per-item traits included. A generative
             * collection's definition runs ~11KB, so the old fixed 3-unit batch
             * built ~55KB+ txns that the node accepted and the chain silently
             * rejected: the split retried forever with no error. Measure the
             * definition once and size the batch to fit the 64KB TxPoW. */
            node.cmd("tokens tokenid:" + row.optString("tokenid"), new NodeApi.Cb() {
                @Override public void onResult(JSONObject json) {
                    Object r = json.opt("response");
                    int defLen = r == null ? 4000 : r.toString().length();
                    splitNext(ctx, node, row, tip, ready, 0, defLen, done);
                }
                @Override public void onError(String message) {
                    splitNext(ctx, node, row, tip, ready, 0, 12000, done);  // unknown: be conservative
                }
            });
        }, e -> setError(ctx, row, e, done));
    }

    /** Estimated on-chain token-definition weight at mint time: icon + traits
     *  + name/desc + ~900B for the script and JSON scaffolding. Definitions
     *  over ~12KB cannot split reliably under the 64KB TxPoW cap even at
     *  unit+change — such a mint must be refused BEFORE tokencreate, because
     *  the definition is immutable afterwards ("Math" taught us this). */
    static final int DEF_BUDGET = 10500;
    static int estimatedDefLen(String iconB64, String traitsJson, String nameDesc) {
        return (iconB64 == null ? 0 : iconB64.length())
             + (traitsJson == null ? 0 : traitsJson.length())
             + (nameDesc == null ? 0 : nameDesc.length()) + 900;
    }

    /** Unit outputs per split txn such that (k units + change + input) token
     *  definitions stay within ~40KB, leaving 24KB headroom for the signature
     *  and proofs under the 64KB TxPoW cap. Legacy ~7KB definitions still get
     *  the proven 3-unit batches; ~11KB generative definitions drop to 1. */
    static int splitBatch(int defLen) {
        int defs = Math.max(1, 40000 / Math.max(1, defLen));   // total defs that fit
        return Math.max(1, Math.min(3, defs - 2));             // minus input + change
    }

    private static void splitNext(Context ctx, NodeApi node, JSONObject row, int tip,
                                  List<JSONObject> bigs, int i, int defLen, Done done) {
        if (i >= bigs.size()) { done.done("Posted " + bigs.size() + " split(s)"); return; }
        JSONObject c = bigs.get(i);
        LocalStore.setPending(ctx, c.optString("coinid"), tip);
        int k = Math.min(splitBatch(defLen), parseInt(c.optString("tokenamount", "1")));
        LocalStore.logEvent(ctx, "split " + row.optString("name") + ": defLen=" + defLen
                + " batch=" + k + " coin=" + c.optString("tokenamount"));
        splitCoin(node, row, c, k,
                () -> splitNext(ctx, node, row, tip, bigs, i + 1, defLen, done),
                e -> setError(ctx, row, e, done));
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

    /* STAMP processes EVERY ready blank per tick — engine.js behavior. The
     * old one-per-tick port made a 17-item mint take the best part of an
     * hour of screen-on time. */
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
            // A depth-limited window can hide old stamps: merge the locally
            // recorded ones so the planner never re-issues an index (a duplicate
            // sealed identity would be unrecoverable under the locked contract)
            mergeLocalStamps(row, used);
            if (used.size() >= row.optInt("size")) { setPhase(ctx, row, "DONE", done); return; }
            List<String> ready = new ArrayList<>();
            for (JSONObject c : blanks) {
                String cid = c.optString("coinid");
                if (LocalStore.pendingOk(ctx, cid, tip)) ready.add(cid);
            }
            if (ready.isEmpty()) {
                LocalStore.upsert(ctx, row);
                done.done(blanks.isEmpty() ? "Waiting for blank unit coins" : "Stamps confirming…");
                return;
            }
            List<String[]> plan = planAssignments(ready, used, row.optInt("size"));
            if (plan.isEmpty()) { LocalStore.upsert(ctx, row); done.done("All indices assigned — waiting for confirmations"); return; }
            stampNext(ctx, node, row, tip, plan, 0, done);
        }, e -> setError(ctx, row, e, done));
    }

    /** Pure planner: assign the lowest free index to each ready blank coin.
     *  Never re-issues an index in `used`; at most one index per coin. */
    static List<String[]> planAssignments(List<String> readyCoinIds, HashSet<String> used, int size) {
        List<String[]> out = new ArrayList<>();
        HashSet<String> taken = new HashSet<>(used);
        for (String cid : readyCoinIds) {
            int free = -1;
            for (int i = 1; i <= size; i++) {
                if (!taken.contains(String.valueOf(i))) { free = i; break; }
            }
            if (free < 0) break;
            taken.add(String.valueOf(free));
            out.add(new String[]{ cid, String.valueOf(free) });
        }
        return out;
    }

    private static void stampNext(Context ctx, NodeApi node, JSONObject row, int tip,
                                  List<String[]> plan, int i, Done done) {
        if (i >= plan.size()) {
            done.done("Posted " + plan.size() + " stamp" + (plan.size() == 1 ? "" : "s") + " this tick");
            return;
        }
        String coinid = plan.get(i)[0];
        int idx = parseInt(plan.get(i)[1]);
        String img = itemImage(row, idx);
        if ("embed".equals(row.optString("mode")) && img.isEmpty()) {
            // stamping is irreversible under the locked contract — park until
            // the plate is re-supplied, exactly like engine.js
            put(row, "phase", "NEEDIMAGES");
            put(row, "error", "missing image for item #" + idx);
            LocalStore.upsert(ctx, row);
            done.done(row.optString("error"));
            return;
        }
        LocalStore.setPending(ctx, coinid, tip);
        String id = "st" + row.optLong("id") + "x" + idx;
        List<String> steps = new ArrayList<>();
        steps.add("txninput id:" + id + " coinid:" + coinid);
        steps.add("txnoutput id:" + id + " amount:1 address:" + row.optString("creatoraddr")
                + " tokenid:" + row.optString("tokenid") + " storestate:true");
        steps.add("txnstate id:" + id + " port:0 value:" + idx);
        if ("embed".equals(row.optString("mode"))) steps.add("txnstate id:" + id + " port:1 value:[" + img + "]");
        steps.add("txnsign id:" + id + " publickey:auto");
        postTxn(node, id, steps,
                () -> stampNext(ctx, node, row, tip, plan, i + 1, done),
                e -> setError(ctx, row, e, done));
    }

    private static void phaseNeedImages(Context ctx, NodeApi node, JSONObject row, Done done) {
        tokenCoins(node, row.optString("tokenid"), coins -> {
            HashSet<String> used = new HashSet<>();
            for (int i = 0; i < coins.length(); i++) {
                JSONObject c = coins.optJSONObject(i);
                if (c == null) continue;
                String idx = StateNft.stamped(c);
                if (idx != null && idx.matches("^[0-9]+$")) used.add(idx);
            }
            mergeLocalStamps(row, used);
            if (used.size() >= row.optInt("size")) {
                setPhase(ctx, row, "DONE", done);
            } else if (missingLocalImages(row) == 0) {
                setPhase(ctx, row, "MOVE", done);
            } else {
                LocalStore.upsert(ctx, row);
                done.done(missingLocalImages(row) + " embedded images still missing");
            }
        }, e -> done.done("Waiting for missing embedded images"));
    }

    static void postTxn(NodeApi node, String id, List<String> steps, Runnable ok, java.util.function.Consumer<String> fail) {
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
        tokenCoinsBounded(node, tid, true, (coins, partial) -> ok.ok(coins), fail);
    }

    public interface CoinsBounded { void ok(JSONArray coins, boolean partial); }

    /** Coin query that survives the 256KB IPC cap. Fast path: one plain
     *  query. When the reply blows the cap (each coin drags the FULL token
     *  metadata — a 20-item embed collection is ~380KB), fall back to a
     *  complete PAGED SWEEP over [coinage, depth] age windows: adaptive
     *  spans halve on overflow down to single blocks and double on success,
     *  accumulating every coin de-duplicated by coinid. partial=true only
     *  when a single-block window itself exceeded the cap (skipped) or the
     *  sweep was cut short — callers must not treat absence as proof then.
     *  (Family rule: bounded paging, adaptive halving.) */
    /* ---- whole-wallet coin cache ----
     * Per-token `coins relevant:true tokenid:X` replies can land in the Binder
     * DEATH WINDOW (~250–256KB): just under the node's 256,000 hand-off cutoff
     * yet over the broadcast parcel limit — the delivery kills the app process
     * before any callback (TransactionTooLargeException, no stub, no error).
     * The whole-wallet list is safe by construction: big wallets always exceed
     * the cutoff and ride the fork node's content:// file hand-off; small ones
     * are nowhere near the window. So: fetch the WHOLE list once, filter by
     * tokenid locally, cache briefly so N collections cost one query. */
    private static final long WALLET_COINS_TTL_MS = 20000;
    private static JSONArray sWalletCoins = null;
    private static long sWalletCoinsAt = 0;

    private static synchronized JSONArray cachedWalletCoins() {
        if (sWalletCoins != null && System.currentTimeMillis() - sWalletCoinsAt < WALLET_COINS_TTL_MS) {
            return sWalletCoins;
        }
        return null;
    }

    private static synchronized void cacheWalletCoins(JSONArray coins) {
        sWalletCoins = coins;
        sWalletCoinsAt = System.currentTimeMillis();
    }

    private static JSONArray filterByToken(JSONArray all, String tid) {
        JSONArray out = new JSONArray();
        for (int i = 0; i < all.length(); i++) {
            JSONObject c = all.optJSONObject(i);
            if (c != null && tid.equals(c.optString("tokenid"))) out.put(c);
        }
        return out;
    }

    public static void tokenCoinsBounded(NodeApi node, String tid, boolean relevant,
                                         CoinsBounded ok, java.util.function.Consumer<String> fail) {
        if (relevant) {
            JSONArray cached = cachedWalletCoins();
            if (cached != null) { ok.ok(filterByToken(cached, tid), false); return; }
            node.cmd("coins relevant:true", new NodeApi.Cb() {
                @Override public void onResult(JSONObject json) {
                    if (!json.optBoolean("status", false)) {
                        fail.accept(json.optString("error", "coins query failed"));
                        return;
                    }
                    JSONArray arr = json.optJSONArray("response");
                    if (arr == null) arr = new JSONArray();
                    cacheWalletCoins(arr);
                    ok.ok(filterByToken(arr, tid), false);
                }
                @Override public void onError(String message) {
                    // legacy node without the file hand-off: the whole list can
                    // overflow — fall back to the bounded per-token sweep
                    if (NodeApi.ERR_TOO_LONG.equals(message)) { pagedSweep(node, tid, true, ok, fail); return; }
                    fail.accept(message);
                }
            });
            return;
        }
        /* all-coins pass (holdings beyond this wallet): the global per-token
         * reply is the one that stalled Panda at 383KB — the sweep's bounded
         * windows keep every reply small, so lead with it directly */
        pagedSweep(node, tid, false, ok, fail);
    }

    private static void pagedSweep(NodeApi node, String tid, boolean relevant,
                                   CoinsBounded ok, java.util.function.Consumer<String> fail) {
        node.cmd("block", new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONObject r = json.optJSONObject("response");
                int tip = r == null ? 0 : r.optInt("block", 0);
                if (tip <= 0) { fail.accept("block height unavailable for paged coin sweep"); return; }
                // start small: window replies must stay far below the Binder
                // death window (~250KB), not merely below the 256KB stub cutoff
                sweepWindow(node, tid, relevant, tip, 0, 64,
                        new java.util.LinkedHashMap<>(), new int[]{0}, new boolean[]{false}, ok);
            }
            @Override public void onError(String message) { fail.accept(message); }
        });
    }

    private static void sweepWindow(NodeApi node, String tid, boolean relevant, int tip,
                                    int from, int span,
                                    java.util.LinkedHashMap<String, JSONObject> acc,
                                    int[] requests, boolean[] partial, CoinsBounded ok) {
        if (from > tip || requests[0] >= 80) {
            if (from <= tip) partial[0] = true;   // request budget cut the sweep short
            JSONArray out = new JSONArray();
            for (JSONObject c : acc.values()) out.put(c);
            ok.ok(out, partial[0]);
            return;
        }
        int to = Math.min(from + span, tip + 10);
        requests[0]++;
        String command = "coins " + (relevant ? "relevant:true " : "") + "tokenid:" + tid
                + " coinage:" + from + " depth:" + to;
        node.cmd(command, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONArray arr = json.optBoolean("status", false) ? json.optJSONArray("response") : null;
                if (arr != null) {
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject c = arr.optJSONObject(i);
                        if (c != null) acc.put(c.optString("coinid"), c);
                    }
                }
                sweepWindow(node, tid, relevant, tip, to, Math.min(span * 2, 262144),
                        acc, requests, partial, ok);
            }
            @Override public void onError(String message) {
                if (NodeApi.ERR_TOO_LONG.equals(message)) {
                    if (span <= 1) {
                        // one single block alone exceeds the cap — skip it honestly
                        partial[0] = true;
                        sweepWindow(node, tid, relevant, tip, from + 1, 64, acc, requests, partial, ok);
                    } else {
                        sweepWindow(node, tid, relevant, tip, from, Math.max(1, span / 2),
                                acc, requests, partial, ok);
                    }
                    return;
                }
                // non-cap error mid-sweep: deliver what we have, flagged partial
                partial[0] = true;
                JSONArray out = new JSONArray();
                for (JSONObject c : acc.values()) out.put(c);
                ok.ok(out, true);
            }
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
        LocalStore.logEvent(ctx, "ERROR [" + row.optString("name") + " · "
                + row.optString("phase") + "]: " + error);
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
        m.owned = row.optInt("owned", 0);
        m.minted = row.optInt("minted", 0);
        m.buriedAt = row.optInt("buriedat", 0);
        m.created = row.optInt("created", 1) == 1;
        m.creator = m.created;
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
        put(row, "created", m.created ? 1 : 0);
        put(row, "owned", m.owned);
        put(row, "minted", m.minted);
        put(row, "buriedat", m.buriedAt);
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

    private static void mergeLocalStamps(JSONObject row, HashSet<String> used) {
        JSONArray items = localItems(row);
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it != null && !it.optString("coinid", "").isEmpty()) {
                used.add(String.valueOf(it.optInt("idx")));
            }
        }
    }

    private static int firstFree(int size, HashSet<String> used) {
        for (int i = 1; i <= size; i++) if (!used.contains(String.valueOf(i))) return i;
        return size;
    }

    private static int missingLocalImages(JSONObject row) {
        if (!"embed".equals(row.optString("mode"))) return 0;
        int size = row.optInt("size", 0);
        int missing = 0;
        for (int idx = 1; idx <= size; idx++) {
            if (itemImage(row, idx).isEmpty()) missing++;
        }
        return missing;
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
