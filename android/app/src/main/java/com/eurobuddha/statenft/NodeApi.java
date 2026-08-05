package com.eurobuddha.statenft;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;
import org.minimarex.minimaapi.MinimaAPI;
import org.minimarex.minimaapi.MinimaAPIListener;

/**
 * Hardened Minima Core IPC wrapper adapted from PandaDEX.
 */
public class NodeApi {

    public interface Cb {
        void onResult(JSONObject json);
        void onError(String message);
    }

    public interface PairingListener {
        void onEnabled(boolean enabled);
    }

    public static final String ERR_NOT_ENABLED = "NOT_ENABLED";
    public static final String ERR_TOO_LONG = "TOO_LONG";

    private static final long READ_TIMEOUT_MS = 30000;
    private static final long WRITE_TIMEOUT_MS = 180000;
    private static final int TIMEOUTS_TO_UNPAIR = 3;

    private MinimaAPI mApi;
    private final Handler mMain = new Handler(Looper.getMainLooper());
    private final PairingListener mPairing;
    private final Context mContext;
    private final MinimaAPIListener mRegisterListener;
    private final java.util.HashSet<Runnable> mPending = new java.util.HashSet<>();
    private boolean mReleased = false;
    private Boolean mEnabled = null;
    private long mLastOkMs = 0;
    private int mConsecTimeouts = 0;
    private int mPendingWrites = 0;

    private static long timeoutFor(String command) {
        String c = command == null ? "" : command.trim();
        if (c.startsWith("send") || c.startsWith("consolidate") || c.startsWith("txnsign")
                || c.startsWith("txnpost") || c.startsWith("tokencreate") || c.startsWith("txnbasics")) {
            return WRITE_TIMEOUT_MS;
        }
        return READ_TIMEOUT_MS;
    }

    public NodeApi(Context ctx, PairingListener pairing) {
        mContext = ctx;
        mPairing = pairing;
        mRegisterListener = zResponse -> {
            final boolean enabled = zResponse.optBoolean("enabled", false);
            mMain.post(() -> {
                if (dead()) return;
                noteEnabled(enabled);
            });
        };
        mApi = new MinimaAPI(ctx, mRegisterListener);
    }

    private void noteEnabled(boolean enabled) {
        if (mEnabled != null && mEnabled == enabled) return;
        mEnabled = enabled;
        android.util.Log.d("StateNFT", "pairing -> " + enabled);
        if (mPairing != null) mPairing.onEnabled(enabled);
    }

    public boolean isEnabled() { return mEnabled != null && mEnabled; }
    public long lastOkMs() { return mLastOkMs; }

    public void reRegister() {
        if (mReleased) return;
        if (mPendingWrites > 0) {
            android.util.Log.d("StateNFT", "reREGISTER skipped - write in flight");
            return;
        }
        android.util.Log.d("StateNFT", "reREGISTER");
        try { mApi.onDestroy(); } catch (Exception ignored) {}
        mApi = new MinimaAPI(mContext, mRegisterListener);
    }

    private boolean dead() {
        return mContext instanceof Activity
                && (((Activity) mContext).isFinishing() || ((Activity) mContext).isDestroyed());
    }

    private static boolean isTooLong(JSONObject j) {
        if (j == null || j.optBoolean("status", true)) return false;
        Object r = j.opt("response");
        if (!(r instanceof String)) return false;
        String s = ((String) r).toLowerCase();
        return s.contains("too long") || s.contains("max(256000)");
    }

    public void cmd(String command, Cb cb) {
        cmd(command, timeoutFor(command), cb);
    }

    public void cmd(String command, long timeoutMs, Cb cb) {
        if (mReleased) {
            if (cb != null) mMain.post(() -> cb.onError("Node API released"));
            return;
        }
        final boolean isWrite = timeoutFor(command) == WRITE_TIMEOUT_MS;
        if (isWrite) mPendingWrites++;
        final boolean[] done = {false};
        final Runnable[] ref = new Runnable[1];
        final Runnable timeout = () -> {
            mPending.remove(ref[0]);
            if (done[0]) return;
            done[0] = true;
            if (isWrite) mPendingWrites--;
            if (dead()) return;
            if (mPendingWrites == 0 && ++mConsecTimeouts >= TIMEOUTS_TO_UNPAIR) noteEnabled(false);
            if (cb != null) cb.onError("Minima Core did not respond. Is it installed, running and enabled?");
        };
        ref[0] = timeout;
        mPending.add(timeout);
        mMain.postDelayed(timeout, timeoutMs);

        mApi.Command(command, new MinimaAPIListener() {
            @Override public void response(JSONObject zResponse) {
                mMain.post(() -> {
                    if (done[0]) return;
                    done[0] = true;
                    mMain.removeCallbacks(timeout);
                    mPending.remove(timeout);
                    if (isWrite) mPendingWrites--;
                    mLastOkMs = System.currentTimeMillis();
                    mConsecTimeouts = 0;
                    if (dead()) return;
                    try {
                        if (!zResponse.optBoolean("enabled", true)) {
                            noteEnabled(false);
                            if (cb != null) cb.onError(ERR_NOT_ENABLED);
                            return;
                        }
                        noteEnabled(true);
                        if (isTooLong(zResponse)) {
                            if (cb != null) cb.onError(ERR_TOO_LONG);
                            return;
                        }
                        if (cb != null) cb.onResult(zResponse);
                    } catch (Throwable t) {
                        if (cb != null) {
                            try { cb.onError("Bad node reply"); } catch (Throwable ignored) {}
                        }
                    }
                });
            }
        });
    }

    public void onDestroy() {
        mReleased = true;
        for (Runnable r : mPending) mMain.removeCallbacks(r);
        mPending.clear();
        if (mApi != null) mApi.onDestroy();
    }
}
