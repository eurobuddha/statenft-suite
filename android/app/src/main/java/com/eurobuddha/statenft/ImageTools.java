package com.eurobuddha.statenft;

import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.provider.MediaStore;
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
        src = orient(c, uri, src, raw);
        return compressBitmap(src, budget);
    }

    public static String rotateBase64(String b64, int degrees, int budget) {
        if (b64 == null || b64.isEmpty()) return "";
        try {
            byte[] raw = Base64.decode(b64, Base64.DEFAULT);
            Bitmap src = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (src == null) return "";
            Matrix m = new Matrix();
            m.postRotate(degrees);
            Bitmap out = Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
            if (out != src) src.recycle();
            return compressBitmap(out, budget);
        } catch (Throwable t) {
            return "";
        }
    }

    private static String compressBitmap(Bitmap src, int budget) {
        int dim = 400;
        int quality = 84;
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
            if (scaled != src) scaled.recycle();
            dim = Math.round(dim * 0.75f);
            quality = 84;
        }
        return "";
    }

    private static Bitmap orient(Context c, Uri uri, Bitmap src, byte[] raw) {
        try (InputStream in = new java.io.ByteArrayInputStream(raw)) {
            ExifInterface exif = new ExifInterface(in);
            int o = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            Matrix m = new Matrix();
            switch (o) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    m.postRotate(90);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    m.postRotate(180);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    m.postRotate(270);
                    break;
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                    m.postScale(-1, 1);
                    break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                    m.postScale(1, -1);
                    break;
                case ExifInterface.ORIENTATION_TRANSPOSE:
                    m.postRotate(90);
                    m.postScale(-1, 1);
                    break;
                case ExifInterface.ORIENTATION_TRANSVERSE:
                    m.postRotate(270);
                    m.postScale(-1, 1);
                    break;
                default:
                    int fallback = mediaStoreOrientation(c, uri);
                    if (fallback == 0) return src;
                    m.postRotate(fallback);
            }
            Bitmap out = Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
            if (out != src) src.recycle();
            return out;
        } catch (Exception e) {
            int fallback = mediaStoreOrientation(c, uri);
            if (fallback == 0) return src;
            try {
                Matrix m = new Matrix();
                m.postRotate(fallback);
                Bitmap out = Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
                if (out != src) src.recycle();
                return out;
            } catch (Throwable ignored) {
                return src;
            }
        }
    }

    private static int mediaStoreOrientation(Context c, Uri uri) {
        if (c == null || uri == null) return 0;
        try (Cursor cur = c.getContentResolver().query(uri,
                new String[]{MediaStore.Images.ImageColumns.ORIENTATION},
                null, null, null)) {
            if (cur != null && cur.moveToFirst()) {
                int idx = cur.getColumnIndex(MediaStore.Images.ImageColumns.ORIENTATION);
                if (idx >= 0) {
                    int deg = cur.getInt(idx);
                    if (deg == 90 || deg == 180 || deg == 270) return deg;
                }
            }
        } catch (Throwable ignored) {}
        return 0;
    }
}
