package com.eurobuddha.statenft;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public final class ImageTools {
    private ImageTools() {}

    public static String compressUri(Context c, Uri uri, int budget) throws Exception {
        byte[] raw;
        try (InputStream in = c.getContentResolver().openInputStream(uri);
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            if (in == null) return "";
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            raw = bos.toByteArray();
        }
        Bitmap src = BitmapFactory.decodeByteArray(raw, 0, raw.length);
        if (src == null) return "";
        int dim = 400;
        int quality = 80;
        while (dim >= 100) {
            float scale = Math.min(1f, dim / (float) Math.max(src.getWidth(), src.getHeight()));
            Bitmap scaled = Bitmap.createScaledBitmap(src,
                    Math.max(1, Math.round(src.getWidth() * scale)),
                    Math.max(1, Math.round(src.getHeight() * scale)), true);
            while (quality >= 45) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                scaled.compress(Bitmap.CompressFormat.JPEG, quality, out);
                String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                if (b64.length() <= budget) return b64;
                quality -= 15;
            }
            dim = Math.round(dim * 0.75f);
            quality = 80;
        }
        return "";
    }
}
