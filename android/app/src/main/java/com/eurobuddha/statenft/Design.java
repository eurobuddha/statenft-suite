package com.eurobuddha.statenft;

import android.animation.ObjectAnimator;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.TextView;

import androidx.core.content.res.ResourcesCompat;

public final class Design {
    private static Typeface sSans, sMono, sDisplay;

    private Design() {}

    public static void load(Context c) {
        if (sSans == null) { try { sSans = ResourcesCompat.getFont(c, R.font.inter); } catch (Exception ignored) {} }
        if (sMono == null) { try { sMono = ResourcesCompat.getFont(c, R.font.jetbrains_mono); } catch (Exception ignored) {} }
        if (sDisplay == null) sDisplay = Typeface.create("serif", Typeface.NORMAL);
    }

    public static int BG() { return 0xFFF4F1EA; }
    public static int PAPER() { return 0xFFFCFAF6; }
    public static int INK() { return 0xFF0A0A0B; }
    public static int GRAPHITE() { return 0xFF2B2B2F; }
    public static int DIM() { return 0xFF6F6B63; }
    public static int RAIL() { return 0xFFD6D0C5; }
    public static int RAIL_DARK() { return 0xFFAAA194; }
    public static int ACCENT() { return 0xFFE9562B; }
    public static int RED() { return 0xFFB3261E; }
    public static int GOOD() { return 0xFF187761; }

    public static Typeface sans() { return sSans != null ? sSans : Typeface.SANS_SERIF; }
    public static Typeface sansBold() { return Typeface.create(sans(), Typeface.BOLD); }
    public static Typeface mono() { return sMono != null ? sMono : Typeface.MONOSPACE; }
    public static Typeface monoBold() { return Typeface.create(mono(), Typeface.BOLD); }
    public static Typeface display() { return sDisplay != null ? sDisplay : Typeface.SERIF; }

    public static int dp(Context c, int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    public static GradientDrawable rect(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(0);
        return d;
    }

    public static GradientDrawable stroke(int fill, int stroke) {
        GradientDrawable d = rect(fill);
        d.setStroke(1, stroke);
        return d;
    }

    public static GradientDrawable lineButton(Context c, boolean filled) {
        GradientDrawable d = rect(filled ? INK() : PAPER());
        d.setStroke(Math.max(1, dp(c, 1)), filled ? INK() : INK());
        return d;
    }

    public static RippleDrawable ripple(GradientDrawable base) {
        return new RippleDrawable(ColorStateList.valueOf(0x1AE9562B), base, null);
    }

    public static TextView chip(Context c, String text, int ink, int border) {
        TextView t = new TextView(c);
        t.setText(text);
        t.setTextColor(ink);
        t.setTextSize(10.5f);
        t.setTypeface(monoBold());
        t.setGravity(Gravity.CENTER);
        t.setAllCaps(false);
        int x = dp(c, 8), y = dp(c, 5);
        t.setPadding(x, y, x, y);
        t.setBackground(stroke(0x00FFFFFF, border));
        return t;
    }

    public static void pressable(final View v) {
        v.setOnTouchListener((view, ev) -> {
            switch (ev.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    view.animate().scaleX(0.985f).scaleY(0.985f).setDuration(80).start();
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    view.animate().scaleX(1f).scaleY(1f).setDuration(110).start();
                    break;
            }
            return false;
        });
    }

    public static void reveal(View v, long delayMs) {
        v.setAlpha(0f);
        v.setTranslationY(dp(v.getContext(), 12));
        v.animate().alpha(1f).translationY(0f).setStartDelay(delayMs).setDuration(260).start();
    }

    public static void pulse(View v) {
        ObjectAnimator a = ObjectAnimator.ofFloat(v, "alpha", 0.35f, 1f);
        a.setDuration(420);
        a.start();
    }
}
