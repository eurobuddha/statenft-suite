package com.eurobuddha.statenft;

import android.content.Context;
import android.graphics.Bitmap;

import java.io.InputStream;
import java.nio.FloatBuffer;
import java.util.Collections;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * On-device AI cartoonizer for the generative photo pack — the same
 * AnimeGAN model (assets/facepaint.onnx) the MiniDapp runs in wasm, here on
 * native onnxruntime. The photo never leaves the device. Every failure path
 * returns null: the caller falls back to the direct quantize+trace, exactly
 * like the MiniDapp's fallback.
 */
public final class AiCartoon {

    private static final int N = 512;
    private static OrtEnvironment sEnv;
    private static OrtSession sSession;
    private static boolean sFailed = false;

    private AiCartoon() {}

    private static synchronized OrtSession session(Context c) {
        if (sSession != null || sFailed) return sSession;
        try {
            sEnv = OrtEnvironment.getEnvironment();
            byte[] model;
            try (InputStream in = c.getAssets().open("facepaint.onnx");
                 java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream()) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                model = bos.toByteArray();
            }
            sSession = sEnv.createSession(model, new OrtSession.SessionOptions());
        } catch (Throwable t) {
            sFailed = true;
            LocalStore.logEvent(c, "AI cartoonizer unavailable: " + t.getClass().getSimpleName());
        }
        return sSession;
    }

    /** 512x512 bitmap in, cartoonized 512x512 bitmap out; null = use fallback. */
    public static Bitmap cartoonize(Context c, Bitmap src512) {
        OrtSession s = session(c);
        if (s == null || src512 == null) return null;
        try {
            Bitmap in = src512.getWidth() == N && src512.getHeight() == N
                    ? src512 : Bitmap.createScaledBitmap(src512, N, N, true);
            int px = N * N;
            int[] argb = new int[px];
            in.getPixels(argb, 0, N, 0, 0, N, N);
            float[] chw = new float[3 * px];
            for (int i = 0; i < px; i++) {
                int p = argb[i];
                chw[i] = ((p >> 16) & 255) / 127.5f - 1f;
                chw[px + i] = ((p >> 8) & 255) / 127.5f - 1f;
                chw[2 * px + i] = (p & 255) / 127.5f - 1f;
            }
            try (OnnxTensor t = OnnxTensor.createTensor(sEnv, FloatBuffer.wrap(chw),
                         new long[]{1, 3, N, N});
                 OrtSession.Result res = s.run(Collections.singletonMap("input", t))) {
                float[][][][] out = (float[][][][]) res.get(0).getValue();
                int[] outPx = new int[px];
                for (int y = 0; y < N; y++) {
                    for (int x = 0; x < N; x++) {
                        int r = clamp((out[0][0][y][x] + 1f) * 127.5f);
                        int g = clamp((out[0][1][y][x] + 1f) * 127.5f);
                        int b = clamp((out[0][2][y][x] + 1f) * 127.5f);
                        outPx[y * N + x] = 0xFF000000 | (r << 16) | (g << 8) | b;
                    }
                }
                return Bitmap.createBitmap(outPx, N, N, Bitmap.Config.ARGB_8888);
            }
        } catch (Throwable t) {
            return null;
        }
    }

    private static int clamp(float v) {
        int i = Math.round(v);
        return i < 0 ? 0 : Math.min(i, 255);
    }
}
