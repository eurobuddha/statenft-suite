package com.eurobuddha.statenft;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The engine's real home. The MiniDapp completes mints because engine.js
 * lives in the node's service context, ticking on every block — this
 * foreground service gives the Android engine the same lifetime. It runs
 * whenever any collection is in an active phase (or an airdrop is armed),
 * shows live progress in its notification, and stops itself when idle.
 */
public class MintService extends Service {

    private static final String CHANNEL = "mint_engine";
    private static final int NOTE_ID = 41;
    private static final long TICK_MS = 25000;

    private NodeApi node;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int idleTicks = 0;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!hasWork(MintService.this)) {
                if (++idleTicks >= 2) { stopSelf(); return; }
            } else {
                idleTicks = 0;
            }
            if (node != null && node.isEnabled()) {
                MintEngine.tick(MintService.this, node, msg -> {
                    LocalStore.recordHeartbeat(MintService.this, msg);
                    updateNotification();
                });
                AirdropEngine.tick(MintService.this, node, msg -> {
                    LocalStore.recordHeartbeat(MintService.this, msg);
                    updateNotification();
                });
            } else if (node != null) {
                node.reRegister();
            }
            handler.postDelayed(this, TICK_MS);
        }
    };

    /** Start (or poke) the engine — call after create/resume/recovery/airdrop-arm. */
    public static void kick(Context c) {
        if (!hasWork(c)) return;
        Intent i = new Intent(c, MintService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception ignored) {
            // background-start restrictions: the in-app loop still covers foreground use
        }
    }

    static boolean hasWork(Context c) {
        JSONArray rows = LocalStore.load(c);
        for (int i = 0; i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            if (r == null) continue;
            String p = r.optString("phase", "DONE");
            if ("CREATE".equals(p) || "MOVE".equals(p) || "SPLIT".equals(p)
                    || "STAMP".equals(p) || "NEEDIMAGES".equals(p)) return true;
        }
        JSONObject idx = LocalStore.loadDraft(c, "airdrop_index");
        return idx != null && idx.length() > 0;
    }

    @Override public void onCreate() {
        super.onCreate();
        Design.load(this);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Mint engine",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Live progress while collections seal on-chain");
            nm.createNotificationChannel(ch);
        }
        // If the OS refuses foreground promotion, bail gracefully rather than
        // crash-looping the whole app on every launch that kicks the engine —
        // the mint resumes on the next successful start.
        if (!startForegroundCompat()) { stopSelf(); return; }
        node = new NodeApi(this, enabled -> { if (enabled) handler.post(tick); });
        handler.postDelayed(tick, 4000);
    }

    private boolean startForegroundCompat() {
        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                // specialUse, not dataSync: Android 14 caps dataSync at ~6h/day
                // and then CRASHES the service. A mint legitimately runs long.
                startForeground(NOTE_ID, n,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTE_ID, n,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTE_ID, n);
            }
            return true;
        } catch (Exception e) {
            return false;   // ForegroundServiceStartNotAllowedException etc. — never crash
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        idleTicks = 0;
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, 1500);
        return START_STICKY;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(tick);
        if (node != null) node.onDestroy();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void updateNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTE_ID, buildNotification());
    }

    private Notification buildNotification() {
        String title = "Atelier — mint engine";
        String text = "Watching the chain…";
        JSONArray rows = LocalStore.load(this);
        for (int i = 0; i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            if (r == null) continue;
            String p = r.optString("phase", "DONE");
            if ("CREATE".equals(p) || "MOVE".equals(p) || "SPLIT".equals(p) || "STAMP".equals(p)) {
                text = "Sealing “" + r.optString("name", "collection") + "” — "
                        + r.optInt("minted", 0) + "/" + r.optInt("size", 0)
                        + " · " + p.toLowerCase();
                break;
            }
            if ("NEEDIMAGES".equals(p)) {
                text = "“" + r.optString("name", "collection") + "” needs images to continue";
                break;
            }
        }
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return b.setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_launcher_monochrome)
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }
}
