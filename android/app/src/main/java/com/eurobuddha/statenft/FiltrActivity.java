package com.eurobuddha.statenft;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * FILTR on Android: the same editor the MiniDapp ships (assets/filtr — the
 * engine bundle, tab UI and styles are byte-identical copies, parity-gated),
 * hosted in a WebView with three native bridges: save to Photos, send the
 * flattened image to the Single-NFT wizard, send it to the Photo Cartoon
 * pack. MainActivity consumes the pending handoffs in onResume.
 */
public class FiltrActivity extends Activity {

    /** Handoffs for MainActivity (b64, no data: prefix). */
    static volatile String pendingMint = null;
    static volatile String pendingPhoto = null;

    private ValueCallback<Uri[]> filePick;

    @SuppressLint("SetJavaScriptEnabled")
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                                       FileChooserParams params) {
                if (filePick != null) filePick.onReceiveValue(null);
                filePick = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.setType("image/*");
                startActivityForResult(Intent.createChooser(i, "Choose image"), 7101);
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidFiltr");
        web.loadUrl("file:///android_asset/filtr/filtr.html");
        setContentView(web);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != 7101 || filePick == null) return;
        Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
        filePick.onReceiveValue(uri == null ? null : new Uri[]{uri});
        filePick = null;
    }

    private class Bridge {
        @JavascriptInterface public void toastMsg(String m) {
            runOnUiThread(() -> Toast.makeText(FiltrActivity.this, m, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface public void saveImage(String name, String b64) {
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                boolean png = name != null && name.toLowerCase().endsWith(".png");
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME,
                        name == null || name.isEmpty() ? "filtr.png" : name);
                cv.put(MediaStore.Images.Media.MIME_TYPE, png ? "image/png" : "image/jpeg");
                if (Build.VERSION.SDK_INT >= 29) {
                    cv.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Atelier");
                }
                Uri uri = getContentResolver()
                        .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IllegalStateException("MediaStore refused");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    out.write(bytes);
                }
                toastMsg("Saved to Photos");
            } catch (Exception e) {
                toastMsg("Could not save image");
            }
        }

        @JavascriptInterface public void sendToMint(String b64) {
            pendingMint = b64;
            runOnUiThread(FiltrActivity.this::finish);
        }

        @JavascriptInterface public void sendToPhoto(String b64) {
            pendingPhoto = b64;
            runOnUiThread(FiltrActivity.this::finish);
        }
    }
}
