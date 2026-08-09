package com.eurobuddha.statenft;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;

/**
 * Atelier — the Minima NFT creation studio. Katalog design language:
 * paper, ink rules, vermilion stamps, numbered lots, zero rounding.
 */
public class MainActivity extends AppCompatActivity implements ViewerScreen.Host {

    private enum Screen { LAUNCH, GALLERY, COLLECTION, STUDIO, CREATE_COLLECTION, CREATE_NFT, CREATE_TOKEN, CREATE_GENERATIVE, AIRDROP, TRANSFER, BURY, MANAGE, SCAN, ENGINE_LOG }

    private static final int PICK_CREATE = 1;
    private static final int PICK_RECOVERY = 2;
    private static final int PICK_NFT = 3;
    private static final int PICK_TOKICON = 5;
    private static final int PICK_COLLICON = 6;
    private static final int PICK_ARTPHOTO = 7;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayList<StateNft.Meta> collections = new ArrayList<>();
    private final ArrayList<StateNft.Meta> scanFound = new ArrayList<>();
    private final ArrayList<JSONObject> nftRows = new ArrayList<>();
    private final ArrayList<JSONObject> tokenRows = new ArrayList<>();

    private NodeApi node;
    private Screen screen = Screen.GALLERY;
    private Runnable backAction;
    private String galleryFilter = "all";
    private String lastGallerySig = "";
    private String lastDetailSig = "";
    private boolean detailPartial = false;
    private int lastTip = 0;
    private final ArrayList<Runnable> departureWatchers = new ArrayList<>();

    /* chrome */
    private FrameLayout rootFrame;
    private LinearLayout appbarBox;
    private ScrollView content;
    private LinearLayout body;
    private LinearLayout navBox;
    private FrameLayout overlay;
    private TextView nodeDot;
    private TextView inlineStatus;
    private int insetTop = 0, insetBottom = 0;

    /* open collection */
    private StateNft.Meta openMeta;
    private JSONArray openOwned = new JSONArray();
    private JSONArray openAll = new JSONArray();
    private StateNft.Item transferItem;

    /* collection create draft */
    private String createMode = "url";
    private String createName = "", createDesc = "", createSize = "12";
    private String createBase = "", createExt = ".png", createIcon = "", createExternal = "", createWeb = "";
    private String[] createImages = new String[0];
    private int pendingImageIndex = -1;
    private boolean pendingBatchImages = false;
    private int pendingPickContext = PICK_CREATE;
    private long pendingRecoveryId = 0;

    /* nft create draft */
    private String nftName = "", nftDesc = "", nftOwner = "", nftExternal = "", nftWeb = "", nftUrl = "", nftEditions = "1";
    private String nftImage = "";
    private boolean nftEmbed = true;
    private boolean nftSign = true;
    private boolean nftBusy = false;
    private final ArrayList<String[]> nftTraits = new ArrayList<>();
    private String traitTypeDraft = "", traitValueDraft = "";

    /* token create draft */
    private String tokName = "", tokTicker = "", tokSupply = "1000000", tokDecimals = "0", tokDesc = "", tokUrl = "";
    private String tokIcon = "";        // embedded wallet icon (b64, ICON_BUDGET)
    private String createIconB64 = ""; // embedded collection icon (b64, ICON_BUDGET)
    private boolean tokBusy = false;
    private final ArrayList<String[]> tokPairs = new ArrayList<>();
    private String pairKeyDraft = "", pairValueDraft = "";

    /* generative studio (artBox packs via ArtStudio bridge) */
    private static final int ART_EMBED_BUDGET = 16000; // b64 chars per SVG — STATE_IMG_BUDGET's
                                                       // transfer-proven envelope (rides twice per
                                                       // transfer under the 64KB TxPoW). The 18
                                                       // generative packs stay tuned+tested at
                                                       // 8192; the photo pack uses the headroom.
    private static org.json.JSONArray ART_STYLE_LIST;  // [{key,label}] from art.js, cached for the process
    private static final java.util.HashMap<String, android.graphics.Bitmap> ART_THUMBS = new java.util.HashMap<>();
    private String artStyle = "mandala";
    private String artSeed = "atelier-genesis";
    private final java.util.HashMap<String, JSONObject> artCfgs = new java.util.HashMap<>();
    private final java.util.HashSet<String> artOpenSlots = new java.util.HashSet<>();
    private JSONArray artItems = new JSONArray();
    private boolean artPhotoLoaded = false;  // mirrors ART_PHOTO_SRC in the bridge WebView
    private final java.util.HashSet<String> artMigrated = new java.util.HashSet<>();
    private final ArrayList<android.graphics.Bitmap> artPreviews = new ArrayList<>();
    private LinearLayout artSheetBox;                  // proof sheet + send button, hidden when stale
    private final Runnable artSaveRunnable = this::artSaveDraft;  // debounced: seed keystrokes
    private boolean artDraftLoaded = false;
    private String genCount = "12";
    private boolean genBusy = false;
    private JSONObject collectionItemTraits = null;

    /* UI refresh only — the ENGINE lives in MintService (foreground service),
     * so mints continue with the screen off. Running a second engine here
     * would race the service's planner. */
    private final Runnable mintLoop = new Runnable() {
        @Override public void run() {
            MintService.kick(MainActivity.this);
            if (screen == Screen.COLLECTION && openMeta != null && activeMint(openMeta)) {
                loadLocalCollections();
                openMeta = findCollectionByLocalId(openMeta.localId, openMeta);
                refreshDetail();
            }
            if (screen == Screen.ENGINE_LOG) renderEngineLog(backAction);
            main.postDelayed(this, 25000);
        }
    };

    private final Runnable rePair = new Runnable() {
        @Override public void run() {
            if (node != null && !node.isEnabled()) node.reRegister();
            main.postDelayed(this, 12000);
        }
    };

    /* ================= lifecycle & chrome ================= */

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Design.load(this);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        rootFrame = new FrameLayout(this);
        rootFrame.setBackgroundColor(Design.PAPER());

        LinearLayout chrome = vertical();
        appbarBox = vertical();
        appbarBox.setBackgroundColor(Design.PAPER());
        chrome.addView(appbarBox, new LinearLayout.LayoutParams(-1, -2));

        content = new ScrollView(this);
        content.setFillViewport(true);
        body = vertical();
        body.setPadding(dp(18), dp(14), dp(18), dp(24));
        content.addView(body, new FrameLayout.LayoutParams(-1, -2));
        chrome.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));

        navBox = vertical();
        navBox.setBackgroundColor(Design.PAPER());
        chrome.addView(navBox, new LinearLayout.LayoutParams(-1, -2));

        rootFrame.addView(chrome, new FrameLayout.LayoutParams(-1, -1));
        overlay = new FrameLayout(this);
        overlay.setVisibility(View.GONE);
        rootFrame.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        setContentView(rootFrame);

        WindowInsetsControllerCompat wic = new WindowInsetsControllerCompat(getWindow(), rootFrame);
        wic.setAppearanceLightStatusBars(true);
        wic.setAppearanceLightNavigationBars(true);

        ViewCompat.setOnApplyWindowInsetsListener(rootFrame, (v, insets) -> {
            androidx.core.graphics.Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            androidx.core.graphics.Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            insetTop = sys.top;
            insetBottom = sys.bottom;
            appbarBox.setPadding(0, insetTop, 0, 0);
            /* edge-to-edge opts out of adjustResize, so the keyboard must be
             * handled here: pad the whole frame above the IME so focused
             * fields scroll into view, and drop the nav-bar padding while the
             * keyboard covers that bar anyway */
            boolean imeOpen = ime.bottom > 0;
            v.setPadding(0, 0, 0, imeOpen ? ime.bottom : 0);
            navBox.setPadding(0, 0, 0, imeOpen ? 0 : insetBottom);
            overlay.setPadding(0, 0, 0, 0);
            return insets;
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (overlay.getVisibility() == View.VISIBLE) { onCloseViewer(); return; }
                if (backAction != null) { backAction.run(); return; }
                finish();
            }
        });

        node = new NodeApi(this, enabled -> {
            refreshNodeDot();
            if (enabled) {
                cleanupPhantomCollections();
                if (screen == Screen.LAUNCH) renderGallery();
                else if (screen == Screen.GALLERY) galleryScan();
            }
        });

        restoreDrafts();
        MintService.kick(this);   // any interrupted mint resumes immediately
        if (LocalStore.load(this).length() == 0) renderLaunch();
        else renderGallery();

        main.postDelayed(() -> { if (node != null && !node.isEnabled()) node.reRegister(); }, 900);
        main.postDelayed(rePair, 12000);
        main.postDelayed(mintLoop, 5000);
    }

    @Override protected void onPause() {
        saveDrafts();
        super.onPause();
    }

    @Override protected void onDestroy() {
        main.removeCallbacks(rePair);
        main.removeCallbacks(mintLoop);
        if (node != null) node.onDestroy();
        super.onDestroy();
    }

    /* ---- wizard drafts survive app death ---- */

    private void saveDrafts() {
        // build the JSON trees here (cheap reference puts), serialize + write
        // off the UI thread — the collection draft can be ~300KB of base64
        JSONObject[] drafts = buildDraftJsons();
        new Thread(() -> {
            LocalStore.saveDraft(this, "nft", drafts[0]);
            LocalStore.saveDraft(this, "token", drafts[1]);
            LocalStore.saveDraft(this, "collection", drafts[2]);
        }).start();
    }

    private JSONObject[] buildDraftJsons() {
        JSONObject nft = new JSONObject();
        put(nft, "name", nftName); put(nft, "desc", nftDesc); put(nft, "owner", nftOwner);
        put(nft, "external", nftExternal); put(nft, "web", nftWeb); put(nft, "url", nftUrl);
        put(nft, "editions", nftEditions); put(nft, "image", nftImage);
        put(nft, "embed", nftEmbed); put(nft, "sign", nftSign);
        put(nft, "traits", StateNft.traitsToAttributes(nftTraits));

        JSONObject tok = new JSONObject();
        put(tok, "name", tokName); put(tok, "ticker", tokTicker); put(tok, "supply", tokSupply);
        put(tok, "decimals", tokDecimals); put(tok, "desc", tokDesc); put(tok, "url", tokUrl);
        put(tok, "icon", tokIcon);
        put(tok, "pairs", pairsToJson(tokPairs));

        JSONObject coll = new JSONObject();
        put(coll, "name", createName); put(coll, "desc", createDesc); put(coll, "size", createSize);
        put(coll, "mode", createMode); put(coll, "base", createBase); put(coll, "ext", createExt);
        put(coll, "icon", createIcon); put(coll, "iconb64", createIconB64); put(coll, "external", createExternal); put(coll, "web", createWeb);
        JSONArray imgs = new JSONArray();
        for (String s : createImages) imgs.put(s == null ? "" : s);
        put(coll, "images", imgs);
        return new JSONObject[]{ nft, tok, coll };
    }

    private void restoreDrafts() {
        JSONObject nft = LocalStore.loadDraft(this, "nft");
        if (nft != null) {
            nftName = nft.optString("name", ""); nftDesc = nft.optString("desc", "");
            nftOwner = nft.optString("owner", ""); nftExternal = nft.optString("external", "");
            nftWeb = nft.optString("web", ""); nftUrl = nft.optString("url", "");
            nftEditions = nft.optString("editions", "1"); nftImage = nft.optString("image", "");
            nftEmbed = nft.optBoolean("embed", true); nftSign = nft.optBoolean("sign", true);
            nftTraits.clear();
            JSONArray tr = nft.optJSONArray("traits");
            if (tr != null) for (int i = 0; i < tr.length(); i++) {
                JSONObject a = tr.optJSONObject(i);
                if (a != null) nftTraits.add(new String[]{ a.optString("trait_type"), a.optString("value") });
            }
        }
        JSONObject tok = LocalStore.loadDraft(this, "token");
        if (tok != null) {
            tokName = tok.optString("name", ""); tokTicker = tok.optString("ticker", "");
            tokSupply = tok.optString("supply", "1000000"); tokDecimals = tok.optString("decimals", "0");
            tokDesc = tok.optString("desc", ""); tokUrl = tok.optString("url", "");
            tokIcon = tok.optString("icon", "");
            tokPairs.clear();
            JSONArray pr = tok.optJSONArray("pairs");
            if (pr != null) for (int i = 0; i < pr.length(); i++) {
                JSONObject a = pr.optJSONObject(i);
                if (a != null) tokPairs.add(new String[]{ a.optString("k"), a.optString("v") });
            }
        }
        JSONObject coll = LocalStore.loadDraft(this, "collection");
        if (coll != null) {
            createName = coll.optString("name", ""); createDesc = coll.optString("desc", "");
            createSize = coll.optString("size", "12"); createMode = coll.optString("mode", "url");
            createBase = coll.optString("base", ""); createExt = coll.optString("ext", ".png");
            createIcon = coll.optString("icon", ""); createIconB64 = coll.optString("iconb64", ""); createExternal = coll.optString("external", "");
            createWeb = coll.optString("web", "");
            JSONArray imgs = coll.optJSONArray("images");
            if (imgs != null) {
                createImages = new String[imgs.length()];
                for (int i = 0; i < imgs.length(); i++) createImages[i] = imgs.optString(i, "");
            }
        }
    }

    private JSONArray pairsToJson(List<String[]> pairs) {
        JSONArray arr = new JSONArray();
        for (String[] p : pairs) {
            if (p == null || p.length < 2) continue;
            JSONObject o = new JSONObject();
            put(o, "k", p[0]); put(o, "v", p[1]);
            arr.put(o);
        }
        return arr;
    }

    private void setScreen(Screen s, Runnable back) {
        screen = s;
        backAction = back;
        inlineStatus = null;
        for (Runnable r : departureWatchers) main.removeCallbacks(r);
        departureWatchers.clear();
        body.removeAllViews();
        content.scrollTo(0, 0);
    }

    /** App bar: optional back square, tracked title, vermilion node square. */
    private void appbar(String title, boolean showBack, boolean wordmark) {
        appbarBox.removeAllViews();
        LinearLayout bar = horizontal(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(14), dp(8), dp(14), dp(8));
        if (showBack) {
            TextView bk = Design.text(this, "‹", 24, Design.PAPER(), Design.sansBold());
            bk.setGravity(Gravity.CENTER);
            bk.setBackground(Design.ripple(Design.rect(Design.INK())));
            bk.setClickable(true);
            bk.setOnClickListener(v -> { if (backAction != null) backAction.run(); });
            bar.addView(bk, new LinearLayout.LayoutParams(dp(44), dp(44)));
            bar.addView(new Space(this), new LinearLayout.LayoutParams(dp(10), 1));
        }
        TextView t;
        if (wordmark) {
            t = Design.display(this, "Atelier", 21);
            t.setLetterSpacing(0.16f);
        } else {
            t = Design.display(this, title, 15);
        }
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        bar.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
        TextView ver = Design.text(this, "№ " + BuildConfig.VERSION_NAME, 9.5f, Design.DIM(), Design.mono());
        ver.setLetterSpacing(0.08f);
        ver.setPadding(dp(6), 0, 0, 0);
        bar.addView(ver);
        nodeDot = Design.text(this, "▪", 16, node != null && node.isEnabled() ? Design.ACCENT() : Design.SOFT(), Design.sansBold());
        nodeDot.setPadding(dp(6), 0, 0, 0);
        nodeDot.setOnClickListener(v -> renderManage());
        bar.addView(nodeDot);
        appbarBox.addView(bar);
        appbarBox.addView(Design.rule(this, 3));
    }

    private void bottomNav(int active) {
        navBox.removeAllViews();
        navBox.addView(Design.rule(this, 3));
        LinearLayout nav = horizontal(Gravity.CENTER);
        String[] labels = {"Gallery", "Studio", "Manage"};
        for (int i = 0; i < labels.length; i++) {
            final int idx = i;
            TextView t = Design.text(this, labels[i].toUpperCase(), 10.5f,
                    active == i ? Design.PAPER() : Design.DIM(), Design.sansBold());
            t.setLetterSpacing(0.14f);
            t.setGravity(Gravity.CENTER);
            t.setBackground(active == i ? Design.rect(Design.INK()) : null);
            t.setClickable(true);
            t.setOnClickListener(v -> {
                if (idx == 0) renderGallery();
                else if (idx == 1) renderStudio();
                else renderManage();
            });
            nav.addView(t, new LinearLayout.LayoutParams(0, dp(50), 1));
        }
        navBox.addView(nav);
    }

    private void hideNav() {
        navBox.removeAllViews();
    }

    /** One-time healing: rows that were never engine-minted (created != 1)
     *  must prove the StateNFT script fingerprint or leave the collections
     *  store — a regular NFT filed here becomes a phantom collection with a
     *  placeholder cover (the Jazminima bug) AND gets excluded from the
     *  Singles classification. Legitimate adopted collections fingerprint
     *  fine and are untouched. */
    private boolean phantomsChecked = false;

    private void cleanupPhantomCollections() {
        if (phantomsChecked) return;
        phantomsChecked = true;
        JSONArray rows = LocalStore.load(this);
        ArrayList<long[]> candidates = new ArrayList<>();
        ArrayList<String> tokenids = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            if (r == null) continue;
            String tid = r.optString("tokenid", "");
            if (tid.isEmpty()) continue;                    // mid-create engine rows stay
            if (r.optInt("created", 0) == 1) continue;      // engine-minted rows stay
            candidates.add(new long[]{ r.optLong("id") });
            tokenids.add(tid);
        }
        verifyPhantom(candidates, tokenids, 0, new int[]{0});
    }

    private void verifyPhantom(ArrayList<long[]> ids, ArrayList<String> tids, int i, int[] removed) {
        if (i >= ids.size()) {
            if (removed[0] > 0) {
                loadLocalCollections();
                lastGallerySig = "";
                if (screen == Screen.GALLERY) renderGallery();
                toast(removed[0] + " regular NFT" + (removed[0] == 1 ? "" : "s")
                        + " unfiled from collections — see Singles");
            }
            return;
        }
        node.cmd("tokens tokenid:" + tids.get(i), new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONObject t = json.optJSONObject("response");
                String script = t == null ? "" : t.optString("script", "");
                if (StateNft.creatorPk(script).isEmpty()) {
                    LocalStore.removeById(MainActivity.this, ids.get(i)[0]);
                    removed[0]++;
                }
                verifyPhantom(ids, tids, i + 1, removed);
            }
            @Override public void onError(String message) { verifyPhantom(ids, tids, i + 1, removed); }
        });
    }

    /** Hand the mint to the foreground service (survives screen-off) and
     *  make sure its notification can actually be seen. */
    private void engageEngine() {
        if (android.os.Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                   != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ android.Manifest.permission.POST_NOTIFICATIONS }, 9001);
        }
        MintService.kick(this);
        toast("Engine engaged — sealing continues even with the screen off");
    }

    private void refreshNodeDot() {
        if (nodeDot != null) nodeDot.setTextColor(node != null && node.isEnabled() ? Design.ACCENT() : Design.SOFT());
    }

    private void setInlineStatus(String s) {
        if (inlineStatus != null) inlineStatus.setText(s);
    }

    /* ================= LAUNCH ================= */

    private void renderLaunch() {
        setScreen(Screen.LAUNCH, null);
        appbarBox.removeAllViews();
        hideNav();
        body.addView(vspace(46));
        TextView word = Design.display(this, "Atelier", 40);
        word.setLetterSpacing(0.2f);
        body.addView(word);
        body.addView(Design.lot(this, "The Minima NFT studio · № " + BuildConfig.VERSION_NAME), lpm(0, 6, 0, 18));
        body.addView(Design.rule(this, 3));
        body.addView(vspace(18));
        body.addView(Design.body(this, "Collections with sealed on-chain identities. Single NFTs. Custom tokens. Every mint a numbered lot."), lpm(0, 0, 0, 26));

        LinearLayout card = lotCard();
        card.addView(Design.kicker(this, "Minima Core"));
        boolean on = node != null && node.isEnabled();
        card.addView(Design.text(this, on ? "Connected" : "Not paired yet", 14, on ? Design.ACCENT() : Design.DIM(), Design.sansBold()), lpm(0, 6, 0, 4));
        card.addView(Design.note(this, "Enable Atelier in Minima Core → Apps, then return here."));
        TextView open = Design.button(this, "Open Minima Core", true);
        open.setOnClickListener(v -> openMinimaCore());
        card.addView(open, lph(50, 0, 16, 0, 8));
        TextView cont = Design.button(this, "Enter the studio", false);
        cont.setOnClickListener(v -> renderGallery());
        card.addView(cont, lph(48, 0, 0, 0, 0));
        body.addView(card);
    }

    /* ================= GALLERY ================= */

    private void renderGallery() {
        renderGallery(true);
    }

    /** withScan=false renders from the data already in hand — the scan
     *  callback uses it so a re-render never re-triggers the scan (the
     *  render↔scan loop was THE sluggishness bug). */
    private void renderGallery(boolean withScan) {
        setScreen(Screen.GALLERY, null);
        appbar(null, false, true);
        bottomNav(0);
        loadLocalCollections();

        LinearLayout chips = horizontal(Gravity.CENTER_VERTICAL);
        String[][] fs = {{"all", "All"}, {"coll", "Collections"}, {"nft", "NFTs"}, {"tok", "Tokens"}, {"mine", "Mine"}};
        for (String[] f : fs) {
            TextView chipView = Design.chip(this, f[1], galleryFilter.equals(f[0]));
            chipView.setOnClickListener(v -> { galleryFilter = f[0]; renderGallery(); });
            chips.addView(chipView, new LinearLayout.LayoutParams(-2, -2){{ rightMargin = dp(6); }});
        }
        HorizontalScroll hs = new HorizontalScroll(this);
        hs.addView(chips);
        body.addView(hs, lpm(0, 0, 0, 14));

        boolean any = false;
        if (galleryFilter.equals("all") || galleryFilter.equals("coll") || galleryFilter.equals("mine")) {
            List<StateNft.Meta> list = new ArrayList<>();
            for (StateNft.Meta m : collections) {
                // burial means gone: a fresh grave shows for 50 blocks, then
                // the collection leaves the catalogue for good
                if ("BURIED".equals(m.phase)) {
                    boolean fresh = m.buriedAt > 0 && lastTip > 0 && (lastTip - m.buriedAt) <= 50;
                    if (!fresh) continue;
                }
                if (galleryFilter.equals("mine") && !m.created) continue;
                list.add(m);
            }
            if (!list.isEmpty()) {
                any = true;
                body.addView(sectionHead("Collections", String.valueOf(list.size())));
                for (StateNft.Meta m : list) body.addView(collectionCard(m), lpm(0, 0, 0, 14));
            }
        }
        if ((galleryFilter.equals("all") || galleryFilter.equals("nft")) && !nftRows.isEmpty()) {
            any = true;
            body.addView(sectionHead("Single NFTs", String.valueOf(nftRows.size())));
            LinearLayout row = null;
            for (int i = 0; i < nftRows.size(); i++) {
                if (i % 2 == 0) {
                    row = horizontal(Gravity.TOP);
                    body.addView(row, lpm(0, 0, 0, 12));
                }
                View card = nftCard(nftRows.get(i));
                LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(0, -2, 1);
                if (i % 2 == 0) clp.rightMargin = dp(6); else clp.leftMargin = dp(6);
                row.addView(card, clp);
                if (i == nftRows.size() - 1 && i % 2 == 0) row.addView(new Space(this), new LinearLayout.LayoutParams(0, 1, 1){{ leftMargin = dp(6); }});
            }
        }
        if ((galleryFilter.equals("all") || galleryFilter.equals("tok")) && !tokenRows.isEmpty()) {
            any = true;
            body.addView(sectionHead("Tokens", String.valueOf(tokenRows.size())));
            for (JSONObject t : tokenRows) body.addView(tokenRow(t), lpm(0, 0, 0, 8));
        }

        if (!any) {
            LinearLayout empty = lotCard();
            empty.addView(Design.lot(this, "Empty catalogue"));
            empty.addView(Design.display(this, "No lots yet", 18), lpm(0, 4, 0, 6));
            empty.addView(Design.note(this, "Create your first piece in the Studio, or adopt existing StateNFT collections from your wallet."));
            TextView go = Design.button(this, "Open the studio", true);
            go.setOnClickListener(v -> renderStudio());
            empty.addView(go, lph(50, 0, 16, 0, 8));
            TextView scanB = Design.button(this, "Scan wallet", false);
            scanB.setOnClickListener(v -> renderScan());
            empty.addView(scanB, lph(48, 0, 0, 0, 0));
            body.addView(empty);
        }

        inlineStatus = Design.note(this, "");
        body.addView(inlineStatus, lpm(0, 10, 0, 0));
        if (withScan) galleryScan();
    }

    private LinearLayout sectionHead(String title, String count) {
        LinearLayout h = horizontal(Gravity.CENTER_VERTICAL);
        h.addView(Design.kicker(this, title), new LinearLayout.LayoutParams(0, -2, 1));
        h.addView(Design.text(this, count, 11, Design.DIM(), Design.mono()));
        LinearLayout box = vertical();
        box.addView(h);
        box.addView(Design.rule(this, 2), new LinearLayout.LayoutParams(-1, dp(2)){{ topMargin = dp(6); bottomMargin = dp(12); }});
        return box;
    }

    private View collectionCard(StateNft.Meta m) {
        LinearLayout card = vertical();
        card.setBackground(Design.blockShadow(this, Design.CARD()));
        card.setClickable(true);
        Design.pressable(card);
        card.setOnClickListener(v -> openCollection(m));

        ImageView cover = new ImageView(this);
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cover.setImageBitmap(Identicon.forToken(m.tokenid, 600));
        String lead = collectionLeadImage(m);
        if (lead != null) ImageLoader.loadOver(this, lead, cover);
        card.addView(cover, new LinearLayout.LayoutParams(-1, dp(140)));
        card.addView(Design.rule(this, 2));

        LinearLayout inner = vertical();
        inner.setPadding(dp(12), dp(10), dp(12), dp(12));
        inner.addView(Design.lot(this, m.size > 0 ? String.format(Locale.US, "Lot 001 — %03d", m.size) : "Lot —"));
        LinearLayout titleRow = horizontal(Gravity.CENTER_VERTICAL);
        TextView nm = Design.display(this, m.name, 14);
        nm.setSingleLine(true);
        nm.setEllipsize(android.text.TextUtils.TruncateAt.END);
        titleRow.addView(nm, new LinearLayout.LayoutParams(0, -2, 1));
        titleRow.addView(statusPill(m));
        inner.addView(titleRow, lpm(0, 3, 0, 4));
        inner.addView(Design.note(this, (m.tokenid.isEmpty() ? "token pending" : Util.shorten(m.tokenid))
                + " · sealed " + Math.max(0, m.minted) + "/" + Math.max(m.size, 0)
                + " · owned " + Math.max(0, m.owned)));
        inner.addView(Design.meter(this, collectionProgress(m)), new LinearLayout.LayoutParams(-1, dp(5)){{ topMargin = dp(8); }});
        card.addView(inner);
        return card;
    }

    private TextView statusPill(StateNft.Meta m) {
        String p = m.phase == null ? "DONE" : m.phase;
        if (activeMint(m)) {
            if ("NEEDIMAGES".equals(p)) return Design.pill(this, "Images", Design.PILL_ERR);
            return Design.pill(this, statusWord(p), Design.PILL_LIVE);
        }
        if ("BURIED".equals(p)) return Design.pill(this, "Buried", Design.PILL_DIM);
        if (m.size > 0 && m.minted >= m.size) return Design.pill(this, "Sealed", Design.PILL_DONE);
        return Design.pill(this, "Open", Design.PILL_DIM);
    }

    private String statusWord(String p) {
        if ("CREATE".equals(p)) return "Creating";
        if ("MOVE".equals(p)) return "Gather";
        if ("SPLIT".equals(p)) return "Splitting";
        if ("STAMP".equals(p)) return "Stamping";
        return p;
    }

    private View nftCard(JSONObject row) {
        String tid = row.optString("tokenid", "");
        StateNft.Meta meta = StateNft.parseMeta(tid, row.opt("token"));
        LinearLayout card = vertical();
        card.setBackground(Design.blockShadow(this, Design.CARD()));
        card.setClickable(true);
        Design.pressable(card);
        card.setOnClickListener(v -> openNftViewer(meta, row));
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken(tid, 400));
        String icon = IconResolver.resolve(meta.icon);
        if (icon != null) ImageLoader.loadOver(this, icon, img);
        card.addView(img, new LinearLayout.LayoutParams(-1, dp(120)));
        card.addView(Design.rule(this, 2));
        LinearLayout inner = vertical();
        inner.setPadding(dp(10), dp(8), dp(10), dp(10));
        TextView nm = Design.text(this, meta.name, 12, Design.INK(), Design.sansBold());
        nm.setSingleLine(true);
        nm.setEllipsize(android.text.TextUtils.TruncateAt.END);
        inner.addView(nm);
        inner.addView(Design.note(this, "ed. " + row.optString("total", "1") + " · " + Util.shorten(tid)));
        card.addView(inner);
        return card;
    }

    private View tokenRow(JSONObject row) {
        String tid = row.optString("tokenid", "");
        Object tok = row.opt("token");
        String name = Util.tokenName(tok);
        String ticker = "";
        if (tok instanceof JSONObject) {
            Object n = ((JSONObject) tok).opt("name");
            if (n instanceof JSONObject) ticker = ((JSONObject) n).optString("ticker", "");
        }
        LinearLayout r = horizontal(Gravity.CENTER_VERTICAL);
        r.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1.5f));
        r.setPadding(dp(10), dp(8), dp(10), dp(8));
        ImageView icon = new ImageView(this);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        icon.setImageBitmap(Identicon.forToken(tid, 120));
        StateNft.Meta meta = StateNft.parseMeta(tid, tok);
        String ic = IconResolver.resolve(meta.icon);
        if (ic != null) ImageLoader.loadOver(this, ic, icon);
        r.addView(icon, new LinearLayout.LayoutParams(dp(34), dp(34)));
        LinearLayout mid = vertical();
        mid.setPadding(dp(10), 0, 0, 0);
        mid.addView(Design.text(this, name + (ticker.isEmpty() ? "" : " · " + ticker.toUpperCase()), 12, Design.INK(), Design.sansBold()));
        mid.addView(Design.note(this, "supply " + row.optString("total", "?") + " · " + Util.shorten(tid)));
        r.addView(mid, new LinearLayout.LayoutParams(0, -2, 1));
        TextView copy = Design.hash(this, "id");
        copy.setOnClickListener(v -> copyText(tid));
        r.addView(copy);
        return r;
    }

    private void openNftViewer(StateNft.Meta meta, JSONObject balRow) {
        StateNft.Item it = new StateNft.Item();
        it.index = 1;
        it.owned = parseIntSafe(balRow.optString("sendable", "0")) > 0 || !"0".equals(balRow.optString("confirmed", "0"));
        it.imageUrl = IconResolver.resolve(meta.icon);
        List<StateNft.Item> items = new ArrayList<>();
        items.add(it);
        if (meta.size <= 0) meta.size = 1;
        showViewer(meta, items, 0);
    }

    private void galleryScan() {
        if (node == null || !node.isEnabled()) return;
        node.cmd("block", new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONObject r = json.optJSONObject("response");
                if (r != null) lastTip = r.optInt("block", lastTip);
            }
            @Override public void onError(String message) {}
        });
        node.cmd("balance", new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONArray bal = json.optJSONArray("response");
                if (bal == null) return;
                HashSet<String> known = new HashSet<>();
                for (StateNft.Meta m : collections) known.add(m.tokenid);
                nftRows.clear();
                tokenRows.clear();
                ArrayList<StateNft.Meta> toAdopt = new ArrayList<>();
                for (int i = 0; i < bal.length(); i++) {
                    JSONObject row = bal.optJSONObject(i);
                    if (row == null) continue;
                    String tid = row.optString("tokenid", "");
                    if ("0x00".equals(tid) || known.contains(tid)) continue;
                    Object tok = row.opt("token");
                    if (!(tok instanceof JSONObject)) { tokenRows.add(row); continue; }
                    JSONObject t = (JSONObject) tok;
                    Object nameObj = t.opt("name");
                    JSONObject metaObj = nameObj instanceof JSONObject ? (JSONObject) nameObj : t;
                    StateNft.Meta cand = StateNft.parseMeta(tid, t);
                    if (StateNft.isCandidate(cand)) {
                        // un-adopted StateNFT held in this wallet: adopt it
                        // automatically (script-fingerprint verified below) —
                        // received collections must never hide behind a manual scan
                        toAdopt.add(cand);
                        continue;
                    }
                    boolean isNft = "true".equals(metaObj.optString("nft", ""))
                            || (!metaObj.optString("url", "").isEmpty()
                                && parseIntSafe(row.optString("total", "0")) > 0
                                && parseIntSafe(row.optString("total", "0")) <= 100
                                && metaObj.optString("ticker", "").isEmpty());
                    if (isNft) nftRows.add(row); else tokenRows.add(row);
                }
                StringBuilder sig = new StringBuilder();
                for (JSONObject r : nftRows) sig.append(r.optString("tokenid")).append('|');
                sig.append('/');
                for (JSONObject r : tokenRows) sig.append(r.optString("tokenid")).append('|');
                if (!toAdopt.isEmpty()) autoAdopt(toAdopt, 0, 0);
                if (sig.toString().equals(lastGallerySig)) return;   // nothing new — no rebuild
                lastGallerySig = sig.toString();
                if (screen == Screen.GALLERY) renderGalleryPreserveScroll();
            }
            @Override public void onError(String message) { /* silent; dot shows state */ }
        });
    }

    /** Auto-adopt received StateNFT collections: verify the on-chain script
     *  fingerprint (the definitive test — metadata alone is never enough),
     *  then file them so they appear without a manual Scan Wallet. */
    private void autoAdopt(ArrayList<StateNft.Meta> cands, int i, int adopted) {
        if (i >= cands.size()) {
            if (adopted > 0) {
                loadLocalCollections();
                lastGallerySig = "";
                if (screen == Screen.GALLERY) renderGalleryPreserveScroll();
            }
            return;
        }
        StateNft.Meta cand = cands.get(i);
        node.cmd("tokens tokenid:" + cand.tokenid, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONObject t = json.optJSONObject("response");
                String pk = StateNft.creatorPk(t == null ? "" : t.optString("script", ""));
                if (pk.isEmpty()) { autoAdopt(cands, i + 1, adopted); return; }
                StateNft.Meta m = StateNft.parseMeta(cand.tokenid, t);
                m.creatorPk = pk;
                countOwned(m, () -> {
                    if (LocalStore.findByTokenid(MainActivity.this, m.tokenid) == null) {
                        m.localId = LocalStore.nextId(MainActivity.this);
                        m.phase = "DONE";
                        m.created = false;
                        LocalStore.upsert(MainActivity.this, MintEngine.rowFromMeta(m, new JSONArray()));
                        LocalStore.logEvent(MainActivity.this, "Adopted “" + m.name + "” — found in wallet");
                        toast("Adopted “" + m.name + "” — found in your wallet");
                    }
                    autoAdopt(cands, i + 1, adopted + 1);
                });
            }
            @Override public void onError(String message) { autoAdopt(cands, i + 1, adopted); }
        });
    }

    private void renderGalleryPreserveScroll() {
        int y = content.getScrollY();
        renderGallery(false);
        content.post(() -> content.scrollTo(0, y));
    }

    /* ================= COLLECTION DETAIL ================= */

    private void openCollection(StateNft.Meta m) {
        if (m == null) { renderGallery(); return; }
        setScreen(Screen.COLLECTION, this::renderGallery);
        appbar(m.name, true, false);
        bottomNav(0);
        openMeta = m;
        openOwned = new JSONArray();
        openAll = new JSONArray();
        lastDetailSig = "";
        body.addView(Design.note(this, "Reading the chain…"), lpm(0, 8, 0, 0));
        refreshDetail();
    }

    private void refreshDetail() {
        StateNft.Meta m = openMeta;
        if (m == null || screen != Screen.COLLECTION) return;
        if (m.tokenid == null || m.tokenid.isEmpty()) {
            openOwned = new JSONArray();
            openAll = new JSONArray();
            renderDetail();
            return;
        }
        MintEngine.tokenCoinsBounded(node, m.tokenid, true, (coins, partial) -> {
            openOwned = coins;
            detailPartial = partial;
            m.owned = coins.length();
            MintEngine.tokenCoinsBounded(node, m.tokenid, false, (all, partial2) -> {
                openAll = all.length() == 0 ? openOwned : all;
                detailPartial = detailPartial || partial2;
                m.totalSeen = openAll.length();
                m.minted = distinctStamped(openAll);
                if (m.size <= 0) m.size = Math.max(m.minted, Math.max(m.totalSeen, m.owned));
                persistCounts(m);
                renderDetail();
            }, e -> {
                openAll = openOwned;
                m.totalSeen = openOwned.length();
                m.minted = distinctStamped(openOwned);
                if (m.size <= 0) m.size = Math.max(m.minted, Math.max(m.totalSeen, m.owned));
                persistCounts(m);
                renderDetail();
            });
        }, e -> renderDetail());
    }

    private void persistCounts(StateNft.Meta m) {
        JSONObject row = LocalStore.findById(this, m.localId);
        if (row == null) row = LocalStore.findByTokenid(this, m.tokenid);
        if (row == null) return;
        put(row, "owned", m.owned);
        put(row, "minted", m.minted);
        LocalStore.upsert(this, row);
    }

    private void renderDetail() {
        StateNft.Meta m = openMeta;
        if (m == null || screen != Screen.COLLECTION) return;
        // 25s engine ticks re-enter here: skip the full view-tree rebuild
        // (and its mid-scroll stutter) when nothing user-visible changed
        JSONObject dropState = AirdropEngine.job(this, m.localId);
        String sig = m.localId + "|" + m.phase + "|" + m.minted + "|" + m.owned + "|" + m.totalSeen
                + "|" + m.error + "|" + openOwned.length() + "|" + openAll.length() + "|" + detailPartial
                + "|" + (LocalStore.lastHeartbeat(this) / 30000)
                + "|" + (dropState == null ? 0 : dropState.toString().hashCode());
        if (sig.equals(lastDetailSig)) return;
        lastDetailSig = sig;
        body.removeAllViews();

        List<StateNft.Item> items = StateNft.items(m, openOwned, openAll);
        if (m.created && (m.tokenid == null || m.tokenid.isEmpty())) items = localItemsForMeta(m);
        else if (m.created) items = mergeLocalPreviews(m, items);
        final List<StateNft.Item> shown = items;

        /* hero */
        FrameLayout heroBox = new FrameLayout(this);
        heroBox.setBackground(Design.blockShadow(this, Design.CARD()));
        ImageView hero = new ImageView(this);
        hero.setScaleType(ImageView.ScaleType.CENTER_CROP);
        hero.setImageBitmap(Identicon.forToken(m.tokenid, 900));
        String heroUrl = !shown.isEmpty() && shown.get(0).imageUrl != null && !shown.get(0).imageUrl.isEmpty()
                ? shown.get(0).imageUrl : IconResolver.resolve(m.icon);
        if (heroUrl != null && !heroUrl.isEmpty()) ImageLoader.loadFull(this, heroUrl, hero);
        FrameLayout.LayoutParams heroLp = new FrameLayout.LayoutParams(-1, dp(170));
        int off = dp(3);
        heroLp.setMargins(0, 0, off, off);
        heroBox.addView(hero, heroLp);
        heroBox.setClickable(true);
        heroBox.setOnClickListener(v -> { if (!shown.isEmpty()) showViewer(m, shown, 0); });
        body.addView(heroBox, lpm(0, 4, 0, 12));

        body.addView(Design.lot(this, m.size > 0 ? String.format(Locale.US, "Lot 001 — %03d · %s", m.size, modeWord(m)) : modeWord(m)));

        LinearLayout meta = lotCard();
        TextView tokHash = Design.hash(this, m.tokenid.isEmpty() ? "token pending" : Util.shorten(m.tokenid));
        if (!m.tokenid.isEmpty()) tokHash.setOnClickListener(v -> copyText(m.tokenid));
        LinearLayout hr = horizontal(Gravity.CENTER_VERTICAL);
        hr.addView(tokHash);
        hr.addView(new Space(this), new LinearLayout.LayoutParams(0, 1, 1));
        hr.addView(statusPill(m));
        meta.addView(hr);
        meta.addView(kvRow("Editions", String.valueOf(m.size)));
        meta.addView(kvRow("Sealed", m.minted + " / " + m.size));
        meta.addView(kvRow("In custody", String.valueOf(m.owned)));
        if (m.error != null && !m.error.isEmpty()) {
            meta.addView(Design.text(this, m.error, 11, Design.ACCENT(), Design.sansBold()), lpm(0, 6, 0, 0));
        }
        if (detailPartial) {
            meta.addView(Design.note(this, "Large collection — showing the newest on-chain window; older records exceed the node link."), lpm(0, 6, 0, 0));
        }
        body.addView(meta, lpm(0, 8, 0, 12));

        if (activeMint(m)) {
            body.addView(phaseRail(m), lpm(0, 0, 0, 6));
            body.addView(Design.meter(this, collectionProgress(m)), new LinearLayout.LayoutParams(-1, dp(6)){{ bottomMargin = dp(8); }});
            long beat = LocalStore.lastHeartbeat(this);
            long age = beat == 0 ? Long.MAX_VALUE : (System.currentTimeMillis() - beat) / 1000;
            LinearLayout beatRow = horizontal(Gravity.CENTER_VERTICAL);
            beatRow.addView(Design.pill(this, age < 90 ? "Engine live" : "Engine asleep",
                    age < 90 ? Design.PILL_DONE : Design.PILL_ERR));
            beatRow.addView(Design.note(this, age < 90
                    ? "  ticked " + age + "s ago · tap for the engine log"
                    : "  no tick yet — tap Resume, or tap here for the log"), new LinearLayout.LayoutParams(0, -2, 1){{ leftMargin = dp(8); }});
            beatRow.setClickable(true);
            Design.pressable(beatRow);
            final StateNft.Meta mF = m;
            beatRow.setOnClickListener(v -> renderEngineLog(() -> openCollection(mF)));
            body.addView(beatRow, lpm(0, 0, 0, 12));
        }
        if ("NEEDIMAGES".equals(m.phase)) body.addView(recoveryPanel(m), lpm(0, 0, 0, 12));

        LinearLayout actions = horizontal(Gravity.CENTER_VERTICAL);
        TextView refresh = Design.button(this, "Refresh", false);
        refresh.setOnClickListener(v -> refreshDetail());
        actions.addView(refresh, weight(46, 0, 4));
        if (m.created && activeMint(m) && !"NEEDIMAGES".equals(m.phase)) {
            TextView resume = Design.button(this, "Resume", true);
            resume.setOnClickListener(v -> {
                engageEngine();
                loadLocalCollections();
                openMeta = findCollectionByLocalId(m.localId, m);
                refreshDetail();
            });
            actions.addView(resume, weight(46, 4, 4));
        }
        TextView bury = Design.button(this, "Bury", false);
        bury.setOnClickListener(v -> renderBury());
        actions.addView(bury, weight(46, 4, 0));
        body.addView(actions, lpm(0, 0, 0, 14));

        /* airdrop: progress panel when a job runs, dispatch button when lots are deliverable */
        JSONObject dropJob = AirdropEngine.job(this, m.localId);
        if (dropJob != null) {
            int[] prog = AirdropEngine.progress(dropJob);
            LinearLayout panel = vertical();
            panel.setBackground(Design.ruled(this, Design.CARD(), Design.ACCENT(), 2f));
            panel.setPadding(dp(12), dp(10), dp(12), dp(12));
            panel.addView(Design.lot(this, "Airdrop in progress"));
            panel.addView(Design.text(this, prog[0] + " / " + prog[1] + " lots delivered", 13, Design.INK(), Design.sansBold()), lpm(0, 4, 0, 6));
            panel.addView(Design.meter(this, prog[1] == 0 ? 0f : prog[0] / (float) prog[1]), new LinearLayout.LayoutParams(-1, dp(5)){{ bottomMargin = dp(8); }});
            JSONArray es = dropJob.optJSONArray("entries");
            if (es != null) for (int i = 0; i < es.length(); i++) {
                JSONObject e = es.optJSONObject(i);
                if (e == null) continue;
                String st = e.optString("status");
                String err = e.optString("error", "");
                panel.addView(kvRow("Lot " + String.format(Locale.US, "%03d", e.optInt("idx")),
                        ("FAIL".equals(st) && !err.isEmpty()) ? "FAIL — " + err : st + " → " + Util.shorten(e.optString("addr"))));
            }
            TextView clear = Design.button(this, prog[0] >= prog[1] ? "Clear record" : "Abandon remaining", false);
            clear.setOnClickListener(v -> {
                AirdropEngine.clearJob(this, m.localId);
                refreshDetail();
            });
            panel.addView(clear, lph(42, 0, 8, 0, 0));
            body.addView(panel, lpm(0, 0, 0, 14));
        } else {
            List<StateNft.Item> transferable = new ArrayList<>();
            for (StateNft.Item it : shown) if (it.owned && it.coin != null && StateNft.stamped(it.coin) != null) transferable.add(it);
            if (!transferable.isEmpty()) {
                TextView drop = Design.button(this, "Send " + transferable.size() + " lots — one address or a list", false);
                drop.setOnClickListener(v -> renderAirdrop(m, transferable));
                body.addView(drop, lph(46, 0, 0, 0, 14));
            }
        }

        body.addView(sectionHead("The lots — tap to view", shown.size() + ""));
        if (shown.isEmpty()) {
            body.addView(Design.note(this, "No item coins visible on this node yet."));
            return;
        }
        int cols = 3;
        LinearLayout row = null;
        for (int i = 0; i < shown.size(); i++) {
            if (i % cols == 0) {
                row = horizontal(Gravity.TOP);
                body.addView(row, lpm(0, 0, 0, 8));
            }
            View tile = itemTile(m, shown, i);
            LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, dp(112), 1);
            if (i % cols != 0) tlp.leftMargin = dp(8);
            row.addView(tile, tlp);
        }
        int rem = shown.size() % cols;
        if (rem != 0) {
            for (int i = 0; i < cols - rem; i++) {
                row.addView(new Space(this), new LinearLayout.LayoutParams(0, 1, 1){{ leftMargin = dp(8); }});
            }
        }
    }

    private String modeWord(StateNft.Meta m) {
        return "embed".equalsIgnoreCase(m.mode) ? "embedded editions" : "hosted editions";
    }

    private View itemTile(StateNft.Meta m, List<StateNft.Item> items, int index) {
        StateNft.Item it = items.get(index);
        FrameLayout tile = new FrameLayout(this);
        tile.setBackground(Design.ruled(this, Design.CARD(), it.owned ? Design.ACCENT() : Design.INK(), 1.5f));
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken(m.tokenid + it.index, 300));
        if (it.imageUrl != null && !it.imageUrl.isEmpty()) ImageLoader.loadOver(this, it.imageUrl, img);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(-1, -1);
        int b = dp(2);
        ilp.setMargins(b, b, b, b);
        tile.addView(img, ilp);
        TextView tag = Design.pill(this, String.format(Locale.US, "%02d", it.index),
                it.owned ? Design.PILL_MINE : (it.coin != null ? Design.PILL_DONE : Design.PILL_DIM));
        FrameLayout.LayoutParams tagLp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        tagLp.setMargins(dp(5), 0, 0, dp(5));
        tile.addView(tag, tagLp);
        tile.setClickable(true);
        tile.setOnClickListener(v -> showViewer(m, items, index));
        return tile;
    }

    private LinearLayout phaseRail(StateNft.Meta m) {
        String[] names = {"Create", "Gather", "Split", "Stamp", "Done"};
        int current = phaseIndex(m.phase == null ? "" : m.phase);
        LinearLayout rail = horizontal(Gravity.TOP);
        for (int i = 0; i < names.length; i++) {
            LinearLayout nodeBox = vertical();
            nodeBox.setGravity(Gravity.CENTER_HORIZONTAL);
            View sq = new View(this);
            boolean done = current > i || "DONE".equals(m.phase);
            boolean now = current == i && !"DONE".equals(m.phase);
            sq.setBackground(done ? Design.rect(Design.INK())
                    : now ? Design.rect(Design.ACCENT())
                    : Design.ruled(this, Design.PAPER(), Design.INK(), 1.5f));
            nodeBox.addView(sq, new LinearLayout.LayoutParams(dp(12), dp(12)));
            TextView lbl = Design.text(this, names[i].toUpperCase(), 7.5f,
                    now ? Design.ACCENT() : done ? Design.INK() : Design.DIM(), Design.sansBold());
            lbl.setLetterSpacing(0.1f);
            nodeBox.addView(lbl, lpm(0, 4, 0, 0));
            rail.addView(nodeBox, new LinearLayout.LayoutParams(0, -2, 1));
        }
        return rail;
    }

    private int phaseIndex(String phase) {
        if ("CREATE".equals(phase)) return 0;
        if ("MOVE".equals(phase)) return 1;
        if ("SPLIT".equals(phase)) return 2;
        if ("STAMP".equals(phase) || "NEEDIMAGES".equals(phase)) return 3;
        if ("DONE".equals(phase)) return 4;
        return 0;
    }

    /* ================= VIEWER (overlay) ================= */

    private void showViewer(StateNft.Meta m, List<StateNft.Item> items, int index) {
        overlay.removeAllViews();
        View v = ViewerScreen.build(this, this, m, items, index);
        v.setPadding(0, 0, 0, insetBottom);
        overlay.addView(v, new FrameLayout.LayoutParams(-1, -1));
        overlay.setVisibility(View.VISIBLE);
        new WindowInsetsControllerCompat(getWindow(), rootFrame).setAppearanceLightStatusBars(false);
    }

    @Override public void onCloseViewer() {
        overlay.setVisibility(View.GONE);
        overlay.removeAllViews();
        new WindowInsetsControllerCompat(getWindow(), rootFrame).setAppearanceLightStatusBars(true);
    }

    /** The Plate Room — full-screen image editor overlay. */
    private void showEditor(String b64, int budget, ImageEditor.Done done) {
        overlay.removeAllViews();
        View v = ImageEditor.build(this, b64, budget, this::onCloseViewer, edited -> {
            onCloseViewer();
            done.edited(edited);
        });
        v.setPadding(0, 0, 0, insetBottom);
        overlay.addView(v, new FrameLayout.LayoutParams(-1, -1));
        overlay.setVisibility(View.VISIBLE);
        new WindowInsetsControllerCompat(getWindow(), rootFrame).setAppearanceLightStatusBars(false);
    }

    @Override public void onTransferItem(StateNft.Item item) {
        onCloseViewer();
        if (openMeta != null && item.coin != null) renderTransfer(item);
    }

    /* ================= TRANSFER ================= */

    private void renderTransfer(StateNft.Item it) {
        StateNft.Meta m = openMeta;
        if (m == null || it.coin == null) return;
        transferItem = it;
        setScreen(Screen.TRANSFER, () -> openCollection(m));
        appbar(String.format(Locale.US, "Lot %03d", it.index), true, false);
        hideNav();

        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken(m.tokenid + it.index, 600));
        if (it.imageUrl != null && !it.imageUrl.isEmpty()) ImageLoader.loadFull(this, it.imageUrl, img);
        LinearLayout frame = vertical();
        frame.setBackground(Design.blockShadow(this, Design.CARD()));
        frame.addView(img, new LinearLayout.LayoutParams(-1, dp(200)){{ setMargins(0, 0, dp(3), dp(3)); }});
        body.addView(frame, lpm(0, 4, 0, 14));

        LinearLayout card = lotCard();
        card.addView(Design.lot(this, "Deed of transfer"));
        card.addView(Design.note(this, "Every state port is replayed verbatim — the sealed identity survives the move."), lpm(0, 4, 0, 8));
        card.addView(kvRow("Identity", StateNft.state(it.coin, 0) == null ? "—" : "port 0 = " + StateNft.state(it.coin, 0)));
        card.addView(kvRow("Image", StateNft.state(it.coin, 1) == null ? "hosted" : "embedded, travels with the coin"));
        body.addView(card, lpm(0, 0, 0, 14));

        body.addView(Design.kicker(this, "Recipient address"));
        EditText to = input("Mx… or 0x…");
        body.addView(to, lph(50, 0, 6, 0, 8));
        TextView status = Design.note(this, "Ready.");
        body.addView(status, lpm(0, 0, 0, 10));
        TextView go = Design.button(this, "Transfer this lot", true);
        go.setOnClickListener(v -> doTransfer(it, to, status));
        body.addView(go, lph(54, 0, 0, 0, 0));
    }

    private void doTransfer(StateNft.Item it, EditText to, TextView msg) {
        String addr = to.getText().toString().trim().replace(" ", "");
        if (!Util.isValidAddress(addr)) { msg.setText("That address does not parse. Mx… or 0x… format."); return; }
        if (!StateNft.replayableState(it.coin)) { msg.setText("Refusing malformed coin state."); return; }
        msg.setText("Building transaction…");
        String txn = "statenft" + System.currentTimeMillis();
        final StateNft.Meta meta = openMeta;
        MintEngine.postTxn(node, txn, StateNft.transferCommands(txn, meta.tokenid, it.coin, addr), () -> {
            msg.setText("Posted. Watching the UTXO set for departure…");
            watchDeparture(meta.tokenid, it.coin.optString("coinid"), () -> {
                toast("Lot " + it.index + " transferred");
                openCollection(meta);
            }, () -> msg.setText("Not confirmed yet — refresh the collection in a few minutes."));
        }, e -> msg.setText("Failed: " + e));
    }

    /* ================= BURY ================= */

    private void renderBury() {
        StateNft.Meta m = openMeta;
        if (m == null) return;
        setScreen(Screen.BURY, () -> openCollection(m));
        appbar("The Graveyard", true, false);
        hideNav();

        body.addView(Design.lot(this, "Final lot — irreversible"));
        body.addView(Design.display(this, m.name, 22), lpm(0, 4, 0, 14));

        LinearLayout facts = lotCard();
        facts.addView(kvRow("Owned coins", String.valueOf(m.owned)));
        facts.addView(kvRow("Destination", Util.shorten(StateNft.GRAVEYARD)));
        facts.addView(kvRow("Contract", "RETURN FALSE — nothing leaves"));
        body.addView(facts, lpm(0, 0, 0, 12));

        LinearLayout warn = vertical();
        warn.setBackground(Design.ruled(this, Design.CARD(), Design.ACCENT(), 2f));
        warn.setPadding(dp(12), dp(10), dp(12), dp(12));
        warn.addView(Design.text(this, "BURIAL IS PERMANENT", 13, Design.ACCENT(), Design.sansBold()));
        warn.addView(Design.note(this, "Only coins in your custody are buried. Collectors' holdings are untouched."), lpm(0, 4, 0, 0));
        body.addView(warn, lpm(0, 0, 0, 14));

        body.addView(Design.kicker(this, "Type the collection name to arm"));
        EditText confirm = input(m.name);
        body.addView(confirm, lph(50, 0, 6, 0, 8));
        TextView msg = Design.note(this, "The exact name arms the shovel.");
        body.addView(msg, lpm(0, 0, 0, 10));
        TextView go = Design.button(this, "Bury owned coins", true);
        go.setOnClickListener(v -> {
            if (!m.name.equals(confirm.getText().toString().trim())) {
                msg.setText("Name does not match.");
                return;
            }
            msg.setText("Reading wallet coins…");
            buryOwnedCoins(m, msg);
        });
        body.addView(go, lph(54, 0, 0, 0, 0));
    }

    private void buryOwnedCoins(StateNft.Meta m, TextView msg) {
        MintEngine.tokenCoinsBounded(node, m.tokenid, true, (coins, partial) -> {
            if (coins.length() == 0) {
                msg.setText(partial
                        ? "No coins visible in the newest window — try again in a few minutes."
                        : "No owned coins to bury.");
                return;
            }
            if (partial) msg.setText("Large collection — burying the newest batch of " + coins.length() + "…");
            buryOne(m, coins, 0, partial, msg);
        }, e -> msg.setText(e));
    }

    private void buryOne(StateNft.Meta m, JSONArray coins, int i, boolean partial, TextView msg) {
        if (i >= coins.length()) {
            if (partial) {
                msg.setText("Batch posted. Older coins were beyond the node link — run Bury again once these confirm; each pass reaches deeper.");
                toast("Burial batch posted — repeat to finish");
            } else {
                msg.setText("Burial transactions posted.");
                toast("Burial posted");
                markBuriedWhenEmpty(m);
            }
            openCollection(m);
            return;
        }
        JSONObject c = coins.optJSONObject(i);
        if (c == null) { buryOne(m, coins, i + 1, partial, msg); return; }
        msg.setText("Burying " + (i + 1) + " / " + coins.length() + "…");
        String txn = "bury" + (System.currentTimeMillis() % 100000);
        runBury(m, coins, i, c, txn, StateNft.replayableState(c), partial, msg);
    }

    /** Once every posted burial confirms and no coins remain, mark the row
     *  BURIED with the burial block — the gallery shows a fresh grave for
     *  50 blocks, then the collection leaves the catalogue for good. */
    private void markBuriedWhenEmpty(StateNft.Meta m) {
        final Runnable[] check = new Runnable[1];
        final int[] tries = {0};
        check[0] = () -> MintEngine.tokenCoinsBounded(node, m.tokenid, true, (coins, partial) -> {
            if (coins.length() == 0 && !partial) {
                node.cmd("block", new NodeApi.Cb() {
                    @Override public void onResult(JSONObject json) {
                        JSONObject r = json.optJSONObject("response");
                        int tip = r == null ? 0 : r.optInt("block", 0);
                        JSONObject row = LocalStore.findById(MainActivity.this, m.localId);
                        if (row == null) row = LocalStore.findByTokenid(MainActivity.this, m.tokenid);
                        if (row == null) return;
                        put(row, "phase", "BURIED");
                        put(row, "buriedat", tip);
                        LocalStore.upsert(MainActivity.this, row);
                        loadLocalCollections();
                        if (screen == Screen.COLLECTION) refreshDetail();
                    }
                    @Override public void onError(String message) {}
                });
            } else if (++tries[0] < 20) {
                main.postDelayed(check[0], 20000);
            }
        }, e -> { if (++tries[0] < 20) main.postDelayed(check[0], 20000); });
        main.postDelayed(check[0], 20000);
    }

    private void runBury(StateNft.Meta m, JSONArray coins, int i, JSONObject c, String txn,
                         boolean preserve, boolean partial, TextView msg) {
        MintEngine.postTxn(node, txn, StateNft.buryCommands(txn, m.tokenid, m.creatorPk, c, preserve),
                () -> buryOne(m, coins, i + 1, partial, msg),
                e -> {
                    if (preserve && e.toLowerCase().contains("size too large") && !m.creatorPk.isEmpty()) {
                        runBury(m, coins, i, c, txn + "s", false, partial, msg);
                    } else {
                        msg.setText("Failed: " + e);
                    }
                });
    }

    /* ================= STUDIO ================= */

    private void renderStudio() {
        setScreen(Screen.STUDIO, null);
        appbar("Studio", false, false);
        bottomNav(1);

        body.addView(studioCard("№ 1", "StateNFT Collection",
                "2–20 editions sharing one tokenid. Sealed per-coin identities, resumable mint engine, locked contract.",
                "Engine", v -> renderCreateCollection()), lpm(0, 0, 0, 14));
        body.addView(studioCard("№ 2", "Single NFT",
                "A classic Minima NFT — 1/1 or small edition. Renders in every wallet.",
                null, v -> renderCreateNft()), lpm(0, 0, 0, 14));
        body.addView(studioCard("№ 3", "Custom Token",
                "A fungible token — name, ticker, supply, decimals, icon.",
                null, v -> renderCreateToken()), lpm(0, 0, 0, 14));
        body.addView(studioCard("№ 4", "Generative Collection",
                "18 on-chain SVG style packs — Mandala to Panda Punks. Deterministic from a seed, rarity sliders, traits auto-filled.",
                "artBox", v -> renderGenerative()), lpm(0, 0, 0, 14));
        body.addView(studioCard("№ 5", "FILTR — image editor",
                "Crop, rotate, erase; 15 filter effects, presets, comic bubbles and text. Save, or send straight into a mint.",
                "filtr", v -> startActivity(new android.content.Intent(this, FiltrActivity.class))), lpm(0, 0, 0, 14));

        /* drafts shelf */
        boolean hasNftDraft = !nftName.trim().isEmpty() || !nftImage.isEmpty() || !nftTraits.isEmpty();
        boolean hasTokDraft = !tokName.trim().isEmpty() || !tokPairs.isEmpty() || !tokIcon.isEmpty();
        boolean hasCollDraft = !createName.trim().isEmpty() || anyCreateImage();
        if (hasNftDraft || hasTokDraft || hasCollDraft) {
            body.addView(sectionHead("Drafts on the bench", ""));
            if (hasCollDraft) body.addView(draftRow("Collection", createName, v -> renderCreateCollection(), v -> {
                resetCollectionDraft();
                LocalStore.clearDraft(this, "collection");
                renderStudio();
            }), lpm(0, 0, 0, 8));
            if (hasNftDraft) body.addView(draftRow("NFT", nftName, v -> renderCreateNft(), v -> {
                nftName = ""; nftDesc = ""; nftOwner = ""; nftExternal = ""; nftWeb = ""; nftUrl = "";
                nftEditions = "1"; nftImage = ""; nftTraits.clear();
                traitTypeDraft = ""; traitValueDraft = "";
                LocalStore.clearDraft(this, "nft");
                renderStudio();
            }), lpm(0, 0, 0, 8));
            if (hasTokDraft) body.addView(draftRow("Token", tokName, v -> renderCreateToken(), v -> {
                tokName = ""; tokTicker = ""; tokSupply = "1000000"; tokDecimals = "0"; tokDesc = ""; tokUrl = ""; tokIcon = "";
                tokPairs.clear();
                pairKeyDraft = ""; pairValueDraft = "";
                LocalStore.clearDraft(this, "token");
                renderStudio();
            }), lpm(0, 0, 0, 8));
        }
    }

    private boolean anyCreateImage() {
        for (String s : createImages) if (s != null && !s.isEmpty()) return true;
        return false;
    }

    private View draftRow(String kind, String name, View.OnClickListener resume, View.OnClickListener discard) {
        LinearLayout row = horizontal(Gravity.CENTER_VERTICAL);
        row.setBackground(Design.dashed(this, Design.CARD(), Design.INK()));
        row.setPadding(dp(10), dp(8), dp(6), dp(8));
        LinearLayout copy = vertical();
        copy.addView(Design.lot(this, kind + " draft"));
        copy.addView(Design.text(this, name == null || name.trim().isEmpty() ? "Untitled" : name.trim(),
                12, Design.INK(), Design.sansBold()));
        row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        TextView res = Design.button(this, "Resume", true);
        res.setOnClickListener(resume);
        row.addView(res, new LinearLayout.LayoutParams(dp(88), dp(38)));
        TextView disc = Design.text(this, "×", 18, Design.ACCENT(), Design.sansBold());
        disc.setPadding(dp(12), 0, dp(12), 0);
        disc.setClickable(true);
        disc.setOnClickListener(discard);
        row.addView(disc);
        return row;
    }

    private View studioCard(String no, String title, String descText, String pillText, View.OnClickListener click) {
        LinearLayout card = vertical();
        card.setBackground(Design.blockShadow(this, Design.CARD()));
        card.setPadding(dp(14), dp(12), dp(16), dp(15));
        card.setClickable(true);
        Design.pressable(card);
        card.setOnClickListener(click);
        card.addView(Design.lot(this, no));
        LinearLayout titleRow = horizontal(Gravity.CENTER_VERTICAL);
        titleRow.addView(Design.display(this, title, 15), new LinearLayout.LayoutParams(0, -2, 1));
        if (pillText != null) titleRow.addView(Design.pill(this, pillText, Design.PILL_LIVE));
        card.addView(titleRow, lpm(0, 4, 0, 5));
        card.addView(Design.note(this, descText));
        return card;
    }

    /* ---- collection wizard (engine-backed, restyled) ---- */

    private void renderCreateCollection() {
        setScreen(Screen.CREATE_COLLECTION, this::renderStudio);
        appbar("New Collection", true, false);
        hideNav();

        EditText name = fieldInto(body, "Name", "Trois Jours à Paris", createName);
        name.addTextChangedListener(watch(sv -> createName = sv));
        EditText desc = fieldInto(body, "Description", "Optional, 0–200 characters", createDesc);
        desc.addTextChangedListener(watch(sv -> createDesc = sv));
        EditText size = fieldInto(body, "Editions (2–20)", "12", createSize);
        size.addTextChangedListener(watch(sv -> createSize = sv));

        body.addView(Design.kicker(this, "Image source"), lpm(0, 8, 0, 6));
        LinearLayout mode = horizontal(Gravity.CENTER);
        TextView mUrl = Design.chip(this, "Hosted URLs", "url".equals(createMode));
        TextView mEmb = Design.chip(this, "Embed on-chain", "embed".equals(createMode));
        final EditText[] baseF = new EditText[1], extF = new EditText[1], iconF = new EditText[1], extUrlF = new EditText[1], webF = new EditText[1];
        mUrl.setOnClickListener(v -> { saveCollectionDraft(name, desc, size, baseF[0], extF[0], iconF[0], extUrlF[0], webF[0]); createMode = "url"; renderCreateCollection(); });
        mEmb.setOnClickListener(v -> { saveCollectionDraft(name, desc, size, baseF[0], extF[0], iconF[0], extUrlF[0], webF[0]); createMode = "embed"; renderCreateCollection(); });
        mode.addView(mUrl, weight(44, 0, 4));
        mode.addView(mEmb, weight(44, 4, 0));
        body.addView(mode, lpm(0, 0, 0, 10));

        if ("url".equals(createMode)) {
            baseF[0] = fieldInto(body, "Base URL", "https://…/collection/", createBase);
            baseF[0].addTextChangedListener(watch(sv -> createBase = sv));
            extF[0] = fieldInto(body, "Extension", ".png", createExt);
            extF[0].addTextChangedListener(watch(sv -> createExt = sv));
        } else {
            int n = clampSize(parseIntSafe(size.getText().toString()));
            ensureCreateImages(n);
            TextView refresh = Design.button(this, "Update image slots", false);
            refresh.setOnClickListener(v -> {
                saveCollectionDraft(name, desc, size, baseF[0], extF[0], iconF[0], extUrlF[0], webF[0]);
                ensureCreateImages(clampSize(parseIntSafe(size.getText().toString())));
                renderCreateCollection();
            });
            body.addView(refresh, lph(44, 0, 0, 0, 8));
            TextView pick = Design.button(this, "Choose images", true);
            pick.setOnClickListener(v -> {
                saveCollectionDraft(name, desc, size, baseF[0], extF[0], iconF[0], extUrlF[0], webF[0]);
                pickImages();
            });
            body.addView(pick, lph(48, 0, 0, 0, 10));
            body.addView(Design.lot(this, "Proof sheet — what gets sealed"), lpm(0, 0, 0, 6));
            body.addView(imageSlotGrid(), lpm(0, 0, 0, 8));
        }

        iconF[0] = fieldInto(body, "Icon URL (optional)", "https://…/icon.png — wallets show this", createIcon);
        iconF[0].addTextChangedListener(watch(sv -> createIcon = sv));
        body.addView(iconUploadRow(createIconB64, "Or embed a wallet icon (first plate is used if neither is set)",
                v -> { pendingPickContext = PICK_COLLICON; pendingBatchImages = false; launchPicker(false); },
                v -> { createIconB64 = ""; renderCreateCollection(); }), lpm(0, 4, 0, 8));
        extUrlF[0] = fieldInto(body, "External URL (optional)", "https://…", createExternal);
        extUrlF[0].addTextChangedListener(watch(sv -> createExternal = sv));
        webF[0] = fieldInto(body, "Web validate URL (optional)", "https://…/validate", createWeb);
        webF[0].addTextChangedListener(watch(sv -> createWeb = sv));

        TextView go = Design.button(this, "Mint collection", true);
        go.setOnClickListener(v -> createCollection(name, desc, size, baseF[0], extF[0], iconF[0], extUrlF[0], webF[0]));
        body.addView(go, lph(54, 0, 10, 0, 8));
        body.addView(Design.note(this, "The engine runs create → gather → split → stamp while the app is open, and resumes if interrupted."));
    }

    private int clampSize(int n) { return Math.max(2, Math.min(20, n == 0 ? 12 : n)); }

    private void createCollection(EditText name, EditText desc, EditText size, EditText base,
                                  EditText ext, EditText icon, EditText external, EditText web) {
        saveCollectionDraft(name, desc, size, base, ext, icon, external, web);
        String n = name.getText().toString().trim();
        String d = desc.getText().toString().trim();
        String s = size.getText().toString().trim();
        String bs = base == null ? "" : base.getText().toString().trim();
        String x = ext == null ? ".png" : ext.getText().toString().trim();
        String ic = icon.getText().toString().trim();
        String ex = external.getText().toString().trim();
        String w = web.getText().toString().trim();
        if (n.isEmpty() || n.length() > 40) { toast("Name must be 1–40 characters"); return; }
        if (d.length() > 200) { toast("Description must be 0–200 characters"); return; }
        int count = parseIntSafe(s);
        if (count < 2 || count > 20) { toast("Editions must be 2–20"); return; }
        if ("url".equals(createMode) && !bs.startsWith("https://")) { toast("Base URL must start https://"); return; }
        if (x.isEmpty()) x = ".png";
        if (!validCmdUrl(ic) || !validCmdUrl(ex) || !validCmdUrl(w) || !validCmdUrl(bs)) {
            toast("URLs must not contain spaces, quotes or semicolons");
            return;
        }
        final String extValue = x;
        if ("embed".equals(createMode)) {
            ensureCreateImages(count);
            for (int i = 0; i < count; i++) {
                if (createImages[i] == null || createImages[i].isEmpty()) {
                    toast("Image missing for lot " + (i + 1));
                    return;
                }
            }
        }
        final String bsF = bs, icF = ic, exF = ex, wF = w, nF = n, dF = d;
        final int countF = count;
        node.cmd("getaddress", new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONObject r = json.optJSONObject("response");
                if (r == null) { toast("getaddress failed"); return; }
                StateNft.Meta m = new StateNft.Meta();
                m.localId = LocalStore.nextId(MainActivity.this);
                m.name = nF;
                m.description = dF;
                m.mode = createMode;
                m.size = countF;
                m.base = "url".equals(createMode) ? bsF : "";
                m.ext = extValue;
                String leadImg = "embed".equals(createMode) && createImages.length > 0 ? createImages[0] : "";
                m.icon = !icF.isEmpty() ? icF
                        : !createIconB64.isEmpty() ? createIconB64
                        : leadImg.isEmpty() ? ""
                        : "image/svg+xml".equals(ImageTools.mimeOf(leadImg))
                            ? (leadImg.length() <= ImageTools.ICON_BUDGET ? leadImg : "")
                            // slot-1 fallback: square-crop so the wallet tile fills edge-to-edge
                            : ImageTools.iconFromBase64(leadImg, ImageTools.ICON_BUDGET);
                m.externalUrl = exF;
                m.webvalidate = wF;
                m.creatorAddr = r.optString("address");
                m.creatorPk = r.optString("publickey");
                m.phase = "CREATE";
                m.creator = true;
                m.created = true;
                JSONArray items = new JSONArray();
                for (int i = 1; i <= countF; i++) {
                    JSONObject it = new JSONObject();
                    put(it, "idx", i);
                    put(it, "image", "embed".equals(createMode) ? createImages[i - 1] : (bsF + i + extValue));
                    items.put(it);
                }
                /* Final exact gate: name/desc/icon/traits are all known here.
                 * Refuse to create a collection whose lots could never leave
                 * the wallet (joint transfer budget - the "Random" lesson). */
                if ("embed".equals(createMode)) {
                    int maxImg = 0;
                    for (String im : createImages) if (im != null && im.length() > maxImg) maxImg = im.length();
                    int defA = MintEngine.defActualLen(m, collectionItemTraits);
                    String jointErr = MintEngine.jointBudgetError(defA, maxImg);
                    if (jointErr != null) { toast(jointErr); return; }
                }
                JSONObject row = MintEngine.rowFromMeta(m, items);
                if (collectionItemTraits != null && collectionItemTraits.length() > 0
                        && "embed".equals(createMode)) {
                    put(row, "itemtraits", collectionItemTraits);
                }
                LocalStore.upsert(MainActivity.this, row);
                resetCollectionDraft();
                toast("Minting started");
                engageEngine();
                loadLocalCollections();
                openCollection(findCollectionByLocalId(m.localId, m));
            }
            @Override public void onError(String message) { toast(message); }
        });
    }

    /* ---- single NFT (NFTwallet-compatible metadata) ---- */

    private void renderCreateNft() {
        setScreen(Screen.CREATE_NFT, this::renderStudio);
        appbar("New NFT", true, false);
        hideNav();

        body.addView(Design.kicker(this, "Artwork"), lpm(0, 0, 0, 6));
        LinearLayout modeRow = horizontal(Gravity.CENTER);
        TextView mEmb = Design.chip(this, "Embed image", nftEmbed);
        TextView mUrl = Design.chip(this, "Hosted URL", !nftEmbed);
        mEmb.setOnClickListener(v -> { nftEmbed = true; renderCreateNft(); });
        mUrl.setOnClickListener(v -> { nftEmbed = false; renderCreateNft(); });
        modeRow.addView(mEmb, weight(44, 0, 4));
        modeRow.addView(mUrl, weight(44, 4, 0));
        body.addView(modeRow, lpm(0, 0, 0, 10));

        if (nftEmbed) {
            FrameLayout frame = new FrameLayout(this);
            frame.setBackground(Design.blockShadow(this, Design.CARD()));
            ImageView art = new ImageView(this);
            art.setScaleType(ImageView.ScaleType.CENTER_CROP);
            art.setImageBitmap(Identicon.forToken("nftdraft", 500));
            if (!nftImage.isEmpty()) ImageLoader.loadOver(this, ImageTools.dataUri(nftImage), art);
            FrameLayout.LayoutParams alp = new FrameLayout.LayoutParams(-1, dp(190));
            alp.setMargins(0, 0, dp(3), dp(3));
            frame.addView(art, alp);
            frame.setClickable(true);
            frame.setOnClickListener(v -> pickNftImage());
            body.addView(frame, lpm(0, 0, 0, 6));
            body.addView(Design.note(this, nftImage.isEmpty() ? "Tap the plate to choose an image." : "Tap to replace. This exact image is sealed on-chain."), lpm(0, 0, 0, 8));
            if (!nftImage.isEmpty()) {
                if ("image/svg+xml".equals(ImageTools.mimeOf(nftImage))) {
                    body.addView(Design.note(this, "Vector plate — sealed as SVG, razor-sharp at every size."), lpm(0, 0, 0, 10));
                } else {
                    TextView edit = Design.button(this, "Open the plate room — crop · rotate · tone", false);
                    edit.setOnClickListener(v -> showEditor(nftImage, ImageTools.ARTIMAGE_BUDGET, edited -> {
                        nftImage = edited;
                        renderCreateNft();
                    }));
                    body.addView(edit, lph(46, 0, 0, 0, 10));
                }
            }
        } else {
            EditText urlF = fieldInto(body, "Image URL", "https://… or ipfs://…", nftUrl);
            urlF.addTextChangedListener(watch(sv -> nftUrl = sv));
        }

        EditText nameF = fieldInto(body, "Title", "Nocturne 04", nftName);
        nameF.addTextChangedListener(watch(sv -> nftName = sv));
        EditText descF = fieldInto(body, "Description", "Optional", nftDesc);
        descF.addTextChangedListener(watch(sv -> nftDesc = sv));
        EditText ownerF = fieldInto(body, "Artist / owner", "Your name in the record", nftOwner);
        ownerF.addTextChangedListener(watch(sv -> nftOwner = sv));
        EditText edF = fieldInto(body, "Editions", "1", nftEditions);
        edF.addTextChangedListener(watch(sv -> nftEditions = sv));
        EditText extF = fieldInto(body, "External URL (optional)", "https://…", nftExternal);
        extF.addTextChangedListener(watch(sv -> nftExternal = sv));
        EditText webF = fieldInto(body, "Web validate URL (optional)", "https://…/validate", nftWeb);
        webF.addTextChangedListener(watch(sv -> nftWeb = sv));

        LinearLayout signRow = horizontal(Gravity.CENTER_VERTICAL);
        TextView signChip = Design.chip(this, nftSign ? "Signed as creator ✓" : "Unsigned", nftSign);
        signChip.setOnClickListener(v -> { nftSign = !nftSign; renderCreateNft(); });
        signRow.addView(signChip, new LinearLayout.LayoutParams(-2, -2));
        body.addView(signRow, lpm(0, 4, 0, 12));

        /* traits — OpenSea-style attributes */
        body.addView(sectionHead("Traits", nftTraits.size() + ""));
        for (int i = 0; i < nftTraits.size(); i++) {
            final int idx = i;
            String[] t = nftTraits.get(i);
            LinearLayout row = horizontal(Gravity.CENTER_VERTICAL);
            row.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1.5f));
            row.setPadding(dp(10), dp(7), dp(6), dp(7));
            TextView type = Design.text(this, t[0].toUpperCase(), 9.5f, Design.DIM(), Design.sansBold());
            type.setLetterSpacing(0.12f);
            row.addView(type, new LinearLayout.LayoutParams(0, -2, 1));
            row.addView(Design.text(this, t[1], 12, Design.INK(), Design.sansBold()), new LinearLayout.LayoutParams(0, -2, 1));
            TextView del = Design.text(this, "×", 16, Design.ACCENT(), Design.sansBold());
            del.setPadding(dp(10), 0, dp(10), 0);
            del.setClickable(true);
            del.setOnClickListener(v -> { nftTraits.remove(idx); renderCreateNft(); });
            row.addView(del);
            body.addView(row, lpm(0, 0, 0, 6));
        }
        LinearLayout addRow = horizontal(Gravity.CENTER_VERTICAL);
        EditText tType = input("Trait — e.g. District");
        tType.setText(traitTypeDraft);
        tType.addTextChangedListener(watch(sv -> traitTypeDraft = sv));
        EditText tVal = input("Value — e.g. Rive Gauche");
        tVal.setText(traitValueDraft);
        tVal.addTextChangedListener(watch(sv -> traitValueDraft = sv));
        addRow.addView(tType, weight(46, 0, 3));
        addRow.addView(tVal, weight(46, 3, 3));
        TextView addBtn = Design.button(this, "+", false);
        addBtn.setOnClickListener(v -> {
            if (traitTypeDraft.trim().isEmpty() || traitValueDraft.trim().isEmpty()) { toast("Both trait and value needed"); return; }
            if (nftTraits.size() >= 12) { toast("12 traits maximum"); return; }
            nftTraits.add(new String[]{ traitTypeDraft.trim(), traitValueDraft.trim() });
            traitTypeDraft = ""; traitValueDraft = "";
            renderCreateNft();
        });
        addRow.addView(addBtn, new LinearLayout.LayoutParams(dp(46), dp(46)));
        body.addView(addRow, lpm(0, 2, 0, 12));

        /* seal preview: wallet card + metadata record */
        body.addView(sectionHead("Before the seal", ""));
        LinearLayout prev = horizontal(Gravity.CENTER_VERTICAL);
        prev.setBackground(Design.blockShadow(this, Design.CARD()));
        prev.setPadding(dp(10), dp(10), dp(12), dp(12));
        ImageView pIcon = new ImageView(this);
        pIcon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        pIcon.setImageBitmap(Identicon.forToken("nftdraft", 160));
        String pUrl = nftEmbed ? (nftImage.isEmpty() ? null : ImageTools.dataUri(nftImage))
                : IconResolver.resolve(nftUrl.trim());
        if (pUrl != null) ImageLoader.loadOver(this, pUrl, pIcon);
        prev.addView(pIcon, new LinearLayout.LayoutParams(dp(52), dp(52)));
        LinearLayout pCopy = vertical();
        pCopy.setPadding(dp(10), 0, 0, 0);
        pCopy.addView(Design.text(this, nftName.trim().isEmpty() ? "Untitled" : nftName.trim(), 13, Design.INK(), Design.sansBold()));
        pCopy.addView(Design.note(this, "ed. " + (nftEditions.trim().isEmpty() ? "1" : nftEditions.trim())
                + (nftOwner.trim().isEmpty() ? "" : " · " + nftOwner.trim())
                + (nftTraits.isEmpty() ? "" : " · " + nftTraits.size() + " traits")));
        prev.addView(pCopy, new LinearLayout.LayoutParams(0, -2, 1));
        prev.addView(Design.pill(this, "NFT", Design.PILL_DONE));
        body.addView(prev, lpm(0, 0, 0, 8));
        TextView metaDump = Design.text(this, previewNftJson(), 9.5f, Design.DIM(), Design.mono());
        metaDump.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1));
        metaDump.setPadding(dp(10), dp(8), dp(10), dp(8));
        body.addView(metaDump, lpm(0, 0, 0, 12));

        TextView go = Design.button(this, nftBusy ? "Minting…" : "Seal this NFT", true);
        go.setEnabled(!nftBusy);
        go.setOnClickListener(v -> mintNft(go));
        body.addView(go, lph(54, 0, 0, 0, 8));
        body.addView(Design.note(this, "Minted with the wallet-standard metadata — it will render in the NFT Wallet, the MiniDapp and beyond."));
    }

    private String previewNftJson() {
        String url = nftEmbed ? (nftImage.isEmpty() ? "<artimage>…</artimage>" : "<artimage>" + nftImage.length() + " chars</artimage>")
                : nftUrl.trim();
        JSONObject meta = StateNft.nftMetadata(nftName.trim().isEmpty() ? "Untitled" : nftName.trim(),
                nftDesc.trim(), url, nftOwner.trim(), nftExternal.trim(), nftWeb.trim(),
                StateNft.traitsToAttributes(nftTraits));
        try { return meta.toString(2); } catch (Exception e) { return meta.toString(); }
    }

    private void mintNft(TextView go) {
        if (nftBusy) return;
        String n = nftName.trim();
        if (n.isEmpty() || n.length() > 60) { toast("Title must be 1–60 characters"); return; }
        int editions = parseIntSafe(nftEditions.trim().isEmpty() ? "1" : nftEditions.trim());
        if (editions < 1 || editions > 1000) { toast("Editions must be 1–1000"); return; }
        String url;
        if (nftEmbed) {
            if (nftImage.isEmpty()) { toast("Choose an artwork image first"); return; }
            url = "<artimage>" + nftImage + "</artimage>";
        } else {
            url = nftUrl.trim();
            if (url.isEmpty() || !validCmdUrl(url)) { toast("Image URL required — no spaces, quotes or semicolons"); return; }
        }
        if (!validCmdUrl(nftExternal.trim()) || !validCmdUrl(nftWeb.trim())) { toast("URLs must not contain spaces, quotes or semicolons"); return; }
        nftBusy = true;
        go.setText("MINTING…");
        NodeApi.Cb fin = new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                nftBusy = false;
                if (!json.optBoolean("status", false)) {
                    toast("Mint failed: " + json.optString("error", "node refused"));
                    renderCreateNft();
                    return;
                }
                toast("NFT minted — it appears in the gallery once confirmed");
                nftName = ""; nftDesc = ""; nftImage = ""; nftUrl = ""; nftExternal = ""; nftWeb = ""; nftEditions = "1";
                nftTraits.clear();
                traitTypeDraft = ""; traitValueDraft = "";
                LocalStore.clearDraft(MainActivity.this, "nft");
                renderGallery();
            }
            @Override public void onError(String message) { nftBusy = false; toast(message); renderCreateNft(); }
        };
        final org.json.JSONArray attrs = StateNft.traitsToAttributes(nftTraits);
        if (nftSign) {
            node.cmd("getaddress", new NodeApi.Cb() {
                @Override public void onResult(JSONObject json) {
                    JSONObject r = json.optJSONObject("response");
                    String pk = r == null ? "" : r.optString("publickey", "");
                    node.cmd(StateNft.nftCreateCommand(n, nftDesc.trim(), url, nftOwner.trim(),
                            nftExternal.trim(), nftWeb.trim(), attrs, editions, pk), fin);
                }
                @Override public void onError(String message) { nftBusy = false; toast(message); renderCreateNft(); }
            });
        } else {
            node.cmd(StateNft.nftCreateCommand(n, nftDesc.trim(), url, nftOwner.trim(),
                    nftExternal.trim(), nftWeb.trim(), attrs, editions, ""), fin);
        }
    }

    /* ---- custom token ---- */

    private void renderCreateToken() {
        setScreen(Screen.CREATE_TOKEN, this::renderStudio);
        appbar("New Token", true, false);
        hideNav();

        EditText nameF = fieldInto(body, "Name", "EuroBuddha Coin", tokName);
        nameF.addTextChangedListener(watch(sv -> tokName = sv));
        EditText tickF = fieldInto(body, "Ticker", "EUROB", tokTicker);
        tickF.addTextChangedListener(watch(sv -> tokTicker = sv));
        EditText supF = fieldInto(body, "Total supply", "1000000", tokSupply);
        supF.addTextChangedListener(watch(sv -> tokSupply = sv));
        EditText decF = fieldInto(body, "Decimals (0–16)", "0", tokDecimals);
        decF.addTextChangedListener(watch(sv -> tokDecimals = sv));
        EditText descF = fieldInto(body, "Description (optional)", "", tokDesc);
        descF.addTextChangedListener(watch(sv -> tokDesc = sv));
        EditText urlF = fieldInto(body, "Icon URL (optional)", "https://…/icon.png", tokUrl);
        urlF.addTextChangedListener(watch(sv -> tokUrl = sv));
        body.addView(iconUploadRow(tokIcon, "Wallet icon — hosted URL above beats an upload",
                v -> { pendingPickContext = PICK_TOKICON; pendingBatchImages = false; launchPicker(false); },
                v -> { tokIcon = ""; renderCreateToken(); }), lpm(0, 4, 0, 8));

        /* custom metadata pairs */
        body.addView(sectionHead("Custom record fields", tokPairs.size() + ""));
        for (int i = 0; i < tokPairs.size(); i++) {
            final int idx = i;
            String[] p = tokPairs.get(i);
            LinearLayout row = horizontal(Gravity.CENTER_VERTICAL);
            row.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1.5f));
            row.setPadding(dp(10), dp(7), dp(6), dp(7));
            TextView key = Design.text(this, p[0].toUpperCase(), 9.5f, Design.DIM(), Design.sansBold());
            key.setLetterSpacing(0.12f);
            row.addView(key, new LinearLayout.LayoutParams(0, -2, 1));
            row.addView(Design.text(this, p[1], 12, Design.INK(), Design.sansBold()), new LinearLayout.LayoutParams(0, -2, 1));
            TextView del = Design.text(this, "×", 16, Design.ACCENT(), Design.sansBold());
            del.setPadding(dp(10), 0, dp(10), 0);
            del.setClickable(true);
            del.setOnClickListener(v -> { tokPairs.remove(idx); renderCreateToken(); });
            row.addView(del);
            body.addView(row, lpm(0, 0, 0, 6));
        }
        LinearLayout addRow = horizontal(Gravity.CENTER_VERTICAL);
        EditText pKey = input("Field — e.g. website");
        pKey.setText(pairKeyDraft);
        pKey.addTextChangedListener(watch(sv -> pairKeyDraft = sv));
        EditText pVal = input("Value");
        pVal.setText(pairValueDraft);
        pVal.addTextChangedListener(watch(sv -> pairValueDraft = sv));
        addRow.addView(pKey, weight(46, 0, 3));
        addRow.addView(pVal, weight(46, 3, 3));
        TextView addBtn = Design.button(this, "+", false);
        addBtn.setOnClickListener(v -> {
            String k = pairKeyDraft.trim();
            if (k.isEmpty() || pairValueDraft.trim().isEmpty()) { toast("Both field and value needed"); return; }
            if (StateNft.RESERVED_KEYS.contains(k.toLowerCase())) { toast("'" + k + "' is a reserved field"); return; }
            if (tokPairs.size() >= 10) { toast("10 custom fields maximum"); return; }
            tokPairs.add(new String[]{ k, pairValueDraft.trim() });
            pairKeyDraft = ""; pairValueDraft = "";
            renderCreateToken();
        });
        addRow.addView(addBtn, new LinearLayout.LayoutParams(dp(46), dp(46)));
        body.addView(addRow, lpm(0, 2, 0, 12));

        /* record preview */
        body.addView(sectionHead("The record", ""));
        TextView metaDump = Design.text(this, previewTokenJson(), 9.5f, Design.DIM(), Design.mono());
        metaDump.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1));
        metaDump.setPadding(dp(10), dp(8), dp(10), dp(8));
        body.addView(metaDump, lpm(0, 0, 0, 12));

        LinearLayout warn = vertical();
        warn.setBackground(Design.ruled(this, Design.CARD(), Design.ACCENT(), 2f));
        warn.setPadding(dp(12), dp(10), dp(12), dp(12));
        warn.addView(Design.text(this, "SUPPLY IS PERMANENT", 12, Design.ACCENT(), Design.sansBold()));
        warn.addView(Design.note(this, "Total supply and decimals cannot be changed after minting."), lpm(0, 3, 0, 0));
        body.addView(warn, lpm(0, 6, 0, 14));

        TextView go = Design.button(this, tokBusy ? "Minting…" : "Mint token", true);
        go.setEnabled(!tokBusy);
        go.setOnClickListener(v -> mintToken(go));
        body.addView(go, lph(54, 0, 0, 0, 0));
    }

    private void mintToken(TextView go) {
        if (tokBusy) return;
        String n = tokName.trim();
        if (n.isEmpty() || n.length() > 40) { toast("Name must be 1–40 characters"); return; }
        long supply = 0;
        try { supply = Long.parseLong(tokSupply.trim()); } catch (Exception ignored) {}
        if (supply < 1) { toast("Supply must be a positive whole number"); return; }
        int dec = parseIntSafe(tokDecimals.trim());
        if (dec < 0 || dec > 16) { toast("Decimals must be 0–16"); return; }
        if (!validCmdUrl(tokUrl.trim())) { toast("Icon URL must not contain spaces, quotes or semicolons"); return; }
        tokBusy = true;
        go.setText("MINTING…");
        String iconValue = !tokUrl.trim().isEmpty() ? tokUrl.trim()
                : (!tokIcon.isEmpty() ? "<artimage>" + tokIcon : "");
        node.cmd(StateNft.tokenCreateCommand(n, tokDesc.trim(), tokTicker.trim(), iconValue, supply, dec, tokPairs),
                new NodeApi.Cb() {
                    @Override public void onResult(JSONObject json) {
                        tokBusy = false;
                        if (!json.optBoolean("status", false)) {
                            toast("Mint failed: " + json.optString("error", "node refused"));
                            renderCreateToken();
                            return;
                        }
                        toast("Token minted — appears once confirmed");
                        tokName = ""; tokTicker = ""; tokDesc = ""; tokUrl = ""; tokIcon = "";
                        tokPairs.clear();
                        pairKeyDraft = ""; pairValueDraft = "";
                        LocalStore.clearDraft(MainActivity.this, "token");
                        renderGallery();
                    }
                    @Override public void onError(String message) { tokBusy = false; toast(message); renderCreateToken(); }
                });
    }

    private String previewTokenJson() {
        String iconValue = !tokUrl.trim().isEmpty() ? tokUrl.trim()
                : (!tokIcon.isEmpty() ? "<artimage>" + tokIcon.length() + " chars" : "");
        JSONObject meta = StateNft.tokenMeta(tokName.trim().isEmpty() ? "Unnamed" : tokName.trim(),
                tokDesc.trim(), tokTicker.trim(), iconValue, tokPairs);
        try { return meta.toString(2); } catch (Exception e) { return meta.toString(); }
    }

    /* ================= GENERATIVE ================= */

    private void renderGenerative() {
        setScreen(Screen.CREATE_GENERATIVE, this::renderStudio);
        appbar("Generative", true, false);
        hideNav();
        if (!artDraftLoaded) { artDraftLoaded = true; artLoadDraft(); }

        body.addView(Design.lot(this, "The Generator — 19 on-chain SVG style packs"));
        body.addView(Design.note(this, "Deterministic: the seed and style reproduce every "
                + "plate byte-for-byte — the same design mints identically in the MiniDapp."), lpm(0, 4, 0, 12));

        final TextView warm = Design.note(this, "Warming up the art engine…");
        body.addView(warm, lpm(0, 0, 0, 12));

        ArtStudio.with(this, studio -> {
            if (screen != Screen.CREATE_GENERATIVE) return;
            if (ART_STYLE_LIST == null) {
                studio.styles(list -> {
                    ART_STYLE_LIST = list;
                    if (screen == Screen.CREATE_GENERATIVE) renderGenerative();
                });
                return;
            }
            JSONObject cfg = artCfgs.get(artStyle);
            if (cfg == null) {
                studio.defaultConfig(artStyle, c2 -> {
                    artCfgs.put(artStyle, c2);
                    artMigrated.add(artStyle);
                    if (screen == Screen.CREATE_GENERATIVE) renderGenerative();
                });
                return;
            }
            /* saved drafts age across releases — rebuild on the current slot
             * set once per process so new slots (e.g. Render) actually show */
            if (!artMigrated.contains(artStyle)) {
                artMigrated.add(artStyle);
                studio.migrate(cfg, m -> {
                    if (m != null && m.length() > 0) { artCfgs.put(artStyle, m); artSaveDraft(); }
                    if (screen == Screen.CREATE_GENERATIVE) renderGenerative();
                });
                return;
            }
            body.removeView(warm);
            buildArtStudioUi(studio, cfg);
        });
    }

    private void buildArtStudioUi(ArtStudio studio, JSONObject cfg) {
        /* ---- style picker ---- */
        LinearLayout strip = horizontal(Gravity.TOP);
        for (int i = 0; i < ART_STYLE_LIST.length(); i++) {
            JSONObject st = ART_STYLE_LIST.optJSONObject(i);
            if (st == null) continue;
            final String key = st.optString("key");
            LinearLayout cell = vertical();
            cell.setGravity(Gravity.CENTER_HORIZONTAL);
            cell.setPadding(0, 0, dp(8), 0);
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            boolean active = key.equals(artStyle);
            iv.setBackground(Design.ruled(this, Design.CARD(), active ? Design.ACCENT() : Design.INK(),
                    active ? 2.5f : 1.5f));
            iv.setPadding(dp(2), dp(2), dp(2), dp(2));
            android.graphics.Bitmap tb = ART_THUMBS.get(key);
            if (tb != null) iv.setImageBitmap(tb);
            else studio.thumb(key, svg -> new Thread(() -> {
                android.graphics.Bitmap b = ArtStudio.svgBitmap(svg, dp(72));
                runOnUiThread(() -> {
                    if (b != null) ART_THUMBS.put(key, b);
                    iv.setImageBitmap(b);
                });
            }).start());
            iv.setClickable(true);
            iv.setOnClickListener(v -> {
                artStyle = key;
                artItems = new JSONArray();
                artPreviews.clear();
                artOpenSlots.clear();
                artSaveDraft();
                renderGenerative();
            });
            cell.addView(iv, new LinearLayout.LayoutParams(dp(72), dp(72)));
            TextView nm = Design.text(this, st.optString("label"), 8.5f,
                    active ? Design.ACCENT() : Design.INK(), Design.sansBold());
            nm.setSingleLine(true);
            nm.setGravity(Gravity.CENTER);
            cell.addView(nm, new LinearLayout.LayoutParams(dp(76), -2));
            strip.addView(cell);
        }
        HorizontalScroll styleScroll = new HorizontalScroll(this);
        styleScroll.addView(strip);
        body.addView(styleScroll, lpm(0, 0, 0, 14));

        /* ---- photo intake (Photo Cartoon pack only) ---- */
        if ("photo".equals(artStyle)) {
            LinearLayout card = lotCard();
            card.addView(Design.display(this, "Photo Cartoon", 13));
            card.addView(Design.note(this, artPhotoLoaded
                    ? "Photo loaded — every plate derives from its cartoon. "
                      + "The original never leaves the phone."
                    : "Pick a photo: it is cartoonized on-device (48px, 8 flat "
                      + "colors) and becomes the base for every plate. Without "
                      + "one the pack draws a placeholder bust that never mints."));
            LinearLayout row = horizontal(Gravity.CENTER_VERTICAL);
            TextView pick = Design.button(this,
                    artPhotoLoaded ? "Change photo" : "Choose photo", true);
            pick.setOnClickListener(v -> {
                pendingPickContext = PICK_ARTPHOTO;
                pendingBatchImages = false;
                launchPicker(false);
            });
            row.addView(pick, weight(46, 0, artPhotoLoaded ? 4 : 0));
            if (artPhotoLoaded) {
                TextView clear = Design.button(this, "Clear", false);
                clear.setOnClickListener(v -> ArtStudio.with(this, s ->
                        s.clearPhoto(() -> {
                            artPhotoLoaded = false;
                            ART_THUMBS.remove("photo");
                            artItems = new JSONArray();
                            artPreviews.clear();
                            if (screen == Screen.CREATE_GENERATIVE) renderGenerative();
                        })));
                row.addView(clear, weight(46, 4, 0));
            }
            card.addView(row, lpm(0, 8, 0, 0));
            body.addView(card, lpm(0, 0, 0, 14));
        }

        /* ---- seed ---- */
        body.addView(Design.lot(this, "Collection seed — same seed, same art, forever"));
        LinearLayout seedRow = horizontal(Gravity.CENTER_VERTICAL);
        EditText seed = input("atelier-genesis");
        seed.setText(artSeed);
        seed.addTextChangedListener(watch(sv -> {
            artSeed = sv.trim();
            if (artItems.length() > 0) {
                // the sheet no longer derives from the seed on display — retire it
                artItems = new JSONArray();
                artPreviews.clear();
                if (artSheetBox != null) artSheetBox.setVisibility(android.view.View.GONE);
            }
            body.removeCallbacks(artSaveRunnable);
            body.postDelayed(artSaveRunnable, 400);
        }));
        seedRow.addView(seed, weight(46, 0, 4));
        TextView dice = Design.button(this, "🎲", false);
        dice.setOnClickListener(v -> {
            String chars = "abcdefghjkmnpqrstuvwxyz23456789";
            StringBuilder sb = new StringBuilder("atelier-");
            java.util.Random r = new java.util.Random();
            for (int i = 0; i < 10; i++) sb.append(chars.charAt(r.nextInt(chars.length())));
            artSeed = sb.toString();
            artItems = new JSONArray();
            artPreviews.clear();
            artSaveDraft();
            renderGenerative();
        });
        seedRow.addView(dice, new LinearLayout.LayoutParams(dp(56), dp(46)));
        body.addView(seedRow, lpm(0, 6, 0, 14));

        /* ---- trait pool & rarity ---- */
        body.addView(sectionHead("Trait pool & rarity", ""));
        JSONArray slots = cfg.optJSONArray("slots");
        if (slots != null) for (int i = 0; i < slots.length(); i++) {
            final JSONObject slot = slots.optJSONObject(i);
            if (slot == null) continue;
            final String slotKey = slot.optString("key", "s" + i);
            LinearLayout card = lotCard();
            LinearLayout head = horizontal(Gravity.CENTER_VERTICAL);
            LinearLayout copy = vertical();
            copy.addView(Design.display(this, slot.optString("label", slotKey), 13));
            JSONArray vs = slot.optJSONArray("variants");
            int on = 0, total = vs == null ? 0 : vs.length();
            if (vs != null) for (int k = 0; k < total; k++) {
                JSONObject v2 = vs.optJSONObject(k);
                if (v2 != null && v2.optBoolean("on", true) && v2.optInt("weight", 0) > 0) on++;
            }
            copy.addView(Design.note(this, on + "/" + total + " on"));
            head.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
            boolean open = artOpenSlots.contains(slotKey);
            TextView arrow = Design.text(this, open ? "▴" : "▾", 14, Design.ACCENT(), Design.sansBold());
            head.addView(arrow);
            head.setClickable(true);
            head.setOnClickListener(v -> {
                if (!artOpenSlots.remove(slotKey)) artOpenSlots.add(slotKey);
                renderGenerative();
            });
            card.addView(head);

            if (open && vs != null) {
                int weightTotal = 0;
                for (int k = 0; k < vs.length(); k++) {
                    JSONObject v2 = vs.optJSONObject(k);
                    if (v2 != null && v2.optBoolean("on", true)) weightTotal += v2.optInt("weight", 0);
                }
                final int wt = Math.max(1, weightTotal);
                for (int k = 0; k < vs.length(); k++) {
                    final JSONObject variant = vs.optJSONObject(k);
                    if (variant == null) continue;
                    LinearLayout row = horizontal(Gravity.CENTER_VERTICAL);
                    android.widget.CheckBox cb = new android.widget.CheckBox(this);
                    cb.setChecked(variant.optBoolean("on", true));
                    cb.setOnCheckedChangeListener((b2, checked) -> {
                        put(variant, "on", checked);
                        artItems = new JSONArray();
                        artSaveDraft();
                        renderGenerative();
                    });
                    row.addView(cb);
                    TextView nm = Design.text(this, variant.optString("name"), 11.5f, Design.INK(), Design.sans());
                    nm.setSingleLine(true);
                    row.addView(nm, new LinearLayout.LayoutParams(dp(96), -2));
                    android.widget.SeekBar sb = new android.widget.SeekBar(this);
                    sb.setMax(100);
                    sb.setProgress(Math.min(100, variant.optInt("weight", 0)));
                    final TextView pct = Design.text(this,
                            pctText(variant, wt), 9.5f, Design.DIM(), Design.mono());
                    sb.setOnSeekBarChangeListener(new android.widget.SeekBar.OnSeekBarChangeListener() {
                        @Override public void onProgressChanged(android.widget.SeekBar s2, int p2, boolean fromUser) {
                            if (!fromUser) return;
                            put(variant, "weight", p2);
                            pct.setText(pctText(variant, wt));
                        }
                        @Override public void onStartTrackingTouch(android.widget.SeekBar s2) {}
                        @Override public void onStopTrackingTouch(android.widget.SeekBar s2) {
                            artItems = new JSONArray();
                            artSaveDraft();
                            renderGenerative();
                        }
                    });
                    row.addView(sb, new LinearLayout.LayoutParams(0, -2, 1));
                    pct.setGravity(Gravity.END);
                    row.addView(pct, new LinearLayout.LayoutParams(dp(44), -2));
                    card.addView(row, lpm(0, 2, 0, 0));
                }
            }
            body.addView(card, lpm(0, 0, 0, 8));
        }

        LinearLayout shuffleRow = horizontal(Gravity.CENTER_VERTICAL);
        TextView shufR = Design.button(this, "🎲 Rarity", false);
        shufR.setOnClickListener(v -> { artShuffle(cfg, false); });
        shuffleRow.addView(shufR, weight(44, 0, 4));
        TextView shufP = Design.button(this, "🎲 Traits", false);
        shufP.setOnClickListener(v -> { artShuffle(cfg, true); });
        shuffleRow.addView(shufP, weight(44, 4, 4));
        TextView reset = Design.button(this, "Reset", false);
        reset.setOnClickListener(v -> {
            artCfgs.remove(artStyle);
            artItems = new JSONArray();
            artPreviews.clear();
            artSaveDraft();
            renderGenerative();
        });
        shuffleRow.addView(reset, weight(44, 4, 0));
        body.addView(shuffleRow, lpm(0, 4, 0, 6));

        final TextView capNote = Design.note(this, "");
        body.addView(capNote, lpm(0, 0, 0, 14));
        studio.capacity(cfg, n -> capNote.setText("trait space: "
                + String.format(Locale.US, "%,d", n) + " distinct combinations"));

        /* ---- proof sheet ---- */
        body.addView(sectionHead("Proof sheet", artItems.length() == 0 ? "" : artItems.length() + " plates"));
        LinearLayout genRow = horizontal(Gravity.CENTER_VERTICAL);
        EditText count = input("12");
        count.setText(genCount);
        count.addTextChangedListener(watch(sv -> genCount = sv));
        genRow.addView(count, new LinearLayout.LayoutParams(dp(70), dp(46)));
        TextView gen = Design.button(this, genBusy ? "Drawing…" : "Generate", true);
        gen.setEnabled(!genBusy);
        gen.setOnClickListener(v -> artGenerate(studio, cfg));
        genRow.addView(gen, weight(46, 8, 0));
        body.addView(genRow, lpm(0, 0, 0, 10));

        artSheetBox = vertical();
        body.addView(artSheetBox);
        if (artItems.length() > 0) {
            artSheetBox.addView(Design.note(this, "Tap a plate for its traits and rarity."), lpm(0, 0, 0, 8));
            int cols = 3;
            LinearLayout row = null;
            for (int i = 0; i < artItems.length(); i++) {
                final int gi = i;
                final JSONObject item = artItems.optJSONObject(i);
                if (i % cols == 0) {
                    row = horizontal(Gravity.TOP);
                    artSheetBox.addView(row, lpm(0, 0, 0, 8));
                }
                FrameLayout tile = new FrameLayout(this);
                tile.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1.5f));
                ImageView iv = new ImageView(this);
                iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
                if (i < artPreviews.size() && artPreviews.get(i) != null) iv.setImageBitmap(artPreviews.get(i));
                FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(-1, -1);
                int bb = dp(3);
                ilp.setMargins(bb, bb, bb, bb);
                tile.addView(iv, ilp);
                TextView tag = Design.pill(this, String.format(Locale.US, "%02d", i + 1), Design.PILL_DONE);
                FrameLayout.LayoutParams tagLp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
                tagLp.setMargins(dp(5), 0, 0, dp(5));
                tile.addView(tag, tagLp);
                tile.setClickable(true);
                tile.setOnClickListener(v -> showArtItem(item, gi));
                LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, dp(104), 1);
                if (i % cols != 0) tlp.leftMargin = dp(8);
                row.addView(tile, tlp);
            }
            int rem = artItems.length() % cols;
            if (rem != 0 && row != null) {
                for (int i = 0; i < cols - rem; i++) {
                    row.addView(new Space(this), new LinearLayout.LayoutParams(0, 1, 1){{ leftMargin = dp(8); }});
                }
            }
            TextView use = Design.button(this, genBusy ? "Composing…" : "Send to collection wizard", true);
            use.setEnabled(!genBusy);
            use.setOnClickListener(v -> sendArtToCollection());
            artSheetBox.addView(use, lph(52, 0, 12, 0, 8));
        }
    }

    private String pctText(JSONObject variant, int weightTotal) {
        if (!variant.optBoolean("on", true) || weightTotal <= 0) return "0%";
        return (Math.round(variant.optInt("weight", 0) * 1000f / weightTotal) / 10f) + "%";
    }

    private void artShuffle(JSONObject cfg, boolean pool) {
        java.util.Random r = new java.util.Random();
        JSONArray slots = cfg.optJSONArray("slots");
        if (slots == null) return;
        for (int i = 0; i < slots.length(); i++) {
            JSONArray vs = slots.optJSONObject(i) == null ? null : slots.optJSONObject(i).optJSONArray("variants");
            if (vs == null) continue;
            int on = 0;
            for (int k = 0; k < vs.length(); k++) {
                JSONObject v2 = vs.optJSONObject(k);
                if (v2 == null) continue;
                if (pool) { put(v2, "on", r.nextFloat() > 0.35f); }
                if (v2.optBoolean("on", true)) { put(v2, "weight", 1 + r.nextInt(99)); on++; }
            }
            if (pool) while (on < Math.min(2, vs.length())) {
                JSONObject v2 = vs.optJSONObject(r.nextInt(vs.length()));
                if (v2 != null && !v2.optBoolean("on", true)) { put(v2, "on", true); put(v2, "weight", 1 + r.nextInt(99)); on++; }
            }
        }
        artItems = new JSONArray();
        artPreviews.clear();
        artSaveDraft();
        renderGenerative();
        toast(pool ? "Trait pool shuffled" : "Rarity shuffled");
    }

    private void artGenerate(ArtStudio studio, JSONObject cfg) {
        int n = Math.max(2, Math.min(20, parseIntSafe(genCount)));
        genCount = String.valueOf(n);
        genBusy = true;
        renderGenerative();
        String s = artSeed.isEmpty() ? "atelier" : artSeed;
        studio.generate(s, n, cfg, result -> {
            genBusy = false;
            if (screen != Screen.CREATE_GENERATIVE) return;
            String err = result.optString("error", "");
            JSONArray items = result.optJSONArray("items");
            if (items == null) items = new JSONArray();
            if (!err.isEmpty() && items.length() < n) {
                toast(err);
            }
            artItems = items;
            artPreviews.clear();
            for (int i = 0; i < items.length(); i++) artPreviews.add(null);
            renderGenerative();
            final JSONArray itemsF = items;
            new Thread(() -> {
                for (int i = 0; i < itemsF.length(); i++) {
                    JSONObject it = itemsF.optJSONObject(i);
                    android.graphics.Bitmap b = it == null ? null
                            : ArtStudio.svgBitmap(it.optString("svg"), dp(160));
                    final int idx = i;
                    runOnUiThread(() -> {
                        if (artItems == itemsF && idx < artPreviews.size()) {
                            artPreviews.set(idx, b);
                            if (screen == Screen.CREATE_GENERATIVE && idx == itemsF.length() - 1) renderGenerative();
                        }
                    });
                }
            }).start();
        });
    }

    private void showArtItem(JSONObject item, int idx) {
        if (item == null) return;
        StringBuilder sb = new StringBuilder();
        JSONArray ts = item.optJSONArray("traits");
        if (ts != null) for (int i = 0; i < ts.length(); i++) {
            JSONObject t = ts.optJSONObject(i);
            if (t == null) continue;
            sb.append(t.optString("label")).append(":  ").append(t.optString("value"))
              .append("   (").append(t.optString("pct")).append("%)\n");
        }
        sb.append("\nrarity score r").append(item.opt("score"))
          .append(" · ").append(item.optInt("bytes")).append("B raw");
        new android.app.AlertDialog.Builder(this)
                .setTitle("Plate " + String.format(Locale.US, "%02d", idx + 1))
                .setMessage(sb.toString())
                .setPositiveButton("Close", null)
                .show();
    }

    private void sendArtToCollection() {
        if (artItems.length() == 0 || genBusy) return;
        if ("photo".equals(artStyle) && !artPhotoLoaded) {
            toast("Load a photo first — the placeholder never mints");
            return;
        }
        genBusy = true;
        renderGenerative();
        final JSONArray itemsF = artItems;
        new Thread(() -> {
            String[] images = new String[itemsF.length()];
            JSONObject traitsMap = new JSONObject();
            String err = "";
            for (int i = 0; i < itemsF.length(); i++) {
                JSONObject it = itemsF.optJSONObject(i);
                String svg = it == null ? "" : SvgSanitizer.sanitize(it.optString("svg"));
                String b64 = svg.isEmpty() ? "" : java.util.Base64.getEncoder()
                        .encodeToString(svg.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                if (b64.isEmpty() || b64.length() > ART_EMBED_BUDGET) {
                    err = "Plate " + (i + 1) + " will not fit the on-chain budget";
                    break;
                }
                images[i] = b64;
                JSONArray attrs = new JSONArray();
                JSONArray ts = it.optJSONArray("traits");
                if (ts != null) for (int k = 0; k < ts.length(); k++) {
                    JSONObject t = ts.optJSONObject(k);
                    if (t == null) continue;
                    JSONObject a = new JSONObject();
                    put(a, "trait_type", t.optString("label"));
                    put(a, "value", t.optString("value"));
                    attrs.put(a);
                }
                put(traitsMap, String.valueOf(i + 1), attrs);
            }
            /* Wallet icon parity with the MiniDapp: a lead SVG within
             * ICON_BUDGET embeds as crisp vector text (the mint flow's own
             * fallback), but an oversized one must be rasterized here or the
             * wallet tile falls back to the placeholder. */
            String iconB64 = "";
            if (err.isEmpty() && images.length > 0 && images[0].length() > ImageTools.ICON_BUDGET) {
                JSONObject lead = itemsF.optJSONObject(0);
                android.graphics.Bitmap b = lead == null ? null
                        : ArtStudio.svgBitmap(lead.optString("svg"), 512);
                iconB64 = ImageTools.iconFromBitmap(b, ImageTools.ICON_BUDGET);
            }
            /* JOINT budget guard (exact, not estimated): the token record and
             * the LARGEST embedded image travel together, twice, in every
             * transfer — over ~23KB combined the lots seal but can never leave
             * the wallet (the "Random" lesson). Slim the icon; refuse rather
             * than mint untransferable lots. */
            if (err.isEmpty()) {
                int maxImg = 0;
                for (String im : images) if (im != null && im.length() > maxImg) maxImg = im.length();
                StateNft.Meta probe = new StateNft.Meta();
                probe.name = "collection-name-placeholder-40chars....";
                probe.description = "";
                probe.mode = "embed";
                probe.size = images.length;
                probe.icon = !iconB64.isEmpty() ? iconB64
                        : (images.length > 0 && images[0].length() <= ImageTools.ICON_BUDGET
                            ? images[0] : "");
                int defA = MintEngine.defActualLen(probe, traitsMap);
                String jointErr = MintEngine.jointBudgetError(defA, maxImg);
                if (jointErr != null) {
                    JSONObject lead = itemsF.optJSONObject(0);
                    android.graphics.Bitmap b = lead == null ? null
                            : ArtStudio.svgBitmap(lead.optString("svg"), 512);
                    String slim = ImageTools.iconFromBitmap(b, 4000);
                    probe.icon = slim;
                    if (!slim.isEmpty()
                            && MintEngine.jointBudgetError(MintEngine.defActualLen(probe, traitsMap), maxImg) == null) {
                        iconB64 = slim;
                        LocalStore.logEvent(MainActivity.this,
                                "Icon slimmed to keep every lot transferable (record was "
                                + defA + "B beside a " + maxImg + "B image)");
                    } else {
                        err = jointErr;
                    }
                }
            }
            final String errF = err, iconF = iconB64;
            runOnUiThread(() -> {
                genBusy = false;
                if (!errF.isEmpty()) { toast(errF); renderGenerative(); return; }
                createMode = "embed";
                createSize = String.valueOf(images.length);
                createImages = images;
                collectionItemTraits = traitsMap;
                if (!iconF.isEmpty()) createIconB64 = iconF;
                toast(images.length + " editions drawn — finish the collection details");
                renderCreateCollection();
            });
        }).start();
    }

    /** The AI-photo pipeline from a 512 square bitmap (worker thread):
     *  cartoonize -> quantize -> bridge setPhoto. Fed by the picker AND by
     *  the FILTR handoff. */
    @Override protected void onResume() {
        super.onResume();
        String mint = FiltrActivity.pendingMint;
        if (mint != null && !mint.isEmpty()) {
            FiltrActivity.pendingMint = null;
            nftImage = mint;
            toast("FILTR image loaded into the NFT wizard");
            renderCreateNft();
        }
        String photo = FiltrActivity.pendingPhoto;
        if (photo != null && !photo.isEmpty()) {
            FiltrActivity.pendingPhoto = null;
            toast("Cartoonizing on-device…");
            new Thread(() -> {
                try {
                    byte[] raw = android.util.Base64.decode(photo, android.util.Base64.DEFAULT);
                    android.graphics.Bitmap b =
                            android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.length);
                    artPhotoFromBitmap(b == null ? null
                            : android.graphics.Bitmap.createScaledBitmap(b, 512, 512, true));
                } catch (Throwable t) {
                    runOnUiThread(() -> toast("Could not read the FILTR image"));
                }
            }).start();
            runOnUiThread(this::renderGenerative);
        }
    }

    private void artPhotoFromBitmap(android.graphics.Bitmap big) {
        android.graphics.Bitmap toon = big == null ? null : AiCartoon.cartoonize(this, big);
        final boolean ai = toon != null;
        int[] px = ImageTools.gridPixels(ai ? toon : big, 96);
        final String rgba = px == null ? null : artRgbaJson(px);
        /* AI paintings are flat — richer 10-color trace, and the
         * painting itself rides along for the Painted finish */
        final String paint = ai ? ImageTools.paintB64(toon, 7600) : "";
        runOnUiThread(() -> {
            if (rgba == null) { toast("Could not read that photo"); return; }
            ArtStudio.with(this, s -> s.setPhoto(rgba, ai ? 10 : 8, paint, k -> {
                artPhotoLoaded = k > 0;
                ART_THUMBS.remove("photo");
                artItems = new JSONArray();
                artPreviews.clear();
                toast(!artPhotoLoaded ? "Could not process that photo"
                        : ai ? "Photo AI-cartoonized on-device"
                             : "AI engine unavailable — photo traced directly");
                if (screen == Screen.CREATE_GENERATIVE) renderGenerative();
            }));
        });
    }

    /** ARGB pixels -> the flat [r,g,b,a,...] JSON array photoQuantize expects. */
    private static String artRgbaJson(int[] px) {
        StringBuilder sb = new StringBuilder(px.length * 12 + 2);
        sb.append('[');
        for (int i = 0; i < px.length; i++) {
            int p = px[i];
            if (i > 0) sb.append(',');
            sb.append((p >> 16) & 255).append(',').append((p >> 8) & 255)
              .append(',').append(p & 255).append(",255");
        }
        sb.append(']');
        return sb.toString();
    }

    /* ---- studio draft: style + seed + edited configs survive restarts ---- */

    private void artLoadDraft() {
        JSONObject d = LocalStore.loadDraft(this, "artstudio");
        if (d == null) return;
        artStyle = d.optString("style", artStyle);
        artSeed = d.optString("seed", artSeed);
        genCount = d.optString("count", genCount);
        JSONObject cfgs = d.optJSONObject("cfgs");
        if (cfgs != null) {
            java.util.Iterator<String> it = cfgs.keys();
            while (it.hasNext()) {
                String k = it.next();
                JSONObject c2 = cfgs.optJSONObject(k);
                if (c2 != null) artCfgs.put(k, c2);
            }
        }
    }

    private void artSaveDraft() {
        JSONObject d = new JSONObject();
        put(d, "style", artStyle);
        put(d, "seed", artSeed);
        put(d, "count", genCount);
        JSONObject cfgs = new JSONObject();
        for (java.util.Map.Entry<String, JSONObject> e : artCfgs.entrySet()) put(cfgs, e.getKey(), e.getValue());
        put(d, "cfgs", cfgs);
        LocalStore.saveDraft(this, "artstudio", d);
    }

    /* ================= AIRDROP ================= */

    private void renderAirdrop(StateNft.Meta m, List<StateNft.Item> transferable) {
        setScreen(Screen.AIRDROP, () -> openCollection(m));
        appbar("Airdrop", true, false);
        hideNav();

        body.addView(Design.lot(this, "Dispatch — " + transferable.size() + " lots in custody"));
        body.addView(Design.display(this, m.name, 18), lpm(0, 4, 0, 10));

        /* the whole collection to ONE address — a single txn is impossible
         * on-chain (state is per-transaction), so this queues one identity-
         * preserving transfer per lot through the resumable engine */
        LinearLayout wholeCard = lotCard();
        wholeCard.addView(Design.lot(this, "Send the whole collection"));
        wholeCard.addView(Design.note(this, "All " + transferable.size() + " lots to one recipient — "
                + "delivered as " + transferable.size() + " sealed transfers, one per coin, resumable."), lpm(0, 4, 0, 8));
        EditText oneAddr = input("Mx… or 0x…");
        wholeCard.addView(oneAddr, lph(48, 0, 0, 0, 8));
        TextView sendAll = Design.button(this, "Send all " + transferable.size() + " lots", true);
        sendAll.setOnClickListener(v -> {
            String a = oneAddr.getText().toString().trim().replace(" ", "");
            if (!Util.isValidAddress(a)) { toast("That address does not parse — Mx… or 0x… format"); return; }
            List<String> addrs = new ArrayList<>();
            for (int i = 0; i < transferable.size(); i++) addrs.add(a);
            JSONObject job = AirdropEngine.createJob(m, transferable, addrs);
            if (AirdropEngine.progress(job)[1] == 0) { toast("Nothing deliverable"); return; }
            AirdropEngine.saveJob(this, job);
            engageEngine();
            toast(transferable.size() + " lots queued to " + Util.shorten(a));
            openCollection(m);
        });
        wholeCard.addView(sendAll, lph(50, 0, 0, 0, 0));
        body.addView(wholeCard, lpm(0, 0, 0, 16));

        body.addView(sectionHead("Or map lots to a list", ""));
        body.addView(Design.note(this, "One address per line. Lots are delivered in order — lot " +
                (transferable.isEmpty() ? "—" : String.format(Locale.US, "%03d", transferable.get(0).index)) +
                " to the first line. Every transfer replays the sealed identity."), lpm(0, 0, 0, 10));

        EditText addrs = inputMulti("Mx…\nMx…\n0x…");
        body.addView(addrs, new LinearLayout.LayoutParams(-1, dp(140)){{ bottomMargin = dp(8); }});
        TextView status = Design.note(this, "Paste recipients, then preview.");
        body.addView(status, lpm(0, 0, 0, 10));

        LinearLayout mapping = vertical();
        body.addView(mapping, lpm(0, 0, 0, 10));

        final List<String> valid = new ArrayList<>();
        TextView preview = Design.button(this, "Preview mapping", false);
        preview.setOnClickListener(v -> {
            valid.clear();
            mapping.removeAllViews();
            String[] lines = addrs.getText().toString().split("\n");
            int bad = 0;
            for (String line : lines) {
                String a = line.trim().replace(" ", "");
                if (a.isEmpty()) continue;
                if (Util.isValidAddress(a)) valid.add(a);
                else bad++;
            }
            int n = Math.min(valid.size(), transferable.size());
            for (int i = 0; i < n; i++) {
                LinearLayout row = horizontal(Gravity.CENTER_VERTICAL);
                row.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1));
                row.setPadding(dp(10), dp(6), dp(10), dp(6));
                row.addView(Design.lot(this, String.format(Locale.US, "Lot %03d", transferable.get(i).index)),
                        new LinearLayout.LayoutParams(dp(74), -2));
                row.addView(Design.text(this, Util.shorten(valid.get(i)), 11, Design.INK(), Design.mono()),
                        new LinearLayout.LayoutParams(0, -2, 1));
                mapping.addView(row, lpm(0, 0, 0, 5));
            }
            String msg = n + " deliveries ready";
            if (bad > 0) msg += " · " + bad + " invalid lines skipped";
            if (valid.size() > transferable.size()) msg += " · " + (valid.size() - transferable.size()) + " recipients beyond your lots";
            if (transferable.size() > valid.size() && n > 0) msg += " · " + (transferable.size() - valid.size()) + " lots stay with you";
            status.setText(msg);
        });
        body.addView(preview, lph(48, 0, 0, 0, 8));

        TextView go = Design.button(this, "Begin delivery", true);
        go.setOnClickListener(v -> {
            if (valid.isEmpty()) { status.setText("Preview the mapping first."); return; }
            JSONObject job = AirdropEngine.createJob(m, transferable, valid);
            if (AirdropEngine.progress(job)[1] == 0) { status.setText("Nothing deliverable."); return; }
            AirdropEngine.saveJob(this, job);
            toast("Airdrop armed — the engine delivers one lot per cycle while the app is open");
            openCollection(m);
        });
        body.addView(go, lph(54, 0, 0, 0, 0));
    }

    private EditText inputMulti(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextColor(Design.INK());
        e.setHintTextColor(Design.DIM());
        e.setTextSize(12.5f);
        e.setTypeface(Design.mono());
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        e.setGravity(Gravity.TOP);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        e.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1.5f));
        return e;
    }

    /* ================= MANAGE ================= */

    /** The engine's own record — every tick summary, phase change and error,
     *  newest first. Reached from the pane above the mint rail and Manage. */
    private void renderEngineLog(Runnable back) {
        setScreen(Screen.ENGINE_LOG, back != null ? back : this::renderManage);
        appbar("Engine log", true, false);
        hideNav();

        JSONArray log = LocalStore.engineLog(this);
        long beat = LocalStore.lastHeartbeat(this);
        body.addView(Design.lot(this, "The engine's own record — newest first"));
        body.addView(Design.note(this, (beat == 0 ? "No tick recorded yet"
                : "Last tick " + ((System.currentTimeMillis() - beat) / 1000) + "s ago")
                + " · " + log.length() + " entries · refreshes every 25s"), lpm(0, 4, 0, 10));

        LinearLayout actions = horizontal(Gravity.CENTER_VERTICAL);
        TextView copy = Design.button(this, "Copy log", false);
        copy.setOnClickListener(v -> {
            StringBuilder sb = new StringBuilder();
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("HH:mm:ss", Locale.US);
            for (int i = log.length() - 1; i >= 0; i--) {
                JSONObject e = log.optJSONObject(i);
                if (e != null) sb.append(f.format(new java.util.Date(e.optLong("t"))))
                        .append("  ").append(e.optString("m")).append('\n');
            }
            copyText(sb.toString());
        });
        actions.addView(copy, weight(44, 0, 4));
        TextView clear = Design.button(this, "Clear", false);
        clear.setOnClickListener(v -> { LocalStore.clearEngineLog(this); renderEngineLog(back); });
        actions.addView(clear, weight(44, 4, 0));
        body.addView(actions, lpm(0, 0, 0, 12));

        if (log.length() == 0) {
            body.addView(Design.note(this, "Nothing yet — engage the engine and every step lands here."));
        }
        java.text.SimpleDateFormat fmt = new java.text.SimpleDateFormat("HH:mm:ss", Locale.US);
        for (int i = log.length() - 1; i >= 0; i--) {
            JSONObject e = log.optJSONObject(i);
            if (e == null) continue;
            String msg = e.optString("m");
            LinearLayout rowV = horizontal(Gravity.TOP);
            TextView tt = Design.text(this, fmt.format(new java.util.Date(e.optLong("t"))),
                    9.5f, Design.DIM(), Design.mono());
            tt.setPadding(0, dp(1), dp(8), 0);
            rowV.addView(tt);
            TextView mm = Design.text(this, msg, 10.5f,
                    msg.startsWith("ERROR") ? Design.ACCENT() : Design.INK(), Design.mono());
            rowV.addView(mm, new LinearLayout.LayoutParams(0, -2, 1));
            body.addView(rowV, lpm(0, 0, 0, 6));
        }
    }

    private void renderManage() {
        setScreen(Screen.MANAGE, null);
        appbar("Manage", false, false);
        bottomNav(2);

        LinearLayout nodeCard = lotCard();
        nodeCard.addView(Design.lot(this, "Node"));
        boolean on = node != null && node.isEnabled();
        nodeCard.addView(Design.text(this, on ? "Minima Core connected" : "Not paired",
                14, on ? Design.INK() : Design.ACCENT(), Design.sansBold()), lpm(0, 4, 0, 6));
        nodeCard.addView(kvRow("Last response", node == null || node.lastOkMs() == 0 ? "none yet" : "received"));
        TextView engineLogBtn = Design.button(this, "Engine log", false);
        engineLogBtn.setOnClickListener(v -> renderEngineLog(this::renderManage));
        nodeCard.addView(engineLogBtn, lph(44, 0, 8, 0, 0));
        TextView reconnect = Design.button(this, "Reconnect", false);
        reconnect.setOnClickListener(v -> { if (node != null) node.reRegister(); toast("Re-pairing…"); });
        nodeCard.addView(reconnect, lph(46, 0, 10, 0, 6));
        TextView openCore = Design.button(this, "Open Minima Core", false);
        openCore.setOnClickListener(v -> openMinimaCore());
        nodeCard.addView(openCore, lph(46, 0, 0, 0, 0));
        body.addView(nodeCard, lpm(0, 0, 0, 14));

        LinearLayout engineCard = lotCard();
        engineCard.addView(Design.lot(this, "Mint engine"));
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
        boolean exempt = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
        engineCard.addView(Design.note(this, exempt
                ? "Battery optimisation is off for Atelier — the engine seals unattended."
                : "Samsung may freeze the engine overnight. Exempt Atelier from battery optimisation to let long mints finish unattended."), lpm(0, 4, 0, 10));
        if (!exempt) {
            TextView allow = Design.button(this, "Let the engine run unattended", true);
            allow.setOnClickListener(v -> {
                try {
                    Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                } catch (Exception e) { toast("Open Settings → Apps → Atelier → Battery"); }
            });
            engineCard.addView(allow, lph(48, 0, 0, 0, 0));
        }
        body.addView(engineCard, lpm(0, 0, 0, 14));

        LinearLayout walletCard = lotCard();
        walletCard.addView(Design.lot(this, "Wallet"));
        walletCard.addView(Design.note(this, "Adopt StateNFT collections already in this wallet — including mints from other devices or the CLI."), lpm(0, 4, 0, 10));
        TextView scanB = Design.button(this, "Scan wallet", true);
        scanB.setOnClickListener(v -> renderScan());
        walletCard.addView(scanB, lph(48, 0, 0, 0, 0));
        body.addView(walletCard, lpm(0, 0, 0, 14));

        LinearLayout appCard = lotCard();
        appCard.addView(Design.lot(this, "Colophon"));
        appCard.addView(kvRow("App", "Atelier — StateNFT Studio"));
        appCard.addView(kvRow("Version", BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"));
        appCard.addView(kvRow("Package", getPackageName()));
        body.addView(appCard, lpm(0, 0, 0, 14));
    }

    /* ================= SCAN ================= */

    private void renderScan() {
        setScreen(Screen.SCAN, this::renderManage);
        appbar("Scan Wallet", true, false);
        hideNav();
        scanFound.clear();

        LinearLayout card = lotCard();
        card.addView(Design.lot(this, "Survey in progress"));
        inlineStatus = Design.note(this, "Reading tokens, matching the StateNFT contract fingerprint…");
        card.addView(inlineStatus, lpm(0, 6, 0, 8));
        ProgressBar p = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        p.setIndeterminate(true);
        card.addView(p, new LinearLayout.LayoutParams(-1, dp(22)));
        body.addView(card, lpm(0, 0, 0, 14));
        body.addView(sectionHead("Collections found", ""));
        startScan();
    }

    private void startScan() {
        node.cmd("balance", new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONArray bal = json.optJSONArray("response");
                scanBalance(bal == null ? new JSONArray() : bal, 0);
            }
            @Override public void onError(String message) { setInlineStatus(message); }
        });
    }

    private void scanBalance(JSONArray bal, int idx) {
        if (screen != Screen.SCAN) return;
        if (idx >= bal.length()) {
            loadLocalCollections();
            setInlineStatus(scanFound.size() + " collections in the catalogue");
            TextView done = Design.button(this, "Done", true);
            done.setOnClickListener(v -> renderGallery());
            body.addView(done, lph(50, 0, 10, 0, 0));
            return;
        }
        setInlineStatus("Checking token " + (idx + 1) + " of " + bal.length() + "…");
        JSONObject row = bal.optJSONObject(idx);
        if (row == null) { scanBalance(bal, idx + 1); return; }
        String tid = row.optString("tokenid", "");
        StateNft.Meta meta = StateNft.parseMeta(tid, row.opt("token"));
        if (!StateNft.isCandidate(meta)) { scanBalance(bal, idx + 1); return; }
        inspectTokenForScan(meta, () -> scanBalance(bal, idx + 1));
    }

    private void inspectTokenForScan(StateNft.Meta candidate, Runnable done) {
        node.cmd("tokens tokenid:" + candidate.tokenid, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONObject t = json.optJSONObject("response");
                String script = t == null ? "" : t.optString("script", "");
                String pk = StateNft.creatorPk(script);
                if (pk.isEmpty()) { done.run(); return; }
                StateNft.Meta m = StateNft.parseMeta(candidate.tokenid, t);
                m.creatorPk = pk;
                countOwned(m, () -> {
                    JSONObject known = LocalStore.findByTokenid(MainActivity.this, m.tokenid);
                    if (known == null) {
                        m.localId = LocalStore.nextId(MainActivity.this);
                        m.phase = "DONE";
                        m.created = false;
                        LocalStore.upsert(MainActivity.this, MintEngine.rowFromMeta(m, new JSONArray()));
                        scanFound.add(m);
                    } else {
                        scanFound.add(MintEngine.metaFromRow(known));
                    }
                    if (screen == Screen.SCAN) body.addView(collectionCard(m), lpm(0, 0, 0, 12));
                    done.run();
                });
            }
            @Override public void onError(String message) { done.run(); }
        });
    }

    /* ================= shared node helpers ================= */

    private void countOwned(StateNft.Meta m, Runnable done) {
        MintEngine.tokenCoinsBounded(node, m.tokenid, true, (coins, partial) -> {
            m.owned = coins.length();
            m.minted = distinctStamped(coins);
            checkCreator(m, done);
        }, e -> checkCreator(m, done));
    }

    private void checkCreator(StateNft.Meta m, Runnable done) {
        if (m.creatorPk.isEmpty()) { done.run(); return; }
        node.cmd("keys action:list publickey:" + m.creatorPk, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                Object r = json.opt("response");
                JSONArray keys = null;
                if (r instanceof JSONObject) keys = ((JSONObject) r).optJSONArray("keys");
                else if (r instanceof JSONArray) keys = (JSONArray) r;
                if (keys != null) {
                    for (int i = 0; i < keys.length(); i++) {
                        JSONObject k = keys.optJSONObject(i);
                        if (k != null && m.creatorPk.equals(k.optString("publickey"))) m.creator = true;
                    }
                }
                done.run();
            }
            @Override public void onError(String message) { done.run(); }
        });
    }

    /** Poll a single coin until it leaves the UTXO set (spent = departed).
     *  `coins coinid:` replies are tiny — immune to the 256KB IPC cap that a
     *  full-state token query can hit on large embed collections. Watchers
     *  die with the screen — setScreen() cancels them. */
    private void watchDeparture(String tokenid, String coinid, Runnable ok, Runnable unsure) {
        final int[] tries = {0};
        final Runnable[] pollRef = new Runnable[1];
        Runnable poll = new Runnable() {
            @Override public void run() {
                tries[0]++;
                node.cmd("coins coinid:" + coinid, new NodeApi.Cb() {
                    @Override public void onResult(JSONObject json) {
                        JSONArray cs = json.optJSONArray("response");
                        boolean still = cs != null && cs.length() > 0;
                        if (!departureWatchers.contains(pollRef[0])) return;   // cancelled while reply was in flight
                        if (!still) { departureWatchers.remove(pollRef[0]); ok.run(); }
                        else if (tries[0] > 20) { departureWatchers.remove(pollRef[0]); unsure.run(); }
                        else main.postDelayed(pollRef[0], 20000);
                    }
                    @Override public void onError(String message) {
                        if (!departureWatchers.contains(pollRef[0])) return;
                        if (tries[0] > 20) { departureWatchers.remove(pollRef[0]); unsure.run(); }
                        else main.postDelayed(pollRef[0], 20000);
                    }
                });
            }
        };
        pollRef[0] = poll;
        departureWatchers.add(poll);
        main.postDelayed(poll, 20000);
    }

    private int distinctStamped(JSONArray coins) {
        if (coins == null) return 0;
        HashSet<String> seen = new HashSet<>();
        for (int i = 0; i < coins.length(); i++) {
            String s = StateNft.stamped(coins.optJSONObject(i));
            if (s != null && s.matches("^[0-9]+$")) seen.add(s);
        }
        return seen.size();
    }

    /* ================= local store & drafts ================= */

    private void loadLocalCollections() {
        collections.clear();
        JSONArray rows = LocalStore.load(this);
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null) collections.add(MintEngine.metaFromRow(row));
        }
    }

    private StateNft.Meta findCollectionByLocalId(long id, StateNft.Meta fallback) {
        loadLocalCollections();
        for (StateNft.Meta m : collections) if (m.localId == id) return m;
        return fallback;
    }

    private String collectionLeadImage(StateNft.Meta m) {
        String icon = IconResolver.resolve(m == null ? "" : m.icon);
        if (icon != null && !icon.isEmpty()) return icon;
        List<StateNft.Item> local = localItemsForMeta(m);
        if (!local.isEmpty()) return local.get(0).imageUrl;
        return null;
    }

    private List<StateNft.Item> localItemsForMeta(StateNft.Meta m) {
        ArrayList<StateNft.Item> out = new ArrayList<>();
        if (m == null) return out;
        JSONObject row = LocalStore.findById(this, m.localId);
        JSONArray items = row == null ? new JSONArray() : MintEngine.localItems(row);
        for (int i = 0; i < items.length(); i++) {
            JSONObject j = items.optJSONObject(i);
            if (j == null) continue;
            StateNft.Item it = new StateNft.Item();
            it.index = j.optInt("idx", i + 1);
            it.owned = false;
            it.imageUrl = "embed".equals(m.mode)
                    ? ImageTools.dataUri(j.optString("image"))
                    : j.optString("image");
            out.add(it);
        }
        return out;
    }

    private List<StateNft.Item> mergeLocalPreviews(StateNft.Meta m, List<StateNft.Item> chainItems) {
        List<StateNft.Item> local = localItemsForMeta(m);
        if (local.isEmpty()) return chainItems;
        java.util.HashMap<Integer, String> preview = new java.util.HashMap<>();
        for (StateNft.Item it : local) preview.put(it.index, it.imageUrl);
        for (StateNft.Item it : chainItems) {
            String localUrl = preview.get(it.index);
            if (localUrl != null && !localUrl.isEmpty()
                    && (it.coin == null || it.imageUrl == null || it.imageUrl.isEmpty()
                    || it.imageUrl.equals(IconResolver.resolve(m.icon)))) {
                it.imageUrl = localUrl;
            }
        }
        return chainItems;
    }

    private void ensureCreateImages(int count) {
        if (createImages.length == count) return;
        String[] next = new String[count];
        for (int i = 0; i < Math.min(createImages.length, next.length); i++) next[i] = createImages[i];
        createImages = next;
    }

    private void saveCollectionDraft(EditText name, EditText desc, EditText size, EditText base,
                                     EditText ext, EditText icon, EditText external, EditText web) {
        if (name != null) createName = name.getText().toString();
        if (desc != null) createDesc = desc.getText().toString();
        if (size != null) createSize = size.getText().toString();
        if (base != null) createBase = base.getText().toString();
        if (ext != null) createExt = ext.getText().toString();
        if (icon != null) createIcon = icon.getText().toString();
        if (external != null) createExternal = external.getText().toString();
        if (web != null) createWeb = web.getText().toString();
    }

    private void resetCollectionDraft() {
        createName = ""; createDesc = ""; createSize = "12";
        createBase = ""; createExt = ".png"; createIcon = ""; createExternal = ""; createWeb = "";
        createImages = new String[0];
        createIconB64 = "";
        collectionItemTraits = null;
        LocalStore.clearDraft(this, "collection");
    }

    /* ---- image slot grid (collection embed mode) ---- */

    private LinearLayout imageSlotGrid() {
        LinearLayout grid = vertical();
        int cols = 4;
        for (int i = 0; i < createImages.length; i += cols) {
            LinearLayout row = horizontal(Gravity.CENTER);
            for (int c2 = 0; c2 < cols; c2++) {
                int idx = i + c2;
                LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(0, dp(84), 1);
                if (c2 != 0) slp.leftMargin = dp(8);
                if (idx >= createImages.length) row.addView(new Space(this), slp);
                else row.addView(imageSlotCell(idx), slp);
            }
            grid.addView(row, lpm(0, 0, 0, 8));
        }
        return grid;
    }

    private View imageSlotCell(int idx) {
        boolean ready = idx < createImages.length && createImages[idx] != null && !createImages[idx].isEmpty();
        FrameLayout cell = new FrameLayout(this);
        cell.setBackground(ready ? Design.ruled(this, Design.CARD(), Design.INK(), 1.5f)
                : Design.dashed(this, Design.CARD(), Design.DIM()));
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken("slot" + idx, 160));
        if (ready) ImageLoader.loadOver(this, ImageTools.dataUri(createImages[idx]), img);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(-1, -1);
        int bpx = dp(2);
        ilp.setMargins(bpx, bpx, bpx, bpx);
        cell.addView(img, ilp);
        TextView tag = Design.pill(this, String.format(Locale.US, "%02d %s", idx + 1, ready ? "⟳" : "+"),
                ready ? Design.PILL_DONE : Design.PILL_DIM);
        FrameLayout.LayoutParams tagLp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        tagLp.setMargins(dp(4), 0, 0, dp(4));
        cell.addView(tag, tagLp);
        cell.setClickable(true);
        cell.setOnClickListener(v -> {
            if (ready) {
                if ("image/svg+xml".equals(ImageTools.mimeOf(createImages[idx]))) {
                    toast("Vector plate — choose a replacement");
                    pickImage(idx);
                } else {
                    showEditor(createImages[idx], ImageTools.STATE_IMG_BUDGET, edited -> {
                        createImages[idx] = edited;
                        renderCreateCollection();
                    });
                }
            } else pickImage(idx);
        });
        return cell;
    }

    /* ---- recovery (NEEDIMAGES) ---- */

    private LinearLayout recoveryPanel(StateNft.Meta m) {
        LinearLayout panel = vertical();
        panel.setBackground(Design.ruled(this, Design.CARD(), Design.ACCENT(), 2f));
        panel.setPadding(dp(12), dp(10), dp(12), dp(12));
        panel.addView(Design.text(this, "MISSING EMBEDDED IMAGES", 12, Design.ACCENT(), Design.sansBold()));
        panel.addView(Design.note(this, "These exact bytes get sealed. Re-supply the missing plates to finish the mint."), lpm(0, 4, 0, 10));
        TextView pick = Design.button(this, "Choose missing images", true);
        pick.setOnClickListener(v -> pickRecoveryImages(m));
        panel.addView(pick, lph(46, 0, 0, 0, 10));
        panel.addView(recoveryImageGrid(m));
        int missing = missingLocalImages(m);
        panel.addView(Design.note(this, missing == 0 ? "All plates present — ready to resume." : missing + " plates still missing."), lpm(0, 6, 0, 0));
        if (missing == 0) {
            TextView resume = Design.button(this, "Resume stamping", true);
            resume.setOnClickListener(v -> {
                JSONObject row = LocalStore.findById(this, m.localId);
                if (row != null) {
                    put(row, "phase", "MOVE");
                    put(row, "error", "");
                    LocalStore.upsert(this, row);
                    engageEngine();
                    loadLocalCollections();
                    openMeta = findCollectionByLocalId(m.localId, m);
                    openCollection(openMeta);
                }
            });
            panel.addView(resume, lph(46, 0, 10, 0, 0));
        }
        return panel;
    }

    private LinearLayout recoveryImageGrid(StateNft.Meta m) {
        LinearLayout grid = vertical();
        // resolve the row ONCE — per-slot lookups scanned the whole store per cell
        JSONObject storeRow = LocalStore.findById(this, m.localId);
        int cols = 4;
        for (int i = 1; i <= Math.max(0, m.size); i += cols) {
            LinearLayout row = horizontal(Gravity.CENTER);
            for (int c2 = 0; c2 < cols; c2++) {
                int idx = i + c2;
                LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(0, dp(84), 1);
                if (c2 != 0) slp.leftMargin = dp(8);
                if (idx > m.size) row.addView(new Space(this), slp);
                else row.addView(recoverySlotCell(m, storeRow, idx), slp);
            }
            grid.addView(row, lpm(0, 0, 0, 8));
        }
        return grid;
    }

    private View recoverySlotCell(StateNft.Meta m, JSONObject storeRow, int idx) {
        String image = storeRow == null ? "" : localImageInRow(storeRow, idx);
        boolean ready = image != null && !image.isEmpty();
        FrameLayout cell = new FrameLayout(this);
        cell.setBackground(ready ? Design.ruled(this, Design.CARD(), Design.INK(), 1.5f)
                : Design.dashed(this, Design.CARD(), Design.ACCENT()));
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken("recover" + idx, 160));
        if (ready) ImageLoader.loadOver(this, ImageTools.dataUri(image), img);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(-1, -1);
        int bpx = dp(2);
        ilp.setMargins(bpx, bpx, bpx, bpx);
        cell.addView(img, ilp);
        TextView tag = Design.pill(this, String.format(Locale.US, "%02d", idx),
                ready ? Design.PILL_DONE : Design.PILL_ERR);
        FrameLayout.LayoutParams tagLp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        tagLp.setMargins(dp(4), 0, 0, dp(4));
        cell.addView(tag, tagLp);
        cell.setClickable(true);
        cell.setOnClickListener(v -> {
            if (ready && !"image/svg+xml".equals(ImageTools.mimeOf(image))) {
                showEditor(image, ImageTools.STATE_IMG_BUDGET, edited -> {
                    JSONObject row = LocalStore.findById(this, m.localId);
                    if (row == null) return;
                    setLocalImage(row, idx, edited);
                    LocalStore.upsert(this, row);
                    loadLocalCollections();
                    openMeta = findCollectionByLocalId(m.localId, openMeta);
                    openCollection(openMeta);
                });
            } else pickRecoveryImage(m, idx);
        });
        return cell;
    }

    private int missingLocalImages(StateNft.Meta m) {
        if (m == null || !"embed".equals(m.mode)) return 0;
        JSONObject row = LocalStore.findById(this, m.localId);
        if (row == null) return m.size;
        return missingLocalImagesInRow(row);
    }

    private int applyRecoveryImages(long localId, int startZero, boolean batch, ArrayList<String> images) {
        JSONObject row = LocalStore.findById(this, localId);
        if (row == null) return 0;
        int size = row.optInt("size", 0);
        int added = 0;
        if (batch) {
            int slot = Math.max(1, startZero + 1);
            for (String b64 : images) {
                if (b64 == null || b64.isEmpty()) continue;
                while (slot <= size && !localImageInRow(row, slot).isEmpty()) slot++;
                if (slot > size) break;
                setLocalImage(row, slot, b64);
                added++;
                slot++;
            }
        } else if (!images.isEmpty()) {
            String b64 = images.get(0);
            int idx = Math.max(1, startZero + 1);
            if (idx <= size && b64 != null && !b64.isEmpty()) {
                setLocalImage(row, idx, b64);
                added = 1;
            }
        }
        put(row, "phase", missingLocalImagesInRow(row) == 0 ? "MOVE" : "NEEDIMAGES");
        put(row, "error", missingLocalImagesInRow(row) == 0 ? "" : missingLocalImagesInRow(row) + " images still missing");
        LocalStore.upsert(this, row);
        return added;
    }

    private String localImageInRow(JSONObject row, int idx) {
        JSONArray items = MintEngine.localItems(row);
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it != null && it.optInt("idx") == idx) return it.optString("image", "");
        }
        return "";
    }

    private int missingLocalImagesInRow(JSONObject row) {
        int size = row.optInt("size", 0);
        int missing = 0;
        for (int i = 1; i <= size; i++) if (localImageInRow(row, i).isEmpty()) missing++;
        return missing;
    }

    private void setLocalImage(JSONObject row, int idx, String b64) {
        JSONArray items = MintEngine.localItems(row);
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it != null && it.optInt("idx") == idx) {
                put(it, "image", b64);
                put(row, "items", items);
                return;
            }
        }
        JSONObject it = new JSONObject();
        put(it, "idx", idx);
        put(it, "image", b64);
        items.put(it);
        put(row, "items", items);
    }

    /* ================= image picking ================= */

    private void pickImages() {
        pendingPickContext = PICK_CREATE;
        pendingImageIndex = -1;
        pendingBatchImages = true;
        launchPicker(true);
    }

    private void pickImage(int idx) {
        pendingPickContext = PICK_CREATE;
        pendingImageIndex = idx;
        pendingBatchImages = false;
        launchPicker(false);
    }

    private void pickNftImage() {
        pendingPickContext = PICK_NFT;
        pendingImageIndex = -1;
        pendingBatchImages = false;
        launchPicker(false);
    }

    private void pickRecoveryImages(StateNft.Meta m) {
        pendingPickContext = PICK_RECOVERY;
        pendingRecoveryId = m.localId;
        pendingImageIndex = firstMissingLocalImageIndex(m) - 1;
        pendingBatchImages = true;
        launchPicker(true);
    }

    private void pickRecoveryImage(StateNft.Meta m, int idx) {
        pendingPickContext = PICK_RECOVERY;
        pendingRecoveryId = m.localId;
        pendingImageIndex = idx - 1;
        pendingBatchImages = false;
        launchPicker(false);
    }

    private void launchPicker(boolean multiple) {
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("image/*");
        if (multiple) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(Intent.createChooser(i, "Choose image"), 7001);
    }

    private int firstMissingLocalImageIndex(StateNft.Meta m) {
        if (m == null) return 1;
        JSONObject row = LocalStore.findById(this, m.localId);
        if (row == null) return 1;
        for (int i = 1; i <= m.size; i++) if (localImageInRow(row, i).isEmpty()) return i;
        return 1;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != 7001 || resultCode != RESULT_OK || data == null) return;
        ArrayList<Uri> uris = selectedImageUris(data);
        if (uris.isEmpty()) return;
        int start = pendingBatchImages ? firstEmptyImageSlot() : pendingImageIndex;
        boolean batch = pendingBatchImages;
        int context = pendingPickContext;
        long recoveryId = pendingRecoveryId;
        pendingImageIndex = -1;
        pendingBatchImages = false;
        pendingPickContext = PICK_CREATE;
        pendingRecoveryId = 0;
        if (context == PICK_ARTPHOTO) {
            final Uri photoUri = uris.get(0);
            toast("Cartoonizing on-device…");
            new Thread(() -> {
                android.graphics.Bitmap big = ImageTools.squareBitmap(this, photoUri, 512);
                artPhotoFromBitmap(big);
            }).start();
            return;
        }
        int budget = context == PICK_NFT ? ImageTools.ARTIMAGE_BUDGET
                : (context == PICK_TOKICON || context == PICK_COLLICON) ? ImageTools.ICON_BUDGET
                : ImageTools.STATE_IMG_BUDGET;
        new Thread(() -> {
            ArrayList<String> out = new ArrayList<>();
            for (Uri uri : uris) {
                try {
                    // SVG lane: sanitize + seal as text, skip the raster pipeline
                    if (ImageTools.isSvgUri(this, uri)) out.add(ImageTools.svgBase64FromUri(this, uri, budget));
                    // wallet icons are square-cropped so wallet tiles fill edge-to-edge
                    else if (context == PICK_TOKICON || context == PICK_COLLICON) out.add(ImageTools.iconFromUri(this, uri, budget));
                    else out.add(ImageTools.compressUri(this, uri, budget));
                } catch (Exception ignored) { out.add(""); }
            }
            runOnUiThread(() -> {
                if (context == PICK_NFT) {
                    String b64 = out.isEmpty() ? "" : out.get(0);
                    if (b64 == null || b64.isEmpty()) { toast("Could not process that image"); renderCreateNft(); return; }
                    nftImage = b64;
                    renderCreateNft();
                    // straight into the plate room — a bad crop is sealed forever
                    // (SVG is resolution-independent; crop/tone don't apply)
                    if (!"image/svg+xml".equals(ImageTools.mimeOf(b64))) {
                        showEditor(b64, ImageTools.ARTIMAGE_BUDGET, edited -> {
                            nftImage = edited;
                            renderCreateNft();
                        });
                    }
                } else if (context == PICK_TOKICON || context == PICK_COLLICON) {
                    String b64 = out.isEmpty() ? "" : out.get(0);
                    if (b64 == null || b64.isEmpty()) toast("Could not fit that image into an icon (6000 chars)");
                    else if (context == PICK_TOKICON) tokIcon = b64;
                    else createIconB64 = b64;
                    if (context == PICK_TOKICON) renderCreateToken();
                    else renderCreateCollection();
                } else if (context == PICK_RECOVERY) {
                    int added = applyRecoveryImages(recoveryId, start, batch, out);
                    toast(added == 0 ? "Could not process selected image"
                            : (batch ? added + " plates restored" : "Plate restored"));
                    loadLocalCollections();
                    openMeta = findCollectionByLocalId(recoveryId, openMeta);
                    if (openMeta != null && !"NEEDIMAGES".equals(openMeta.phase)) {
                        engageEngine();
                    }
                    openCollection(openMeta);
                } else {
                    int added = batch ? applyPickedImages(start, out) : applyReplacementImage(start, out);
                    toast(added == 0 ? "Could not process selected image"
                            : (batch ? added + " plates loaded" : "Plate " + (start + 1) + " loaded"));
                    renderCreateCollection();
                }
            });
        }).start();
    }


    private ArrayList<Uri> selectedImageUris(Intent data) {
        ArrayList<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null) uris.add(uri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        return uris;
    }

    private int firstEmptyImageSlot() {
        for (int i = 0; i < createImages.length; i++) {
            if (createImages[i] == null || createImages[i].isEmpty()) return i;
        }
        return 0;
    }

    private int applyPickedImages(int start, ArrayList<String> images) {
        if (start < 0 || start >= createImages.length) start = firstEmptyImageSlot();
        int slot = start;
        int added = 0;
        for (String b64 : images) {
            if (b64 == null || b64.isEmpty()) continue;
            while (slot < createImages.length && createImages[slot] != null && !createImages[slot].isEmpty()) slot++;
            if (slot >= createImages.length) break;
            createImages[slot++] = b64;
            added++;
        }
        return added;
    }

    private int applyReplacementImage(int slot, ArrayList<String> images) {
        if (slot < 0 || slot >= createImages.length || images.isEmpty()) return 0;
        String b64 = images.get(0);
        if (b64 == null || b64.isEmpty()) return 0;
        createImages[slot] = b64;
        return 1;
    }

    /* ================= widgets & misc ================= */

    private static class HorizontalScroll extends android.widget.HorizontalScrollView {
        HorizontalScroll(Context c) { super(c); setHorizontalScrollBarEnabled(false); }
    }

    private interface StrConsumer { void accept(String s); }

    private android.text.TextWatcher watch(StrConsumer c) {
        return new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int d) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int d) {}
            @Override public void afterTextChanged(android.text.Editable s) { c.accept(s.toString()); }
        };
    }

    /** Icon upload affordance: thumb preview + pick/clear controls. */
    private LinearLayout iconUploadRow(String iconB64, String caption,
                                       View.OnClickListener pick, View.OnClickListener clear) {
        LinearLayout row = horizontal(Gravity.CENTER_VERTICAL);
        boolean has = iconB64 != null && !iconB64.isEmpty();
        if (has) {
            ImageView thumb = new ImageView(this);
            thumb.setScaleType(ImageView.ScaleType.CENTER_CROP);
            thumb.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1.5f));
            ImageLoader.loadOver(this, ImageTools.dataUri(iconB64), thumb);
            row.addView(thumb, new LinearLayout.LayoutParams(dp(40), dp(40)){{ rightMargin = dp(8); }});
        }
        TextView btn = Design.button(this, has ? "Replace icon image" : "Upload icon image", false);
        btn.setOnClickListener(pick);
        row.addView(btn, new LinearLayout.LayoutParams(0, dp(40), 1));
        if (has) {
            TextView del = Design.text(this, "×", 18, Design.ACCENT(), Design.sansBold());
            del.setPadding(dp(12), 0, dp(6), 0);
            del.setClickable(true);
            del.setOnClickListener(clear);
            row.addView(del);
        }
        LinearLayout box = vertical();
        box.addView(row);
        box.addView(Design.note(this, caption), lpm(0, 3, 0, 0));
        return box;
    }

    private EditText fieldInto(LinearLayout parent, String label, String hint, String value) {
        parent.addView(Design.kicker(this, label), lpm(0, 8, 0, 5));
        EditText e = input(hint);
        if (value != null && !value.isEmpty()) e.setText(value);
        parent.addView(e, lph(48, 0, 0, 0, 4));
        return e;
    }

    private EditText input(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextColor(Design.INK());
        e.setHintTextColor(Design.DIM());
        e.setTextSize(13.5f);
        e.setTypeface(Design.sans());
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_TEXT);
        e.setPadding(dp(12), 0, dp(12), 0);
        e.setBackground(Design.ruled(this, Design.CARD(), Design.INK(), 1.5f));
        return e;
    }

    private LinearLayout lotCard() {
        LinearLayout card = vertical();
        card.setBackground(Design.blockShadow(this, Design.CARD()));
        card.setPadding(dp(14), dp(12), dp(16), dp(15));
        return card;
    }

    private LinearLayout kvRow(String k, String v) {
        LinearLayout row = horizontal(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(4), 0, dp(4));
        TextView key = Design.text(this, k.toUpperCase(), 9.5f, Design.DIM(), Design.sansBold());
        key.setLetterSpacing(0.14f);
        row.addView(key, new LinearLayout.LayoutParams(0, -2, 1));
        TextView val = Design.text(this, v == null ? "—" : v, 12, Design.INK(), Design.mono());
        val.setGravity(Gravity.END);
        row.addView(val, new LinearLayout.LayoutParams(0, -2, 1.3f));
        return row;
    }

    private float collectionProgress(StateNft.Meta m) {
        if (m == null) return 0f;
        if (m.size > 0 && m.minted > 0) return Math.min(1f, m.minted / (float) m.size);
        String p = m.phase == null ? "" : m.phase;
        if ("CREATE".equals(p)) return 0.1f;
        if ("MOVE".equals(p)) return 0.28f;
        if ("SPLIT".equals(p)) return 0.48f;
        if ("STAMP".equals(p)) return 0.68f;
        if ("DONE".equals(p)) return 1f;
        return 0f;
    }

    private boolean activeMint(StateNft.Meta m) {
        String p = m == null || m.phase == null ? "" : m.phase;
        return "CREATE".equals(p) || "MOVE".equals(p) || "SPLIT".equals(p) || "STAMP".equals(p) || "NEEDIMAGES".equals(p);
    }

    private static boolean validCmdUrl(String u) {
        return Util.validCmdUrl(u);
    }

    private void copyText(String s) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("atelier", s));
        toast("Copied");
    }

    private void openMinimaCore() {
        Intent launch = getPackageManager().getLaunchIntentForPackage("org.minimarex.minimacore");
        if (launch != null) startActivity(launch);
        else {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=org.minimarex.minimacore"))); }
            catch (Exception e) { toast("Minima Core app not found"); }
        }
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show();
    }

    /* layout shorthand */
    private int dp(int v) { return Design.dp(this, v); }

    private LinearLayout vertical() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private LinearLayout horizontal(int gravity) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(gravity);
        return l;
    }

    private View vspace(int h) {
        Space s = new Space(this);
        s.setLayoutParams(new LinearLayout.LayoutParams(1, dp(h)));
        return s;
    }

    private LinearLayout.LayoutParams lpm(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.setMargins(dp(l), dp(t), dp(r), dp(b));
        return p;
    }

    private LinearLayout.LayoutParams lph(int hDp, int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(hDp));
        p.setMargins(dp(l), dp(t), dp(r), dp(b));
        return p;
    }

    private LinearLayout.LayoutParams weight(int hDp, int lm, int rm) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(hDp), 1);
        p.leftMargin = dp(lm);
        p.rightMargin = dp(rm);
        return p;
    }

    private int parseIntSafe(String s) {
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return 0; }
    }

    private void put(JSONObject o, String k, Object v) {
        try { o.put(k, v); } catch (Exception ignored) {}
    }
}
