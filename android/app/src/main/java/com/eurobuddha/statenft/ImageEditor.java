package com.eurobuddha.statenft;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.Base64;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

/**
 * The plate room — edit before sealing. Crop by pan/zoom inside an aspect
 * frame, rotate, tone sliders, one-tap looks. Pure Canvas/ColorMatrix.
 * A bad crop is otherwise locked on-chain forever.
 */
public final class ImageEditor {

    public interface Done { void edited(String b64); }

    private ImageEditor() {}

    /** Build the full-screen editor overlay. b64 = source JPEG (already decoded upright). */
    public static View build(Activity act, String b64, int budget, Runnable onClose, Done done) {
        Context c = act;
        byte[] raw;
        Bitmap srcTry;
        try {
            raw = Base64.decode(b64, Base64.DEFAULT);
            srcTry = BitmapFactory.decodeByteArray(raw, 0, raw.length);
        } catch (Throwable t) { srcTry = null; }
        final Bitmap[] src = { srcTry };

        FrameLayout root = new FrameLayout(c);
        root.setBackgroundColor(0xFF0D0D0B);
        root.setClickable(true);
        if (src[0] == null) { onClose.run(); return root; }

        LinearLayout col = new LinearLayout(c);
        col.setOrientation(LinearLayout.VERTICAL);
        root.addView(col, new FrameLayout.LayoutParams(-1, -1));

        /* top bar */
        LinearLayout top = new LinearLayout(c);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(Design.dp(c, 14), Design.dp(c, 40), Design.dp(c, 14), Design.dp(c, 8));
        TextView cancel = chipBtn(c, "Cancel");
        cancel.setOnClickListener(v -> onClose.run());
        top.addView(cancel, new LinearLayout.LayoutParams(-2, Design.dp(c, 40)));
        TextView title = Design.text(c, "THE PLATE ROOM", 12, 0xFFF2F1EC, Design.sansBold());
        title.setLetterSpacing(0.2f);
        title.setGravity(Gravity.CENTER);
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        TextView apply = Design.text(c, "SEAL CROP", 11, 0xFF0D0D0B, Design.sansBold());
        apply.setLetterSpacing(0.12f);
        apply.setGravity(Gravity.CENTER);
        apply.setBackground(Design.ripple(Design.rect(0xFFE63312)));
        apply.setPadding(Design.dp(c, 14), 0, Design.dp(c, 14), 0);
        apply.setTextColor(0xFFFFFFFF);
        top.addView(apply, new LinearLayout.LayoutParams(-2, Design.dp(c, 40)));
        col.addView(top);

        /* crop stage */
        CropStage stage = new CropStage(c);
        stage.setBitmap(src[0]);
        col.addView(stage, new LinearLayout.LayoutParams(-1, 0, 1));

        /* controls */
        LinearLayout controls = new LinearLayout(c);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setBackgroundColor(0xFF161614);
        controls.setPadding(Design.dp(c, 14), Design.dp(c, 10), Design.dp(c, 14), Design.dp(c, 18));
        col.addView(controls, new LinearLayout.LayoutParams(-1, -2));

        /* aspect + rotate row */
        LinearLayout row1 = new LinearLayout(c);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        TextView a11 = chipBtn(c, "1 : 1");
        TextView a45 = chipBtn(c, "4 : 5");
        TextView aFree = chipBtn(c, "Free");
        TextView rot = chipBtn(c, "⟳ 90°");
        selectChip(a11, true); selectChip(a45, false); selectChip(aFree, false);
        a11.setOnClickListener(v -> { stage.setAspect(1f); selectChip(a11, true); selectChip(a45, false); selectChip(aFree, false); });
        a45.setOnClickListener(v -> { stage.setAspect(0.8f); selectChip(a11, false); selectChip(a45, true); selectChip(aFree, false); });
        aFree.setOnClickListener(v -> { stage.setAspect(0f); selectChip(a11, false); selectChip(a45, false); selectChip(aFree, true); });
        rot.setOnClickListener(v -> {
            Matrix m = new Matrix();
            m.postRotate(90);
            Bitmap r = Bitmap.createBitmap(src[0], 0, 0, src[0].getWidth(), src[0].getHeight(), m, true);
            if (r != src[0]) src[0].recycle();
            src[0] = r;
            stage.setBitmap(src[0]);
        });
        LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(0, Design.dp(c, 38), 1);
        LinearLayout.LayoutParams cl2 = new LinearLayout.LayoutParams(0, Design.dp(c, 38), 1);
        cl2.leftMargin = Design.dp(c, 6);
        row1.addView(a11, cl);
        row1.addView(a45, cl2);
        LinearLayout.LayoutParams cl3 = new LinearLayout.LayoutParams(0, Design.dp(c, 38), 1);
        cl3.leftMargin = Design.dp(c, 6);
        row1.addView(aFree, cl3);
        LinearLayout.LayoutParams cl4 = new LinearLayout.LayoutParams(0, Design.dp(c, 38), 1);
        cl4.leftMargin = Design.dp(c, 6);
        row1.addView(rot, cl4);
        controls.addView(row1);

        /* looks row */
        LinearLayout row2 = new LinearLayout(c);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        String[][] looks = {{"None", ""}, {"Noir", "noir"}, {"Vivid", "vivid"}, {"Warm", "warm"}, {"Fade", "fade"}};
        final TextView[] lookChips = new TextView[looks.length];
        for (int i = 0; i < looks.length; i++) {
            final int idx = i;
            TextView lk = chipBtn(c, looks[i][0]);
            lookChips[i] = lk;
            selectChip(lk, i == 0);
            final String key = looks[i][1];
            lk.setOnClickListener(v -> {
                for (int j = 0; j < lookChips.length; j++) selectChip(lookChips[j], j == idx);
                stage.look = key;
                stage.applyFilter();
            });
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, Design.dp(c, 34), 1);
            if (i > 0) p.leftMargin = Design.dp(c, 6);
            row2.addView(lk, p);
        }
        LinearLayout.LayoutParams row2lp = new LinearLayout.LayoutParams(-1, -2);
        row2lp.topMargin = Design.dp(c, 10);
        controls.addView(row2, row2lp);

        /* sliders */
        controls.addView(slider(c, "Bright", 50, v -> { stage.brightness = (v - 50) / 50f; stage.applyFilter(); }));
        controls.addView(slider(c, "Contrast", 50, v -> { stage.contrast = 1f + (v - 50) / 100f; stage.applyFilter(); }));
        controls.addView(slider(c, "Colour", 50, v -> { stage.saturation = v / 50f; stage.applyFilter(); }));

        apply.setOnClickListener(v -> {
            Bitmap out = stage.render(1440);
            if (out == null) { onClose.run(); return; }
            String enc = compress(out, budget);
            if (enc.isEmpty()) { onClose.run(); return; }
            done.edited(enc);
        });

        return root;
    }

    private static String compress(Bitmap out, int budget) {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, 95, bos);
        String b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
        return ImageTools.recompressBase64(b64, budget);
    }

    private static TextView chipBtn(Context c, String s) {
        TextView t = Design.text(c, s.toUpperCase(), 10, 0xFFF2F1EC, Design.sansBold());
        t.setLetterSpacing(0.1f);
        t.setGravity(Gravity.CENTER);
        t.setBackground(Design.ripple(strokeDark(c)));
        t.setClickable(true);
        return t;
    }

    private static android.graphics.drawable.GradientDrawable strokeDark(Context c) {
        android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
        d.setColor(0x00000000);
        d.setStroke(Math.max(2, Design.dp(c, 1)), 0xFF4A4A46);
        return d;
    }

    private static void selectChip(TextView t, boolean on) {
        if (on) {
            t.setTextColor(0xFF0D0D0B);
            android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
            d.setColor(0xFFF2F1EC);
            t.setBackground(Design.ripple(d));
        } else {
            t.setTextColor(0xFFF2F1EC);
            t.setBackground(Design.ripple(strokeDark(t.getContext())));
        }
    }

    private static View slider(Context c, String label, int start, java.util.function.IntConsumer onChange) {
        LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(-1, -2);
        rlp.topMargin = Design.dp(c, 8);
        row.setLayoutParams(rlp);
        TextView l = Design.text(c, label.toUpperCase(), 9, 0xFF9A9A94, Design.sansBold());
        l.setLetterSpacing(0.14f);
        row.addView(l, new LinearLayout.LayoutParams(Design.dp(c, 70), -2));
        SeekBar sb = new SeekBar(c);
        sb.setMax(100);
        sb.setProgress(start);
        sb.getProgressDrawable().setTint(0xFFE63312);
        sb.getThumb().setTint(0xFFF2F1EC);
        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) { if (fromUser) onChange.accept(p); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        row.addView(sb, new LinearLayout.LayoutParams(0, -2, 1));
        return row;
    }

    /* ---- crop stage: pan/zoom bitmap under a fixed aspect frame ---- */
    static class CropStage extends View {
        private Bitmap bmp;
        private final Matrix matrix = new Matrix();
        private float scale = 1f, minScale = 1f;
        private float aspect = 1f;   // frame w/h ratio as width/height; 0 = free (full image)
        String look = "";
        float brightness = 0f, contrast = 1f, saturation = 1f;
        private final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
        private final Paint scrim = new Paint();
        private final Paint frame = new Paint();
        private final RectF cropRect = new RectF();
        private final ScaleGestureDetector scaler;
        private float lastX, lastY;
        private boolean dragging = false;

        CropStage(Context c) {
            super(c);
            scrim.setColor(0xB30D0D0B);
            frame.setStyle(Paint.Style.STROKE);
            frame.setStrokeWidth(Design.dp(c, 2));
            frame.setColor(0xFFF2F1EC);
            scaler = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override public boolean onScale(ScaleGestureDetector d) {
                    float f = d.getScaleFactor();
                    float target = Math.max(minScale, Math.min(minScale * 8f, scale * f));
                    f = target / scale;
                    scale = target;
                    matrix.postScale(f, f, d.getFocusX(), d.getFocusY());
                    clamp();
                    invalidate();
                    return true;
                }
            });
        }

        void setBitmap(Bitmap b) {
            bmp = b;
            if (getWidth() > 0) reset();
            invalidate();
        }

        void setAspect(float a) {
            aspect = a;
            computeCrop();
            reset();
            invalidate();
        }

        void applyFilter() {
            ColorMatrix cm = new ColorMatrix();
            cm.setSaturation("noir".equals(look) ? 0f : saturation * ("vivid".equals(look) ? 1.35f : 1f));
            float ctr = contrast * ("vivid".equals(look) ? 1.08f : "fade".equals(look) ? 0.9f : 1f);
            float bri = brightness * 255f + ("fade".equals(look) ? 14f : 0f);
            float t = (1f - ctr) * 128f + bri;
            ColorMatrix cb = new ColorMatrix(new float[]{
                    ctr, 0, 0, 0, t,
                    0, ctr, 0, 0, t,
                    0, 0, ctr, 0, t,
                    0, 0, 0, 1, 0});
            cm.postConcat(cb);
            if ("warm".equals(look)) {
                cm.postConcat(new ColorMatrix(new float[]{
                        1.06f, 0, 0, 0, 6,
                        0, 1.01f, 0, 0, 2,
                        0, 0, 0.94f, 0, -6,
                        0, 0, 0, 1, 0}));
            }
            paint.setColorFilter(new ColorMatrixColorFilter(cm));
            invalidate();
        }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            super.onSizeChanged(w, h, ow, oh);
            computeCrop();
            reset();
        }

        private void computeCrop() {
            int w = getWidth(), h = getHeight();
            if (w == 0 || h == 0) return;
            int pad = Design.dp(getContext(), 18);
            float availW = w - pad * 2, availH = h - pad * 2;
            float a = aspect;
            if (a <= 0f && bmp != null) a = bmp.getWidth() / (float) bmp.getHeight();
            if (a <= 0f) a = 1f;
            float cw = availW, ch = cw / a;
            if (ch > availH) { ch = availH; cw = ch * a; }
            cropRect.set((w - cw) / 2f, (h - ch) / 2f, (w + cw) / 2f, (h + ch) / 2f);
        }

        private void reset() {
            if (bmp == null || cropRect.isEmpty()) return;
            minScale = Math.max(cropRect.width() / bmp.getWidth(), cropRect.height() / bmp.getHeight());
            scale = minScale;
            matrix.reset();
            matrix.setScale(scale, scale);
            float bw = bmp.getWidth() * scale, bh = bmp.getHeight() * scale;
            matrix.postTranslate(cropRect.centerX() - bw / 2f, cropRect.centerY() - bh / 2f);
            clamp();
        }

        private void clamp() {
            if (bmp == null) return;
            RectF r = new RectF(0, 0, bmp.getWidth(), bmp.getHeight());
            matrix.mapRect(r);
            float dx = 0, dy = 0;
            if (r.left > cropRect.left) dx = cropRect.left - r.left;
            if (r.right < cropRect.right) dx = cropRect.right - r.right;
            if (r.top > cropRect.top) dy = cropRect.top - r.top;
            if (r.bottom < cropRect.bottom) dy = cropRect.bottom - r.bottom;
            matrix.postTranslate(dx, dy);
        }

        @Override public boolean onTouchEvent(MotionEvent ev) {
            scaler.onTouchEvent(ev);
            switch (ev.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    lastX = ev.getX(); lastY = ev.getY(); dragging = true; break;
                case MotionEvent.ACTION_MOVE:
                    if (dragging && !scaler.isInProgress()) {
                        matrix.postTranslate(ev.getX() - lastX, ev.getY() - lastY);
                        clamp();
                        invalidate();
                    }
                    lastX = ev.getX(); lastY = ev.getY();
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    dragging = false; break;
            }
            return true;
        }

        @Override protected void onDraw(Canvas cv) {
            super.onDraw(cv);
            if (bmp == null) return;
            cv.drawBitmap(bmp, matrix, paint);
            // scrim outside the crop frame
            cv.drawRect(0, 0, getWidth(), cropRect.top, scrim);
            cv.drawRect(0, cropRect.bottom, getWidth(), getHeight(), scrim);
            cv.drawRect(0, cropRect.top, cropRect.left, cropRect.bottom, scrim);
            cv.drawRect(cropRect.right, cropRect.top, getWidth(), cropRect.bottom, scrim);
            cv.drawRect(cropRect, frame);
            // thirds
            Paint thirds = new Paint(frame);
            thirds.setStrokeWidth(Design.dp(getContext(), 1));
            thirds.setAlpha(110);
            for (int i = 1; i <= 2; i++) {
                float x = cropRect.left + cropRect.width() * i / 3f;
                float y = cropRect.top + cropRect.height() * i / 3f;
                cv.drawLine(x, cropRect.top, x, cropRect.bottom, thirds);
                cv.drawLine(cropRect.left, y, cropRect.right, y, thirds);
            }
        }

        /** Render the crop region with the active filter at up to maxPx long edge. */
        Bitmap render(int maxPx) {
            if (bmp == null || cropRect.isEmpty()) return null;
            // visible crop in bitmap coordinates
            Matrix inv = new Matrix();
            if (!matrix.invert(inv)) return null;
            RectF srcR = new RectF(cropRect);
            inv.mapRect(srcR);
            srcR.intersect(0, 0, bmp.getWidth(), bmp.getHeight());
            if (srcR.width() < 4 || srcR.height() < 4) return null;
            float a = srcR.width() / srcR.height();
            int ow, oh;
            if (a >= 1f) { ow = Math.min(maxPx, Math.round(srcR.width())); oh = Math.round(ow / a); }
            else { oh = Math.min(maxPx, Math.round(srcR.height())); ow = Math.round(oh * a); }
            if (ow < 1 || oh < 1) return null;
            Bitmap out = Bitmap.createBitmap(ow, oh, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(out);
            cv.drawColor(Color.BLACK);
            Matrix draw = new Matrix();
            draw.setRectToRect(srcR, new RectF(0, 0, ow, oh), Matrix.ScaleToFit.FILL);
            cv.drawBitmap(bmp, draw, paint);
            return out;
        }
    }
}
