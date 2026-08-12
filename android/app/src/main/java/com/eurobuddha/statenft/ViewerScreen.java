package com.eurobuddha.statenft;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.OutputStream;
import java.util.List;

/** Full-screen lot viewer: pinch/double-tap zoom, swipe between lots,
 *  slide-up provenance sheet, share / save-to-Photos. Katalog chrome. */
public final class ViewerScreen {

    public interface Host {
        void onCloseViewer();
        void onTransferItem(StateNft.Item item);
    }

    private ViewerScreen() {}

    public static View build(Activity act, Host host, StateNft.Meta meta,
                             List<StateNft.Item> items, int startIndex) {
        Context c = act;
        FrameLayout root = new FrameLayout(c);
        root.setBackgroundColor(0xFF0D0D0B);
        root.setClickable(true);

        final int[] idx = { Math.max(0, Math.min(startIndex, items.size() - 1)) };

        ZoomImage img = new ZoomImage(c);
        root.addView(img, new FrameLayout.LayoutParams(-1, -1));

        /* top bar */
        LinearLayout top = new LinearLayout(c);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        int p = Design.dp(c, 14);
        top.setPadding(p, Design.dp(c, 10), p, Design.dp(c, 10));
        TextView back = Design.text(c, "‹", 22, 0xFFF2F1EC, Design.sansBold());
        back.setGravity(Gravity.CENTER);
        back.setBackground(Design.ripple(Design.rect(0xB3111111)));
        back.setOnClickListener(v -> host.onCloseViewer());
        top.addView(back, new LinearLayout.LayoutParams(Design.dp(c, 48), Design.dp(c, 48)));
        TextView lotLabel = Design.text(c, "", 12, 0xFFF2F1EC, Design.sansBold());
        lotLabel.setLetterSpacing(0.2f);
        lotLabel.setGravity(Gravity.CENTER);
        top.addView(lotLabel, new LinearLayout.LayoutParams(0, -2, 1));
        TextView info = Design.text(c, "LOT ⓘ", 11, 0xFFF2F1EC, Design.sansBold());
        info.setLetterSpacing(0.12f);
        info.setGravity(Gravity.CENTER);
        info.setBackground(Design.ripple(Design.rect(0xB3111111)));
        info.setPadding(Design.dp(c, 12), 0, Design.dp(c, 12), 0);
        top.addView(info, new LinearLayout.LayoutParams(-2, Design.dp(c, 48)));
        FrameLayout.LayoutParams topLp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        topLp.topMargin = Design.dp(c, 30);
        root.addView(top, topLp);

        /* provenance sheet */
        ScrollView sheetScroll = new ScrollView(c);
        LinearLayout sheet = new LinearLayout(c);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setBackgroundColor(Design.CARD());
        sheet.setPadding(p, Design.dp(c, 4), p, Design.dp(c, 16));
        sheetScroll.addView(sheet, new FrameLayout.LayoutParams(-1, -2));
        FrameLayout.LayoutParams sheetLp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        sheetScroll.setLayoutParams(sheetLp);
        sheetScroll.setVisibility(View.VISIBLE);   // provenance visible on entry — no hidden toggle
        root.addView(sheetScroll);

        info.setOnClickListener(v ->
                sheetScroll.setVisibility(sheetScroll.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));

        Runnable render = () -> {
            StateNft.Item it = items.get(idx[0]);
            lotLabel.setText(String.format(java.util.Locale.US, "LOT %03d / %03d", it.index, Math.max(meta.size, items.size())));
            img.setImageBitmap(Identicon.forToken(meta.tokenid + it.index, 900));
            img.resetZoom();
            if (it.imageUrl != null && !it.imageUrl.isEmpty()) {
                ImageLoader.loadFull(act, it.imageUrl, img);
            }
            buildSheet(act, host, sheet, meta, it);
        };

        img.listener = new ZoomImage.Nav() {
            @Override public void prev() { if (idx[0] > 0) { idx[0]--; render.run(); } }
            @Override public void next() { if (idx[0] < items.size() - 1) { idx[0]++; render.run(); } }
            @Override public void tap() {
                boolean visible = top.getVisibility() == View.VISIBLE;
                top.setVisibility(visible ? View.GONE : View.VISIBLE);
                if (visible) sheetScroll.setVisibility(View.GONE);
            }
        };

        render.run();
        return root;
    }

    private static void buildSheet(Activity act, Host host, LinearLayout sheet,
                                   StateNft.Meta meta, StateNft.Item it) {
        Context c = act;
        sheet.removeAllViews();
        View bar = Design.rule(c, 3);
        sheet.addView(bar);
        sheet.addView(space(c, 10));
        sheet.addView(Design.lot(c, String.format(java.util.Locale.US, "Lot %03d · %s", it.index,
                it.owned ? "in your custody" : (it.coin != null ? "on-chain" : "unseen"))));
        TextView name = Design.display(c, meta.name, 17);
        sheet.addView(name, lp(c, 0, 4, 0, 6));

        /* web-validation shield — asks the node (tokenvalidate) whether the
         *  collection's proof doc names this tokenid; gold "verified" badge when
         *  it does, tap opens the proof. Only a collection that set a validation
         *  URL shows anything here. */
        if (!meta.webvalidate.isEmpty()) {
            final LinearLayout shieldSlot = new LinearLayout(c);
            shieldSlot.setOrientation(LinearLayout.HORIZONTAL);
            shieldSlot.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
            /* client-side check (NFTwallet's WebValidate): does the proof doc name
             *  this tokenid? gold verified badge when it does, muted otherwise. */
            final Runnable paintShield = () -> {
                Boolean v = WebValidate.status(meta.tokenid);
                boolean valid = Boolean.TRUE.equals(v);
                meta.webValid = valid;
                shieldSlot.removeAllViews();
                shieldSlot.addView(shieldBadge(act, valid, meta.webvalidate,
                        valid ? null : (v == null ? "checking…" : "not yet validated")));
            };
            paintShield.run();
            sheet.addView(shieldSlot, lp(c, 0, 0, 0, 8));
            WebValidate.ensure(act, meta.tokenid, meta.webvalidate, paintShield);
        }

        if (!meta.description.isEmpty()) {
            TextView desc = Design.body(c, meta.description);
            sheet.addView(desc, lp(c, 0, 0, 0, 8));
        }

        LinearLayout hashes = new LinearLayout(c);
        hashes.setOrientation(LinearLayout.HORIZONTAL);
        TextView tok = Design.hash(c, "token " + Util.shorten(meta.tokenid));
        copyOnTap(act, tok, meta.tokenid);
        hashes.addView(tok);
        if (it.coin != null) {
            TextView coin = Design.hash(c, "coin " + Util.shorten(it.coin.optString("coinid")));
            copyOnTap(act, coin, it.coin.optString("coinid"));
            hashes.addView(coin, lp(c, 8, 0, 0, 0));
        }
        sheet.addView(hashes, lp(c, 0, 0, 0, 8));

        /* traits: per-lot map for collections, attributes array for single NFTs */
        org.json.JSONArray attrs = meta.itemTraits != null
                ? meta.itemTraits.optJSONArray(String.valueOf(it.index)) : null;
        if (attrs == null) attrs = meta.attributes;
        if (attrs != null && attrs.length() > 0) {
            LinearLayout traitRow = null;
            for (int i = 0; i < attrs.length(); i++) {
                JSONObject a = attrs.optJSONObject(i);
                if (a == null) continue;
                if (i % 3 == 0) {
                    traitRow = new LinearLayout(c);
                    traitRow.setOrientation(LinearLayout.HORIZONTAL);
                    sheet.addView(traitRow, lp(c, 0, 0, 0, 6));
                }
                LinearLayout box = new LinearLayout(c);
                box.setOrientation(LinearLayout.VERTICAL);
                box.setBackground(Design.ruled(c, Design.CARD(), Design.INK(), 1));
                box.setPadding(Design.dp(c, 7), Design.dp(c, 5), Design.dp(c, 7), Design.dp(c, 6));
                TextView tt = Design.text(c, a.optString("trait_type", "").toUpperCase(), 7.5f, Design.DIM(), Design.sansBold());
                tt.setLetterSpacing(0.12f);
                tt.setSingleLine(true);
                box.addView(tt);
                TextView tv = Design.text(c, a.optString("value", ""), 10.5f, Design.INK(), Design.sansBold());
                tv.setSingleLine(true);
                tv.setEllipsize(android.text.TextUtils.TruncateAt.END);
                box.addView(tv);
                LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(0, -2, 1);
                if (i % 3 != 0) blp.leftMargin = Design.dp(c, 6);
                traitRow.addView(box, blp);
            }
            int rem = attrs.length() % 3;
            if (rem != 0 && traitRow != null) {
                for (int i = 0; i < 3 - rem; i++) {
                    View sp = new View(c);
                    LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(0, 1, 1);
                    blp.leftMargin = Design.dp(c, 6);
                    traitRow.addView(sp, blp);
                }
            }
        }

        /* ── links & metadata: every field the StateNFT carries, the URLs
         *    tappable (open in browser), hashes tap-to-copy ── */
        sheet.addView(space(c, 4));
        sheet.addView(sectionLabel(c, "Links"));
        boolean anyLink = false;
        if (!meta.externalUrl.isEmpty())  { sheet.addView(linkRow(act, "External", meta.externalUrl)); anyLink = true; }
        if (!meta.webvalidate.isEmpty())  { sheet.addView(linkRow(act, "Web validate", meta.webvalidate)); anyLink = true; }
        if ("url".equals(meta.mode) && !meta.base.isEmpty())
                                          { sheet.addView(linkRow(act, "Image base", meta.base)); anyLink = true; }
        if (meta.icon.startsWith("http")) { sheet.addView(linkRow(act, "Icon", meta.icon)); anyLink = true; }
        if (!anyLink) sheet.addView(kv(c, "Links", "none set"));

        sheet.addView(space(c, 4));
        sheet.addView(sectionLabel(c, "Details"));
        sheet.addView(kv(c, "Mode", "url".equals(meta.mode) ? "URL-hosted" : "Embedded"));
        if (meta.size > 0) sheet.addView(kv(c, "Editions", String.valueOf(meta.size)));
        if ("url".equals(meta.mode) && !meta.ext.isEmpty()) sheet.addView(kv(c, "File type", meta.ext));
        if (it.coin != null) {
            sheet.addView(kv(c, "State port 0", StateNft.state(it.coin, 0)));
            String s1 = StateNft.state(it.coin, 1);
            sheet.addView(kv(c, "State port 1", s1 == null ? "—" : "embedded image (" + s1.length() + " ch)"));
            sheet.addView(copyKv(act, "Address", it.coin.optString("address")));
        }
        if (!meta.creatorPk.isEmpty()) sheet.addView(copyKv(act, "Creator key", meta.creatorPk));
        if (!meta.creatorAddr.isEmpty()) sheet.addView(copyKv(act, "Creator address", meta.creatorAddr));
        sheet.addView(copyKv(act, "Token id", meta.tokenid));
        sheet.addView(kv(c, "Contract", meta.webvalidate.isEmpty()
                ? "Locked edition" : (meta.webValid ? "Locked · web-verified" : "Locked + web validate")));

        LinearLayout actions = new LinearLayout(c);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        if (it.owned && it.coin != null) {
            TextView tr = Design.button(c, "Transfer", true);
            tr.setOnClickListener(v -> host.onTransferItem(it));
            actions.addView(tr, weight(c, 46));
            actions.addView(space(c, 8), new LinearLayout.LayoutParams(Design.dp(c, 8), 1));
        }
        TextView save = Design.button(c, "Save", false);
        save.setOnClickListener(v -> saveToPhotos(act, meta, it));
        actions.addView(save, weight(c, 46));
        actions.addView(space(c, 8), new LinearLayout.LayoutParams(Design.dp(c, 8), 1));
        TextView share = Design.button(c, "Share", false);
        share.setOnClickListener(v -> shareImage(act, meta, it));
        actions.addView(share, weight(c, 46));
        sheet.addView(actions, lp(c, 0, 10, 0, 0));
    }

    private static void copyOnTap(Activity act, TextView t, String full) {
        t.setClickable(true);
        t.setOnClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("statenft", full));
            Toast.makeText(act, "Copied", Toast.LENGTH_SHORT).show();
        });
    }

    private static LinearLayout kv(Context c, String k, String v) {
        LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, Design.dp(c, 4), 0, Design.dp(c, 4));
        TextView key = Design.text(c, k.toUpperCase(), 9.5f, Design.DIM(), Design.sansBold());
        key.setLetterSpacing(0.14f);
        row.addView(key, new LinearLayout.LayoutParams(0, -2, 1));
        TextView val = Design.text(c, v == null ? "—" : v, 11.5f, Design.INK(), Design.mono());
        val.setGravity(Gravity.END);
        row.addView(val, new LinearLayout.LayoutParams(0, -2, 1.4f));
        return row;
    }

    /** Small uppercase section header inside the provenance sheet. */
    private static TextView sectionLabel(Context c, String s) {
        TextView t = Design.text(c, s.toUpperCase(), 9f, Design.DIM(), Design.sansBold());
        t.setLetterSpacing(0.16f);
        t.setPadding(0, Design.dp(c, 6), 0, Design.dp(c, 2));
        return t;
    }

    /** Open a URL in the browser; assume https:// when no scheme is present. */
    private static void openUrl(Activity act, String url) {
        try {
            String u = url.trim();
            if (!u.matches("(?i)^[a-z][a-z0-9+.-]*://.*")) u = "https://" + u;
            act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
        } catch (Exception e) {
            Toast.makeText(act, "Couldn't open link", Toast.LENGTH_SHORT).show();
        }
    }

    /** kv row whose value is a tappable link (vermilion, underlined) — tap opens
     *  it in the browser, long-press copies the URL. */
    private static LinearLayout linkRow(Activity act, String k, String url) {
        Context c = act;
        LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, Design.dp(c, 5), 0, Design.dp(c, 5));
        TextView key = Design.text(c, k.toUpperCase(), 9.5f, Design.DIM(), Design.sansBold());
        key.setLetterSpacing(0.14f);
        row.addView(key, new LinearLayout.LayoutParams(0, -2, 1));
        TextView val = Design.text(c, url, 11f, Design.ACCENT(), Design.mono());
        val.setGravity(Gravity.END);
        val.setPaintFlags(val.getPaintFlags() | android.graphics.Paint.UNDERLINE_TEXT_FLAG);
        val.setMaxLines(3);
        val.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        val.setClickable(true);
        val.setOnClickListener(v -> openUrl(act, url));
        val.setOnLongClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("statenft", url));
            Toast.makeText(act, "Copied", Toast.LENGTH_SHORT).show();
            return true;
        });
        row.addView(val, new LinearLayout.LayoutParams(0, -2, 1.8f));
        return row;
    }

    /** kv row that shows a shortened hash and copies the full value on tap. */
    private static LinearLayout copyKv(Activity act, String k, String full) {
        LinearLayout row = kv(act, k, Util.shorten(full));
        copyOnTap(act, (TextView) row.getChildAt(1), full);
        return row;
    }

    /** Web-validation badge: gold "verified" chip (tap opens the proof) or a
     *  muted pending/unvalidated state. */
    private static TextView shieldBadge(Activity act, boolean valid, String url, String pendingText) {
        Context c = act;
        int gold = 0xFF9A7B1F;
        String label = valid ? "✓ WEB-VERIFIED"
                : "○ WEB-VALIDATE" + (pendingText == null ? "" : " · " + pendingText);
        TextView t = Design.text(c, label, 9.5f, valid ? gold : Design.DIM(), Design.sansBold());
        t.setLetterSpacing(0.1f);
        t.setPadding(Design.dp(c, 8), Design.dp(c, 5), Design.dp(c, 8), Design.dp(c, 6));
        t.setBackground(Design.ruled(c, Design.CARD(), valid ? gold : Design.SOFT(), valid ? 2 : 1));
        if (valid && url != null && !url.isEmpty()) {
            t.setClickable(true);
            t.setOnClickListener(v -> openUrl(act, url));
        }
        return t;
    }

    private static Bitmap bitmapFor(Activity act, StateNft.Meta meta, StateNft.Item it) {
        if (it.imageUrl != null && !it.imageUrl.isEmpty()) {
            Bitmap b = ImageLoader.decode(act, it.imageUrl, 1800);
            if (b != null) return b;
        }
        return Identicon.forToken(meta.tokenid + it.index, 900);
    }

    private static void saveToPhotos(Activity act, StateNft.Meta meta, StateNft.Item it) {
        new Thread(() -> {
            try {
                Bitmap b = bitmapFor(act, meta, it);
                String name = meta.name.replaceAll("[^A-Za-z0-9]+", "_") + "_" + it.index + ".jpg";
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                if (Build.VERSION.SDK_INT >= 29) {
                    cv.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Atelier");
                }
                Uri uri = act.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IllegalStateException("MediaStore refused");
                try (OutputStream out = act.getContentResolver().openOutputStream(uri)) {
                    b.compress(Bitmap.CompressFormat.JPEG, 95, out);
                }
                act.runOnUiThread(() -> Toast.makeText(act, "Saved to Photos", Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                act.runOnUiThread(() -> Toast.makeText(act, "Could not save image", Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    private static void shareImage(Activity act, StateNft.Meta meta, StateNft.Item it) {
        new Thread(() -> {
            try {
                Bitmap b = bitmapFor(act, meta, it);
                java.io.File dir = new java.io.File(act.getCacheDir(), "shared");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no cache dir");
                java.io.File f = new java.io.File(dir, "lot-" + it.index + ".jpg");
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                    b.compress(Bitmap.CompressFormat.JPEG, 95, out);
                }
                Uri uri = androidx.core.content.FileProvider.getUriForFile(act,
                        act.getPackageName() + ".files", f);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/jpeg");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_TEXT, meta.name + " — Lot " + it.index + " · Minima StateNFT " + meta.tokenid);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                act.runOnUiThread(() -> act.startActivity(Intent.createChooser(send, "Share lot")));
            } catch (Exception e) {
                act.runOnUiThread(() -> Toast.makeText(act, "Could not share image", Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    private static View space(Context c, int h) {
        View v = new View(c);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, Design.dp(c, h)));
        return v;
    }

    private static LinearLayout.LayoutParams lp(Context c, int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.setMargins(Design.dp(c, l), Design.dp(c, t), Design.dp(c, r), Design.dp(c, b));
        return p;
    }

    private static LinearLayout.LayoutParams weight(Context c, int hDp) {
        return new LinearLayout.LayoutParams(0, Design.dp(c, hDp), 1);
    }

    /* ---- matrix zoom ImageView: pinch, pan, double-tap, fling-to-navigate ---- */
    public static class ZoomImage extends androidx.appcompat.widget.AppCompatImageView {
        interface Nav { void prev(); void next(); void tap(); }
        Nav listener;
        private final Matrix matrix = new Matrix();
        private float scale = 1f;
        private final ScaleGestureDetector scaler;
        private final GestureDetector gestures;

        public ZoomImage(Context c) {
            super(c);
            setScaleType(ScaleType.MATRIX);
            scaler = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override public boolean onScale(ScaleGestureDetector d) {
                    float f = d.getScaleFactor();
                    float target = Math.max(1f, Math.min(6f, scale * f));
                    f = target / scale;
                    scale = target;
                    matrix.postScale(f, f, d.getFocusX(), d.getFocusY());
                    fixBounds();
                    setImageMatrix(matrix);
                    return true;
                }
            });
            gestures = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onScroll(MotionEvent a, MotionEvent b, float dx, float dy) {
                    if (scale > 1.01f) {
                        matrix.postTranslate(-dx, -dy);
                        fixBounds();
                        setImageMatrix(matrix);
                    }
                    return true;
                }
                @Override public boolean onFling(MotionEvent a, MotionEvent b, float vx, float vy) {
                    if (scale <= 1.01f && Math.abs(vx) > Math.abs(vy) && Math.abs(vx) > 900 && listener != null) {
                        if (vx < 0) listener.next(); else listener.prev();
                        return true;
                    }
                    return false;
                }
                @Override public boolean onDoubleTap(MotionEvent e) {
                    if (scale > 1.01f) resetZoom();
                    else {
                        float f = 2.5f;
                        scale = f;
                        baseMatrix();
                        matrix.postScale(f, f, e.getX(), e.getY());
                        fixBounds();
                        setImageMatrix(matrix);
                    }
                    return true;
                }
                @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                    if (listener != null) listener.tap();
                    return true;
                }
            });
        }

        @Override public boolean onTouchEvent(MotionEvent ev) {
            scaler.onTouchEvent(ev);
            gestures.onTouchEvent(ev);
            return true;
        }

        @Override public void setImageBitmap(Bitmap bm) {
            super.setImageBitmap(bm);
            post(this::resetZoom);
        }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            super.onSizeChanged(w, h, ow, oh);
            resetZoom();
        }

        void resetZoom() {
            scale = 1f;
            baseMatrix();
            setImageMatrix(matrix);
        }

        private void baseMatrix() {
            matrix.reset();
            if (getDrawable() == null || getWidth() == 0) return;
            float dw = getDrawable().getIntrinsicWidth(), dh = getDrawable().getIntrinsicHeight();
            if (dw <= 0 || dh <= 0) return;
            float s = Math.min(getWidth() / dw, getHeight() / dh);
            float tx = (getWidth() - dw * s) / 2f, ty = (getHeight() - dh * s) / 2f;
            matrix.setScale(s, s);
            matrix.postTranslate(tx, ty);
        }

        private void fixBounds() {
            if (getDrawable() == null) return;
            RectF r = new RectF(0, 0, getDrawable().getIntrinsicWidth(), getDrawable().getIntrinsicHeight());
            matrix.mapRect(r);
            float dx = 0, dy = 0;
            if (r.width() <= getWidth()) dx = (getWidth() - r.width()) / 2f - r.left;
            else if (r.left > 0) dx = -r.left;
            else if (r.right < getWidth()) dx = getWidth() - r.right;
            if (r.height() <= getHeight()) dy = (getHeight() - r.height()) / 2f - r.top;
            else if (r.top > 0) dy = -r.top;
            else if (r.bottom < getHeight()) dy = getHeight() - r.bottom;
            matrix.postTranslate(dx, dy);
        }
    }
}
