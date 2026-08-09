package com.eurobuddha.statenft;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Bitmap;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.ArrayDeque;
import java.util.function.Consumer;

/**
 * Bridge to the artBox generative engine — minidapp/art.js shipped VERBATIM in
 * assets/artstudio/ and run inside a hidden WebView, so the 18 style packs are
 * byte-identical between the MiniDapp and this app: the same seed + config
 * reproduces the same SVG on both. Java never re-implements a pack.
 *
 * All calls are UI-thread, callback-based. Results cross the bridge as
 * JSON.stringify(...) evaluated by evaluateJavascript, whose callback hands us
 * that string as a JSON string literal — unquoted via JSONTokener, then parsed.
 */
public final class ArtStudio {

    public interface Ready { void run(ArtStudio studio); }

    private static ArtStudio sInstance;

    private final WebView web;
    private boolean ready = false;
    private final ArrayDeque<Runnable> queue = new ArrayDeque<>();

    @SuppressLint("SetJavaScriptEnabled")
    private ArtStudio(Activity act) {
        web = new WebView(act.getApplicationContext());
        web.getSettings().setJavaScriptEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                ready = true;
                while (!queue.isEmpty()) queue.poll().run();
            }
        });
        web.loadUrl("file:///android_asset/artstudio/bridge.html");
    }

    /** Lazy singleton — the WebView loads art.js once and is reused. */
    public static void with(Activity act, Ready cb) {
        if (sInstance == null) sInstance = new ArtStudio(act);
        ArtStudio s = sInstance;
        if (s.ready) cb.run(s);
        else s.queue.add(() -> cb.run(s));
    }

    /* ---- art.js calls ---- */

    /** [{key, label}, …] in pack order — drives the style picker. */
    public void styles(Consumer<JSONArray> cb) {
        eval("Object.keys(ART_STYLES).map(function(k){return {key:k,label:ART_STYLES[k].label};})",
                v -> cb.accept(asArray(v)));
    }

    /** The pack's default config: {style, slots:[{key,label,variants:[{name,weight}]}]}. */
    public void defaultConfig(String styleKey, Consumer<JSONObject> cb) {
        eval("artDefaultConfig(" + JSONObject.quote(styleKey) + ")", v -> cb.accept(asObject(v)));
    }

    /** Rebuild a saved config on the current slot set — packs gain slots
     *  between releases and stale drafts would hide them (weights survive). */
    public void migrate(JSONObject cfg, Consumer<JSONObject> cb) {
        eval("artMigrateConfig(" + cfg.toString() + ")", v -> cb.accept(asObject(v)));
    }

    /** Distinct trait combinations the config can yield. */
    public void capacity(JSONObject cfg, Consumer<Long> cb) {
        eval("artCapacity(" + cfg.toString() + ")", v -> {
            try { cb.accept(Long.parseLong(v.trim())); } catch (Exception e) { cb.accept(0L); }
        });
    }

    /** {items:[{idx,svg,traits,key,score,bytes,salt}], error} — deterministic per (seed, cfg). */
    public void generate(String seed, int n, JSONObject cfg, Consumer<JSONObject> cb) {
        eval("artCollection(" + JSONObject.quote(seed) + "," + n + "," + cfg.toString() + ")",
                v -> cb.accept(asObject(v)));
    }

    /** Quantize a 96x96 RGBA array (a JSON int array, w*h*4 long) into the
     *  photo pack's master grid via photoQuantize + artSetPhoto. The master
     *  lives in the WebView for the process lifetime — same as the MiniDapp
     *  page session. cb receives the palette size (0 = failed). */
    public void setPhoto(String rgbaJson, Consumer<Integer> cb) {
        eval("(function(){try{artSetPhoto(photoQuantize(" + rgbaJson
                        + ",96,96,8));return ART_PHOTO_SRC.palette.length;}"
                        + "catch(e){artSetPhoto(null);return 0;}})()",
                v -> {
                    int k;
                    try { k = Integer.parseInt(v.trim()); } catch (Exception e) { k = 0; }
                    cb.accept(k);
                });
    }

    /** Drop the loaded photo — the pack reverts to its placeholder bust. */
    public void clearPhoto(Runnable done) {
        eval("(artSetPhoto(null),0)", v -> { if (done != null) done.run(); });
    }

    /** The style-card thumbnail SVG (fixed seed, so cards are stable). */
    public void thumb(String styleKey, Consumer<String> cb) {
        eval("(artGenerate('artbox-style-card','1',artDefaultConfig(" + JSONObject.quote(styleKey)
                + "))||{svg:''}).svg", v -> {
            Object o = unquote(v);
            cb.accept(o instanceof String ? (String) o : "");
        });
    }

    /* ---- plumbing ---- */

    private void eval(String expr, Consumer<String> raw) {
        web.evaluateJavascript("JSON.stringify(" + expr + ")", value -> {
            Object o = unquote(value == null ? "null" : value);
            raw.accept(o instanceof String ? (String) o : String.valueOf(o));
        });
    }

    /** evaluateJavascript returns a JSON literal — a stringified result arrives
     *  double-encoded, so peel the outer quoting first. */
    private static Object unquote(String value) {
        try { return new JSONTokener(value).nextValue(); } catch (Exception e) { return null; }
    }

    private static JSONObject asObject(String json) {
        try { return new JSONObject(json); } catch (Exception e) { return new JSONObject(); }
    }

    private static JSONArray asArray(String json) {
        try { return new JSONArray(json); } catch (Exception e) { return new JSONArray(); }
    }

    /* ---- rendering ---- */

    /** Rasterize one of our square viewBox-only SVGs for a preview tile. */
    public static Bitmap svgBitmap(String svg, int px) {
        try {
            com.caverock.androidsvg.SVG s = com.caverock.androidsvg.SVG.getFromString(svg);
            s.setDocumentWidth(px);
            s.setDocumentHeight(px);
            Bitmap bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
            s.renderToCanvas(new android.graphics.Canvas(bmp));
            return bmp;
        } catch (Throwable t) {
            return null;
        }
    }
}
