package com.eurobuddha.statenft;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ImageDecoder;
import android.graphics.Paint;
import android.graphics.Rect;
import android.net.Uri;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;

/**
 * Generative layer stacks: named layers of PNG variants (alpha preserved,
 * stored in filesDir), per-variant rarity weights, collision-free weighted
 * sampling, Canvas composition to a sealed JPEG within the on-chain budget.
 *
 * Model: {"layers":[{"name":"Background","variants":[{"name":"Dawn","file":"gen_….png","weight":60}]}]}
 */
public final class GenerativeComposer {

    public static final int[] WEIGHT_STEPS = {60, 30, 10, 3};
    public static final String[] WEIGHT_NAMES = {"Common", "Uncommon", "Rare", "Epic"};

    private GenerativeComposer() {}

    /* ---- model persistence ---- */

    public static JSONObject load(Context c) {
        JSONObject m = LocalStore.loadDraft(c, "generative");
        if (m == null) m = new JSONObject();
        if (!m.has("layers")) try { m.put("layers", new JSONArray()); } catch (Exception ignored) {}
        return m;
    }

    public static void save(Context c, JSONObject model) {
        LocalStore.saveDraft(c, "generative", model);
    }

    public static JSONArray layers(JSONObject model) {
        JSONArray l = model.optJSONArray("layers");
        return l == null ? new JSONArray() : l;
    }

    public static String weightName(int weight) {
        for (int i = 0; i < WEIGHT_STEPS.length; i++) if (WEIGHT_STEPS[i] == weight) return WEIGHT_NAMES[i];
        return weight + "%";
    }

    public static int nextWeight(int weight) {
        for (int i = 0; i < WEIGHT_STEPS.length; i++) {
            if (WEIGHT_STEPS[i] == weight) return WEIGHT_STEPS[(i + 1) % WEIGHT_STEPS.length];
        }
        return WEIGHT_STEPS[0];
    }

    /* ---- variant image storage (PNG, alpha preserved, local only) ---- */

    public static String addVariantImage(Context c, Uri uri) {
        try {
            ImageDecoder.Source src = ImageDecoder.createSource(c.getContentResolver(), uri);
            Bitmap bmp = ImageDecoder.decodeBitmap(src, (d, info, s) -> {
                d.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                int w = info.getSize().getWidth(), h = info.getSize().getHeight();
                int max = Math.max(w, h);
                if (max > 900) {
                    float f = 900f / max;
                    d.setTargetSize(Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f)));
                }
            });
            if (bmp == null) return null;
            File dir = new File(c.getFilesDir(), "generative");
            if (!dir.exists() && !dir.mkdirs()) return null;
            String name = "gen_" + System.currentTimeMillis() + "_" + (int) (Math.random() * 10000) + ".png";
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f)) {
                bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
            }
            return name;
        } catch (Exception e) {
            return null;
        }
    }

    public static Bitmap variantBitmap(Context c, String file) {
        try {
            File f = new File(new File(c.getFilesDir(), "generative"), file);
            return BitmapFactory.decodeFile(f.getAbsolutePath());
        } catch (Throwable t) {
            return null;
        }
    }

    public static void deleteVariantImage(Context c, String file) {
        try {
            File f = new File(new File(c.getFilesDir(), "generative"), file);
            if (f.exists() && !f.delete()) f.deleteOnExit();
        } catch (Throwable ignored) {}
    }

    /* ---- sampling ---- */

    public static long possibleCombos(JSONObject model) {
        JSONArray ls = layers(model);
        long total = 1;
        for (int i = 0; i < ls.length(); i++) {
            JSONObject l = ls.optJSONObject(i);
            JSONArray vs = l == null ? null : l.optJSONArray("variants");
            int n = vs == null ? 0 : vs.length();
            if (n == 0) return 0;
            total *= n;
            if (total > 1_000_000) return 1_000_000;
        }
        return ls.length() == 0 ? 0 : total;
    }

    /** Weighted, collision-free sampling. keep = already-fixed combos to preserve
     *  (counted toward count and excluded from re-rolls). Returns null when the
     *  stack cannot yield `count` unique combos. */
    public static List<int[]> sample(JSONObject model, int count, List<int[]> keep, Random rnd) {
        if (possibleCombos(model) < count) return null;
        JSONArray ls = layers(model);
        HashSet<String> seen = new HashSet<>();
        List<int[]> out = new ArrayList<>();
        if (keep != null) {
            for (int[] k : keep) {
                out.add(k);
                seen.add(key(k));
            }
        }
        int guard = 0;
        while (out.size() < count && guard++ < 20000) {
            int[] combo = new int[ls.length()];
            for (int i = 0; i < ls.length(); i++) {
                combo[i] = pickWeighted(ls.optJSONObject(i).optJSONArray("variants"), rnd);
            }
            String k = key(combo);
            if (seen.add(k)) out.add(combo);
        }
        return out.size() == count ? out : null;
    }

    private static int pickWeighted(JSONArray variants, Random rnd) {
        int total = 0;
        for (int i = 0; i < variants.length(); i++) {
            total += Math.max(1, variants.optJSONObject(i).optInt("weight", 30));
        }
        int roll = rnd.nextInt(total);
        int acc = 0;
        for (int i = 0; i < variants.length(); i++) {
            acc += Math.max(1, variants.optJSONObject(i).optInt("weight", 30));
            if (roll < acc) return i;
        }
        return variants.length() - 1;
    }

    private static String key(int[] combo) {
        StringBuilder sb = new StringBuilder();
        for (int v : combo) sb.append(v).append('.');
        return sb.toString();
    }

    /* ---- composition ---- */

    public static Bitmap compose(Context c, JSONObject model, int[] combo, int px) {
        JSONArray ls = layers(model);
        Bitmap out = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        cv.drawColor(0xFFFFFFFF);
        Paint p = new Paint(Paint.FILTER_BITMAP_FLAG);
        for (int i = 0; i < ls.length() && i < combo.length; i++) {
            JSONArray vs = ls.optJSONObject(i).optJSONArray("variants");
            if (vs == null || combo[i] < 0 || combo[i] >= vs.length()) continue;
            String file = vs.optJSONObject(combo[i]).optString("file", "");
            Bitmap layer = variantBitmap(c, file);
            if (layer == null) continue;
            // center-crop each layer to the square plate
            int lw = layer.getWidth(), lh = layer.getHeight();
            int side = Math.min(lw, lh);
            Rect src = new Rect((lw - side) / 2, (lh - side) / 2, (lw + side) / 2, (lh + side) / 2);
            cv.drawBitmap(layer, src, new Rect(0, 0, px, px), p);
            layer.recycle();
        }
        return out;
    }

    public static String composeB64(Context c, JSONObject model, int[] combo, int budget) {
        Bitmap bmp = compose(c, model, combo, 720);
        for (int quality = 92; quality >= 50; quality -= 10) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, bos);
            String b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
            if (b64.length() <= budget) { bmp.recycle(); return b64; }
        }
        bmp.recycle();
        return "";
    }

    public static JSONArray traitsFor(JSONObject model, int[] combo) {
        JSONArray attrs = new JSONArray();
        JSONArray ls = layers(model);
        for (int i = 0; i < ls.length() && i < combo.length; i++) {
            JSONObject l = ls.optJSONObject(i);
            JSONArray vs = l == null ? null : l.optJSONArray("variants");
            if (vs == null || combo[i] < 0 || combo[i] >= vs.length()) continue;
            JSONObject a = new JSONObject();
            try {
                a.put("trait_type", l.optString("name", "Layer " + (i + 1)));
                a.put("value", vs.optJSONObject(combo[i]).optString("name", "Variant " + (combo[i] + 1)));
            } catch (Exception ignored) {}
            attrs.put(a);
        }
        return attrs;
    }
}
