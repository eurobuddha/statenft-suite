package com.eurobuddha.statenft;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final int PICK_CREATE = 1;
    private static final int PICK_RECOVERY = 2;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayList<StateNft.Meta> collections = new ArrayList<>();
    private final ArrayList<StateNft.Meta> scanFound = new ArrayList<>();

    private NodeApi node;
    private ScrollView page;
    private LinearLayout body;
    private TextView nodeChip;
    private TextView inlineStatus;
    private StateNft.Meta openMeta;
    private Runnable currentBackAction;
    private JSONArray openOwned = new JSONArray();
    private JSONArray openAll = new JSONArray();
    private String createMode = "url";
    private String createName = "";
    private String createDesc = "";
    private String createSize = "20";
    private String createBase = "";
    private String createExt = ".png";
    private String createIcon = "";
    private String createExternal = "";
    private String createWeb = "";
    private String[] createImages = new String[0];
    private int pendingImageIndex = -1;
    private boolean pendingBatchImages = false;
    private int pendingPickContext = PICK_CREATE;
    private long pendingRecoveryId = 0;
    private boolean jumpCreateImages = false;

    private final Runnable mintLoop = new Runnable() {
        @Override public void run() {
            if (node != null && node.isEnabled()) {
                MintEngine.tick(MainActivity.this, node, msg -> {
                    if (inlineStatus != null) setInlineStatus(msg);
                    if (openMeta != null && activeMint(openMeta)) {
                        loadLocalCollections();
                        openMeta = findCollectionByLocalId(openMeta.localId, openMeta);
                        refreshDetail();
                    }
                });
            }
            main.postDelayed(this, 25000);
        }
    };

    private final Runnable rePair = new Runnable() {
        @Override public void run() {
            if (node != null && !node.isEnabled()) node.reRegister();
            main.postDelayed(this, 12000);
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Design.load(this);
        Window w = getWindow();
        w.setStatusBarColor(Design.BG());
        w.setNavigationBarColor(Design.BG());
        node = new NodeApi(this, enabled -> refreshNodeChip());
        renderCollections();
        main.postDelayed(() -> { if (node != null && !node.isEnabled()) node.reRegister(); }, 900);
        main.postDelayed(rePair, 12000);
        main.postDelayed(mintLoop, 5000);
    }

    @Override protected void onDestroy() {
        main.removeCallbacks(rePair);
        main.removeCallbacks(mintLoop);
        if (node != null) node.onDestroy();
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (currentBackAction != null) {
            currentBackAction.run();
            return;
        }
        super.onBackPressed();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 7001 && resultCode == RESULT_OK && data != null) {
            ArrayList<Uri> uris = selectedImageUris(data);
            if (uris.isEmpty()) return;
            int start = pendingBatchImages ? firstEmptyImageSlot() : pendingImageIndex;
            boolean batch = pendingBatchImages;
            pendingImageIndex = -1;
            pendingBatchImages = false;
            new Thread(() -> {
                ArrayList<String> out = new ArrayList<>();
                for (Uri uri : uris) {
                    try { out.add(ImageTools.compressUri(this, uri, 8000)); }
                    catch (Exception ignored) { out.add(""); }
                }
                runOnUiThread(() -> {
                    if (pendingPickContext == PICK_RECOVERY) {
                        long id = pendingRecoveryId;
                        pendingPickContext = PICK_CREATE;
                        pendingRecoveryId = 0;
                        int added = applyRecoveryImages(id, start, batch, out);
                        toast(added == 0 ? "Could not process selected image"
                                : (batch ? added + " recovery images added" : "Recovery image added"));
                        loadLocalCollections();
                        openMeta = findCollectionByLocalId(id, openMeta);
                        if (openMeta != null && !"NEEDIMAGES".equals(openMeta.phase)) {
                            MintEngine.resumeNow(this, node, msg -> toast(msg));
                        }
                        openCollection(openMeta);
                    } else {
                        int added = batch ? applyPickedImages(start, out) : applyReplacementImage(start, out);
                        toast(added == 0 ? "Could not process selected image"
                                : (batch ? added + " images added" : "Image added for item #" + (start + 1)));
                        jumpCreateImages = true;
                        renderCreate();
                    }
                });
            }).start();
        }
    }

    private void renderLaunch() {
        LinearLayout root = shell();
        root.addView(spacer(42));
        ImageView logo = new ImageView(this);
        logo.setImageBitmap(Identicon.minima(Design.dp(this, 58), Design.INK()));
        root.addView(logo, lp(Design.dp(this, 58), Design.dp(this, 58), 0, 0, 0, 16));
        TextView title = text("StateNFT Suite", 27, Design.INK(), Design.sansBold());
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(-1, -2, 28, 0, 28, 8));
        TextView sub = text("Minima Core companion for StateNFT collections.", 15, Design.DIM(), Design.sans());
        sub.setGravity(Gravity.CENTER);
        root.addView(sub, lp(-1, -2, 42, 0, 42, 34));

        LinearLayout panel = panel(18);
        panel.addView(text("Minima Core", 20, Design.INK(), Design.sansBold()));
        TextView state = text(node != null && node.isEnabled() ? "Connected" : "Not enabled", 15,
                node != null && node.isEnabled() ? Design.GOOD() : Design.DIM(), Design.sansBold());
        panel.addView(state, lp(-1, -2, 0, 10, 0, 6));
        panel.addView(text("Enable StateNFT Suite in Minima Core > Apps.", 14, Design.DIM(), Design.sans()));
        panel.addView(button("Open Minima Core", true, v -> openMinimaCore()), lp(-1, Design.dp(this, 54), 0, 20, 0, 10));
        panel.addView(button("Try Again", false, v -> {
            if (node != null) node.reRegister();
            renderCollections();
        }), lp(-1, Design.dp(this, 54), 0, 0, 0, 0));
        root.addView(panel, lp(-1, -2, 24, 0, 24, 16));

        TextView skip = button("Continue to Collections", false, v -> renderCollections());
        root.addView(skip, lp(-1, Design.dp(this, 50), 24, 0, 24, 0));
        setContentView(page);
    }

    private void renderCollections() {
        currentBackAction = null;
        openMeta = null;
        loadLocalCollections();
        LinearLayout root = shell();
        root.addView(appBar("StateNFT Suite", null, true));
        body = vertical();
        root.addView(body);

        LinearLayout actions = horizontal(10, Gravity.CENTER_VERTICAL);
        actions.addView(button("Scan Wallet", true, v -> renderScan()), new LinearLayout.LayoutParams(0, Design.dp(this, 52), 1));
        actions.addView(button("Create", false, v -> renderCreate()), new LinearLayout.LayoutParams(0, Design.dp(this, 52), 1));
        body.addView(actions, lp(-1, -2, 20, 12, 20, 14));

        LinearLayout open = horizontal(8, Gravity.CENTER_VERTICAL);
        EditText token = input("Open tokenid", false);
        open.addView(token, new LinearLayout.LayoutParams(0, Design.dp(this, 52), 1));
        open.addView(button("Open", false, v -> {
            String tid = token.getText().toString().trim();
            if (!tid.startsWith("0x")) { toast("tokenid must start 0x"); return; }
            inspectToken(tid, true);
        }), new LinearLayout.LayoutParams(Design.dp(this, 82), Design.dp(this, 52)));
        body.addView(open, lp(-1, -2, 20, 0, 20, 16));

        if (collections.isEmpty()) {
            LinearLayout empty = panel(16);
            empty.addView(text("No collections loaded", 18, Design.INK(), Design.sansBold()));
            empty.addView(text("Scan your wallet or open a StateNFT tokenid directly.", 14, Design.DIM(), Design.sans()), lp(-1, -2, 0, 8, 0, 0));
            body.addView(empty, lp(-1, -2, 20, 0, 20, 18));
        } else {
            body.addView(sectionLabel("Collections"), lp(-1, -2, 20, 0, 20, 8));
            for (StateNft.Meta m : collections) body.addView(collectionRow(m), lp(-1, -2, 20, 0, 20, 10));
        }
        root.addView(bottomNav(0));
        setContentView(page);
    }

    private void renderScan() {
        currentBackAction = this::renderCollections;
        scanFound.clear();
        LinearLayout root = shell();
        root.addView(appBar("Scan Wallet", v -> renderCollections(), false));
        body = vertical();
        root.addView(body);
        inlineStatus = text("Reading tokens and checking for StateNFT collections.", 14, Design.DIM(), Design.sans());
        LinearLayout statusPanel = panel(16);
        statusPanel.addView(text("Scanning Minima Core wallet", 18, Design.INK(), Design.sansBold()));
        statusPanel.addView(inlineStatus, lp(-1, -2, 0, 8, 0, 0));
        ProgressBar p = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        p.setIndeterminate(true);
        statusPanel.addView(p, lp(-1, Design.dp(this, 28), 0, 14, 0, 0));
        body.addView(statusPanel, lp(-1, -2, 20, 18, 20, 16));
        body.addView(sectionLabel("StateNFT collections found"), lp(-1, -2, 20, 0, 20, 8));
        root.addView(bottomNav(0));
        setContentView(page);
        startScan();
    }

    private void startScan() {
        node.cmd("balance", new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONArray bal = json.optJSONArray("response");
                scanBalance(bal == null ? new JSONArray() : bal, 0);
            }
            @Override public void onError(String message) {
                setInlineStatus(message);
            }
        });
    }

    private void scanBalance(JSONArray bal, int idx) {
        if (idx >= bal.length()) {
            collections.clear();
            collections.addAll(scanFound);
            setInlineStatus(scanFound.size() + " collections found");
            body.addView(button("Add Selected", true, v -> renderCollections()), lp(-1, Design.dp(this, 54), 20, 16, 20, 0));
            return;
        }
        setInlineStatus("Checking token " + (idx + 1) + " of " + bal.length());
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
                    scanFound.add(m);
                    body.addView(collectionRow(m), lp(-1, Design.dp(MainActivity.this, 92), 20, 0, 20, 8));
                    done.run();
                });
            }
            @Override public void onError(String message) { done.run(); }
        });
    }

    private void renderCreate() {
        currentBackAction = this::renderCollections;
        LinearLayout root = shell();
        root.addView(appBar("Create Collection", v -> renderCollections(), false));
        body = vertical();
        root.addView(body);

        EditText name = addInputField(body, "Name", "Architect Lines", "Required. 1-40 characters.");
        EditText desc = addInputField(body, "Description", "Monochrome architectural studies.", "Optional. 0-200 characters.");
        EditText size = addInputField(body, "Size (items)", "20", "2-20 items per collection.");
        name.setText(createName);
        desc.setText(createDesc);
        size.setText(createSize);

        final EditText[] baseField = new EditText[1];
        final EditText[] extField = new EditText[1];
        final EditText[] iconField = new EditText[1];
        final EditText[] externalField = new EditText[1];
        final EditText[] webField = new EditText[1];
        TextView modeUrl = button("URL", "url".equals(createMode), v -> {
            saveCreateDraft(name, desc, size, baseField[0], extField[0], iconField[0], externalField[0], webField[0]);
            createMode = "url";
            renderCreate();
        });
        TextView modeEmbed = button("Embed", "embed".equals(createMode), v -> {
            saveCreateDraft(name, desc, size, baseField[0], extField[0], iconField[0], externalField[0], webField[0]);
            createMode = "embed";
            renderCreate();
        });
        LinearLayout mode = horizontal(0, Gravity.CENTER);
        mode.addView(modeUrl, new LinearLayout.LayoutParams(0, Design.dp(this, 50), 1));
        mode.addView(modeEmbed, new LinearLayout.LayoutParams(0, Design.dp(this, 50), 1));

        body.addView(label("Mode"), lp(-1, -2, 20, 10, 20, 6));
        body.addView(mode, lp(-1, -2, 20, 0, 20, 10));
        if ("url".equals(createMode)) {
            baseField[0] = addInputField(body, "Base URL", "https://.../collection/", "Required for URL mode.");
            extField[0] = addInputField(body, "Extension", ".png", "Example: .png, .jpg, .webp.");
            baseField[0].setText(createBase);
            extField[0].setText(createExt);
        }
        iconField[0] = addInputField(body, "Icon URL (optional)", "https://.../icon.png", "Shown in wallets and collection list.");
        externalField[0] = addInputField(body, "External URL (optional)", "https://.../collection", "Opens from collection detail.");
        webField[0] = addInputField(body, "Web Validate URL (optional)", "https://.../validate", "Should return 200 OK for a valid tokenid.");
        iconField[0].setText(createIcon);
        externalField[0].setText(createExternal);
        webField[0].setText(createWeb);
        if ("embed".equals(createMode)) {
            int n = Math.max(2, Math.min(20, parseInt(size.getText().toString(), 20)));
            ensureCreateImages(n);
            body.addView(button("Update Image Slots", false, v -> {
                saveCreateDraft(name, desc, size, baseField[0], extField[0], iconField[0], externalField[0], webField[0]);
                ensureCreateImages(Math.max(2, Math.min(20, parseInt(size.getText().toString(), 20))));
                renderCreate();
            }), lp(-1, Design.dp(this, 48), 20, 0, 20, 10));
            body.addView(sectionLabel("Embed Images"), lp(-1, -2, 20, 0, 20, 8));
            body.addView(button("Choose Images", true, v -> {
                saveCreateDraft(name, desc, size, baseField[0], extField[0], iconField[0], externalField[0], webField[0]);
                pickImages();
            }), lp(-1, Design.dp(this, 52), 20, 0, 20, 8));
            body.addView(note("Stamped Preview"), lp(-1, -2, 20, 0, 20, 6));
            body.addView(imageSlotGrid(), lp(-1, -2, 20, 0, 20, 10));
            for (int i = 0; i < createImages.length; i++) {
                final int idx = i;
                String label = createImages[i] == null || createImages[i].isEmpty()
                        ? "Empty slot #" + (i + 1)
                        : "Replace item #" + (i + 1);
                body.addView(button(label, false, v -> {
                    saveCreateDraft(name, desc, size, baseField[0], extField[0], iconField[0], externalField[0], webField[0]);
                    pickImage(idx);
                }), lp(-1, Design.dp(this, 46), 20, 0, 20, 6));
            }
        }
        body.addView(button("Create Collection", true, v -> createCollection(name, desc, size, baseField[0], extField[0], iconField[0], externalField[0], webField[0])), lp(-1, Design.dp(this, 56), 20, 10, 20, 10));
        body.addView(note("Minting runs as a resumable create-split-stamp job while the app is open."), lp(-1, -2, 20, 0, 20, 16));

        root.addView(bottomNav(1));
        setContentView(page);
        if (jumpCreateImages) {
            jumpCreateImages = false;
            main.postDelayed(() -> page.smoothScrollTo(0, Design.dp(this, 760)), 120);
        }
    }

    private void createCollection(EditText name, EditText desc, EditText size, EditText base,
                                  EditText ext, EditText icon, EditText external, EditText web) {
        saveCreateDraft(name, desc, size, base, ext, icon, external, web);
        String n = name.getText().toString().trim();
        String d = desc.getText().toString().trim();
        String s = size.getText().toString().trim();
        String b = base == null ? "" : base.getText().toString().trim();
        String x = ext == null ? ".png" : ext.getText().toString().trim();
        String ic = icon.getText().toString().trim();
        String ex = external.getText().toString().trim();
        String w = web.getText().toString().trim();
        if (n.isEmpty() || n.length() > 40) { toast("Name must be 1-40 characters"); return; }
        if (d.length() > 200) { toast("Description must be 0-200 characters"); return; }
        int count;
        try { count = Integer.parseInt(s); } catch (Exception e) { toast("Size must be a number"); return; }
        if (count < 2 || count > 20) { toast("Native create supports 2-20 items, matching the MiniDapp wizard"); return; }
        if ("url".equals(createMode) && !b.startsWith("https://")) { toast("Base URL must start https://"); return; }
        if (x.isEmpty()) x = ".png";
        if (!ic.isEmpty() && !ic.startsWith("https://")) { toast("Icon URL must start https://"); return; }
        if (!ex.isEmpty() && !ex.startsWith("https://")) { toast("External URL must start https://"); return; }
        if (!w.isEmpty() && !w.startsWith("https://")) { toast("Web Validate URL must start https://"); return; }
        final String extValue = x;
        if ("embed".equals(createMode)) {
            ensureCreateImages(count);
            for (int i = 0; i < count; i++) {
                if (createImages[i] == null || createImages[i].isEmpty()) {
                    toast("Image missing for item #" + (i + 1));
                    return;
                }
            }
        }
        node.cmd("getaddress", new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONObject r = json.optJSONObject("response");
                if (r == null) { toast("getaddress failed"); return; }
                StateNft.Meta m = new StateNft.Meta();
                m.localId = LocalStore.nextId(MainActivity.this);
                m.name = n;
                m.description = d;
                m.mode = createMode;
                m.size = count;
                m.base = "url".equals(createMode) ? b : "";
                m.ext = extValue;
                m.icon = !ic.isEmpty() ? ic : ("embed".equals(createMode) && createImages.length > 0 ? createImages[0] : "");
                m.externalUrl = ex;
                m.webvalidate = w;
                m.creatorAddr = r.optString("address");
                m.creatorPk = r.optString("publickey");
                m.phase = "CREATE";
                m.creator = true;
                m.created = true;
                JSONArray items = new JSONArray();
                for (int i = 1; i <= count; i++) {
                    JSONObject it = new JSONObject();
                    put(it, "idx", i);
                    put(it, "image", "embed".equals(createMode) ? createImages[i - 1] : (b + i + extValue));
                    items.put(it);
                }
                JSONObject row = MintEngine.rowFromMeta(m, items);
                LocalStore.upsert(MainActivity.this, row);
                resetCreateDraft();
                toast("Minting started");
                MintEngine.resumeNow(MainActivity.this, node, msg -> toast(msg));
                renderCollections();
            }
            @Override public void onError(String message) { toast(message); }
        });
    }

    private void inspectToken(String tokenid, boolean open) {
        toast("Inspecting " + Util.shorten(tokenid));
        node.cmd("tokens tokenid:" + tokenid, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                if (!json.optBoolean("status", true)) {
                    toast("token not found on this node");
                    return;
                }
                JSONObject t = json.optJSONObject("response");
                if (t == null) { toast("token not found"); return; }
                String pk = StateNft.creatorPk(t.optString("script", ""));
                StateNft.Meta m = StateNft.parseMeta(tokenid, t);
                m.creatorPk = pk;
                m.phase = "DONE";
                if (m.localId == 0) m.localId = LocalStore.nextId(MainActivity.this);
                countOwned(m, () -> {
                    LocalStore.upsert(MainActivity.this, MintEngine.rowFromMeta(m, new JSONArray()));
                    loadLocalCollections();
                    boolean known = false;
                    for (StateNft.Meta existing : collections) if (existing.tokenid.equals(m.tokenid)) known = true;
                    if (!known) collections.add(m);
                    if (open) openCollection(m);
                });
            }
            @Override public void onError(String message) { toast(message); }
        });
    }

    private void countOwned(StateNft.Meta m, Runnable done) {
        node.cmd("coins relevant:true tokenid:" + m.tokenid, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONArray coins = json.optJSONArray("response");
                m.owned = coins == null ? 0 : coins.length();
                m.minted = distinctStamped(coins);
                checkCreator(m, done);
            }
            @Override public void onError(String message) { checkCreator(m, done); }
        });
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

    private void openCollection(StateNft.Meta m) {
        currentBackAction = this::renderCollections;
        openMeta = m;
        LinearLayout root = shell();
        root.addView(appBar(m.name, v -> renderCollections(), false));
        body = vertical();
        root.addView(body);
        body.addView(text("Loading on-chain pieces...", 14, Design.DIM(), Design.sans()), lp(-1, -2, 20, 20, 20, 0));
        setContentView(page);
        refreshDetail();
    }

    private void refreshDetail() {
        StateNft.Meta m = openMeta;
        if (m == null) return;
        node.cmd("coins relevant:true tokenid:" + m.tokenid, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                openOwned = json.optJSONArray("response");
                if (openOwned == null) openOwned = new JSONArray();
                m.owned = openOwned.length();
                android.util.Log.d("StateNFT", "detail relevant coins " + m.owned + " token " + Util.shorten(m.tokenid)
                        + " stamped " + distinctStamped(openOwned));
                node.cmd("coins tokenid:" + m.tokenid, new NodeApi.Cb() {
                    @Override public void onResult(JSONObject allJson) {
                        openAll = allJson.optJSONArray("response");
                        if (openAll == null) openAll = openOwned;
                        m.totalSeen = openAll.length();
                        m.minted = distinctStamped(openAll);
                        android.util.Log.d("StateNFT", "detail all coins " + m.totalSeen + " token " + Util.shorten(m.tokenid)
                                + " stamped " + m.minted + " raw=" + allJson.toString().substring(0, Math.min(700, allJson.toString().length())));
                        if (m.size <= 0) m.size = Math.max(m.minted, Math.max(m.totalSeen, m.owned));
                        renderDetail();
                    }
                    @Override public void onError(String message) {
                        openAll = openOwned;
                        m.totalSeen = openOwned.length();
                        m.minted = distinctStamped(openOwned);
                        if (m.size <= 0) m.size = Math.max(m.minted, Math.max(m.totalSeen, m.owned));
                        renderDetail();
                    }
                });
            }
            @Override public void onError(String message) { toast(message); renderDetail(); }
        });
    }

    private void renderDetail() {
        StateNft.Meta m = openMeta;
        if (m == null) return;
        body.removeAllViews();
        List<StateNft.Item> items = StateNft.items(m, openOwned, openAll);
        if (m.created && (m.tokenid == null || m.tokenid.isEmpty())) items = localItemsForMeta(m);
        else if (m.created) items = mergeLocalPreviews(m, items);
        StateNft.Item firstOwned = null;
        for (StateNft.Item item : items) if (item.owned && firstOwned == null) firstOwned = item;
        String heroUrl = !items.isEmpty() ? items.get(0).imageUrl : IconResolver.resolve(m.icon);

        if (activeMint(m)) body.addView(mintStatusPanel(m, items), lp(-1, -2, 20, 8, 20, 12));
        if ("NEEDIMAGES".equals(m.phase)) body.addView(recoveryPanel(m), lp(-1, -2, 20, 0, 20, 12));

        ImageView hero = new ImageView(this);
        hero.setScaleType(ImageView.ScaleType.CENTER_CROP);
        hero.setImageBitmap(Identicon.forToken(m.tokenid, 900));
        if (heroUrl != null && !heroUrl.isEmpty()) ImageLoader.loadFull(this, heroUrl, hero);
        body.addView(hero, lp(-1, Design.dp(this, 180), 20, 8, 20, 10));

        LinearLayout meta = panel(12);
        meta.addView(kv("TokenID", Util.shorten(m.tokenid)));
        meta.addView(kv("Mode", modeLabel(m)));
        meta.addView(kv("Items", String.valueOf(m.size)));
        meta.addView(kv("Owned", String.valueOf(m.owned)));
        meta.addView(kv("Minted", m.minted + " / " + m.size));
        meta.addView(kv("Phase", m.phase == null ? "DONE" : m.phase));
        if (m.error != null && !m.error.isEmpty()) meta.addView(kv("Error", m.error));
        meta.addView(kv("Validation", m.webvalidate.isEmpty() ? "Not set" : "Web validate URL"));
        body.addView(meta, lp(-1, -2, 20, 0, 20, 12));

        LinearLayout actions = horizontal(8, Gravity.CENTER_VERTICAL);
        StateNft.Item transferTarget = firstOwned;
        actions.addView(button("Transfer Item", true, v -> {
            if (transferTarget == null) toast("No owned stamped item to transfer");
            else transferScreen(transferTarget);
        }), new LinearLayout.LayoutParams(0, Design.dp(this, 50), 1));
        actions.addView(button("Refresh", false, v -> refreshDetail()), new LinearLayout.LayoutParams(0, Design.dp(this, 50), 1));
        actions.addView(button("Bury", false, v -> renderBury()), new LinearLayout.LayoutParams(0, Design.dp(this, 50), 1));
        body.addView(actions, lp(-1, -2, 20, 0, 20, 16));
        if (m.created && !"DONE".equals(m.phase) && !"BURIED".equals(m.phase)) {
            body.addView(button("Resume Mint", true, v -> {
                MintEngine.resumeNow(this, node, msg -> {
                    toast(msg);
                    loadLocalCollections();
                    openMeta = findCollectionByLocalId(m.localId, m);
                    refreshDetail();
                });
            }), lp(-1, Design.dp(this, 52), 20, 0, 20, 14));
        }

        body.addView(sectionLabel("Items - tap an owned item to transfer"), lp(-1, -2, 20, 0, 20, 8));
        if (items.isEmpty()) {
            LinearLayout empty = panel(14);
            empty.addView(text("No Items Visible", 17, Design.INK(), Design.sansBold()));
            empty.addView(note("The token opened, but this node did not return item coins for it yet."), lp(-1, -2, 0, 8, 0, 0));
            body.addView(empty, lp(-1, -2, 20, 0, 20, 12));
            return;
        }
        int max = Math.min(items.size(), 60);
        for (int i = 0; i < max; i += 2) {
            LinearLayout row = horizontal(8, Gravity.TOP);
            row.setPadding(Design.dp(this, 20), 0, Design.dp(this, 20), 0);
            row.addView(itemTile(items.get(i)), new LinearLayout.LayoutParams(0, Design.dp(this, 188), 1));
            if (i + 1 < max) row.addView(itemTile(items.get(i + 1)), new LinearLayout.LayoutParams(0, Design.dp(this, 188), 1));
            else row.addView(new Space(this), new LinearLayout.LayoutParams(0, 1, 1));
            body.addView(row, lp(-1, -2, 0, 0, 0, 8));
        }
    }

    private View itemTile(StateNft.Item it) {
        LinearLayout tile = vertical();
        tile.setBackground(Design.stroke(Design.PAPER(), it.owned ? Design.ACCENT() : Design.RAIL()));
        tile.setClickable(it.owned);
        if (it.owned) {
            Design.pressable(tile);
            tile.setOnClickListener(v -> transferScreen(it));
        }
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken((openMeta == null ? "" : openMeta.tokenid) + it.index, 420));
        if (it.imageUrl != null && !it.imageUrl.isEmpty()) ImageLoader.loadOver(this, it.imageUrl, img);
        tile.addView(img, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout line = horizontal(4, Gravity.CENTER_VERTICAL);
        line.setPadding(Design.dp(this, 8), Design.dp(this, 6), Design.dp(this, 8), Design.dp(this, 6));
        line.addView(text("#" + it.index, 14, Design.INK(), Design.monoBold()), new LinearLayout.LayoutParams(0, -2, 1));
        line.addView(text(it.owned ? "Owned" : (it.coin == null ? "Unseen" : "On-chain"), 11,
                it.owned ? Design.GOOD() : Design.DIM(), Design.sansBold()));
        tile.addView(line);
        return tile;
    }

    private void transferScreen(StateNft.Item it) {
        if (it.coin == null || openMeta == null) return;
        currentBackAction = () -> openCollection(openMeta);
        LinearLayout root = shell();
        root.addView(appBar("Item #" + String.format("%04d", it.index), v -> openCollection(openMeta), false));
        body = vertical();
        root.addView(body);

        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken(openMeta.tokenid + it.index, 900));
        if (it.imageUrl != null && !it.imageUrl.isEmpty()) ImageLoader.loadFull(this, it.imageUrl, img);
        body.addView(img, lp(-1, Design.dp(this, 230), 20, 8, 20, 12));

        LinearLayout state = panel(12);
        state.addView(text("Preserved State", 16, Design.INK(), Design.sansBold()));
        state.addView(note("This transfer recreates every state port so identity remains intact."), lp(-1, -2, 0, 6, 0, 8));
        state.addView(kv("Port 0", StateNft.state(it.coin, 0) == null ? "Missing" : StateNft.state(it.coin, 0)));
        state.addView(kv("Port 1", StateNft.state(it.coin, 1) == null ? "No image state" : "Image state"));
        body.addView(state, lp(-1, -2, 20, 0, 20, 12));

        EditText to = addInputField(body, "Recipient address", "Mx12 3456 7890 abcd ef12 3456 7890 abcd ef12", "");
        TextView status = note("Ready");
        body.addView(status, lp(-1, -2, 20, 4, 20, 8));
        body.addView(button("Transfer Item", true, v -> doTransfer(it, to, status)), lp(-1, Design.dp(this, 56), 20, 0, 20, 20));
        setContentView(page);
    }

    private void doTransfer(StateNft.Item it, EditText to, TextView msg) {
        String addr = to.getText().toString().trim().replace(" ", "");
        if (!Util.isValidAddress(addr)) { msg.setText("Invalid recipient address"); return; }
        if (!StateNft.replayableState(it.coin)) { msg.setText("Refusing malformed coin state"); return; }
        msg.setText("Building transaction...");
        String txn = "statenft" + System.currentTimeMillis();
        node.cmd("txndelete id:" + txn, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) { runTransfer(txn, it, addr, msg); }
            @Override public void onError(String message) { runTransfer(txn, it, addr, msg); }
        });
    }

    private void runTransfer(String txn, StateNft.Item it, String addr, TextView msg) {
        CmdChain.run(node, StateNft.transferCommands(txn, openMeta.tokenid, it.coin, addr), "txndelete id:" + txn, new CmdChain.Done() {
            @Override public void ok(JSONObject last) {
                node.cmd("txndelete id:" + txn, ignore());
                msg.setText("Posted. Waiting for confirmation...");
                watchDeparture(it.coin.optString("coinid"), () -> {
                    toast("Item #" + it.index + " transferred");
                    openCollection(openMeta);
                }, () -> msg.setText("Not confirmed yet. Refresh in a few minutes."));
            }
            @Override public void fail(String message) { msg.setText("Failed: " + message); }
        });
    }

    private void renderBury() {
        StateNft.Meta m = openMeta;
        if (m == null) return;
        currentBackAction = () -> openCollection(m);
        LinearLayout root = shell();
        root.addView(appBar("Bury Collection", v -> openCollection(m), false));
        body = vertical();
        root.addView(body);

        body.addView(spacer(18));
        TextView name = text(m.name, 25, Design.INK(), Design.sansBold());
        name.setGravity(Gravity.CENTER);
        body.addView(name, lp(-1, -2, 20, 0, 20, 18));
        LinearLayout facts = panel(12);
        facts.addView(kv("Owned Coins", String.valueOf(m.owned)));
        facts.addView(kv("Graveyard Address", Util.shorten(StateNft.GRAVEYARD)));
        facts.addView(kv("Action", "Bury owned coins"));
        body.addView(facts, lp(-1, -2, 20, 0, 20, 12));

        LinearLayout warnings = panel(12);
        warnings.addView(text("Irreversible", 16, Design.RED(), Design.sansBold()));
        warnings.addView(note("Burying is permanent. Coins cannot be recovered."), lp(-1, -2, 0, 4, 0, 12));
        warnings.addView(text("Only your owned coins are buried", 16, Design.RED(), Design.sansBold()));
        warnings.addView(note("Coins held by other collectors are not touched."), lp(-1, -2, 0, 4, 0, 0));
        body.addView(warnings, lp(-1, -2, 20, 0, 20, 12));

        EditText confirm = addInputField(body, "Type collection name to confirm", "", "");
        TextView msg = note("Type the exact collection name to enable burial.");
        body.addView(msg, lp(-1, -2, 20, 4, 20, 10));
        body.addView(dangerButton("Bury Owned Coins", v -> {
            if (!m.name.equals(confirm.getText().toString().trim())) {
                msg.setText("Collection name does not match.");
                return;
            }
            msg.setText("Checking wallet coins...");
            buryOwnedCoins(m, msg);
        }), lp(-1, Design.dp(this, 56), 20, 0, 20, 20));
        setContentView(page);
    }

    private void buryOwnedCoins(StateNft.Meta m, TextView msg) {
        node.cmd("coins relevant:true tokenid:" + m.tokenid, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {
                JSONArray coins = json.optJSONArray("response");
                if (coins == null || coins.length() == 0) { msg.setText("No owned coins to bury."); return; }
                buryOne(m, coins, 0, msg);
            }
            @Override public void onError(String message) { msg.setText(message); }
        });
    }

    private void buryOne(StateNft.Meta m, JSONArray coins, int i, TextView msg) {
        if (i >= coins.length()) {
            msg.setText("Burial transactions posted.");
            toast("Burial posted");
            refreshDetail();
            return;
        }
        JSONObject c = coins.optJSONObject(i);
        if (c == null) { buryOne(m, coins, i + 1, msg); return; }
        msg.setText("Burying " + (i + 1) + "/" + coins.length() + "...");
        String txn = "bury" + (System.currentTimeMillis() % 100000);
        boolean preserve = StateNft.replayableState(c);
        node.cmd("txndelete id:" + txn, new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) { runBury(m, coins, i, c, txn, preserve, msg); }
            @Override public void onError(String message) { runBury(m, coins, i, c, txn, preserve, msg); }
        });
    }

    private void runBury(StateNft.Meta m, JSONArray coins, int i, JSONObject c, String txn,
                         boolean preserve, TextView msg) {
        CmdChain.run(node, StateNft.buryCommands(txn, m.tokenid, m.creatorPk, c, preserve), "txndelete id:" + txn, new CmdChain.Done() {
            @Override public void ok(JSONObject last) {
                node.cmd("txndelete id:" + txn, ignore());
                buryOne(m, coins, i + 1, msg);
            }
            @Override public void fail(String message) {
                if (preserve && message.toLowerCase().contains("size too large") && !m.creatorPk.isEmpty()) {
                    runBury(m, coins, i, c, txn + "s", false, msg);
                } else {
                    msg.setText("Failed: " + message);
                }
            }
        });
    }

    private void renderSettings() {
        currentBackAction = this::renderCollections;
        LinearLayout root = shell();
        root.addView(appBar("Settings", null, false));
        body = vertical();
        root.addView(body);
        LinearLayout nodePanel = panel(14);
        nodePanel.addView(text("Node Status", 17, Design.INK(), Design.sansBold()));
        nodePanel.addView(kv("Minima Core", node != null && node.isEnabled() ? "Connected" : "Not enabled"));
        nodePanel.addView(kv("Enabled", node != null && node.isEnabled() ? "Yes" : "No"));
        nodePanel.addView(kv("Last Node Response", node == null || node.lastOkMs() == 0 ? "None" : "Received"));
        body.addView(nodePanel, lp(-1, -2, 20, 14, 20, 12));
        body.addView(button("Open Minima Core", true, v -> openMinimaCore()), lp(-1, Design.dp(this, 54), 20, 0, 20, 10));
        body.addView(button("Reconnect", false, v -> { if (node != null) node.reRegister(); }), lp(-1, Design.dp(this, 54), 20, 0, 20, 10));
        body.addView(button("Clear Local Cache", false, v -> { collections.clear(); toast("Local collection list cleared"); renderCollections(); }),
                lp(-1, Design.dp(this, 54), 20, 0, 20, 16));

        LinearLayout app = panel(14);
        app.addView(text("App Information", 17, Design.INK(), Design.sansBold()));
        app.addView(kv("App Name", "StateNFT Suite"));
        app.addView(kv("Package", getPackageName()));
        app.addView(kv("Version", BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"));
        body.addView(app, lp(-1, -2, 20, 0, 20, 20));
        root.addView(bottomNav(2));
        setContentView(page);
    }

    private void watchDeparture(String coinid, Runnable ok, Runnable unsure) {
        final int[] tries = {0};
        final Runnable[] pollRef = new Runnable[1];
        Runnable poll = new Runnable() {
            @Override public void run() {
                if (openMeta == null) { unsure.run(); return; }
                tries[0]++;
                node.cmd("coins relevant:true tokenid:" + openMeta.tokenid, new NodeApi.Cb() {
                    @Override public void onResult(JSONObject json) {
                        JSONArray cs = json.optJSONArray("response");
                        boolean still = false;
                        if (cs != null) {
                            for (int i = 0; i < cs.length(); i++) {
                                JSONObject c = cs.optJSONObject(i);
                                if (c != null && coinid.equals(c.optString("coinid"))) still = true;
                            }
                        }
                        if (!still) ok.run();
                        else if (tries[0] > 20) unsure.run();
                        else main.postDelayed(pollRef[0], 20000);
                    }
                    @Override public void onError(String message) {
                        if (tries[0] > 20) unsure.run();
                        else main.postDelayed(pollRef[0], 20000);
                    }
                });
            }
        };
        pollRef[0] = poll;
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

    private View collectionRow(StateNft.Meta m) {
        LinearLayout row = vertical();
        row.setPadding(Design.dp(this, 10), Design.dp(this, 10), Design.dp(this, 10), Design.dp(this, 10));
        row.setBackground(Design.stroke(Design.PAPER(), Design.RAIL()));
        row.setClickable(true);
        Design.pressable(row);
        row.setOnClickListener(v -> openCollection(m));

        LinearLayout top = horizontal(12, Gravity.CENTER_VERTICAL);
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken(m.tokenid, 160));
        String icon = collectionLeadImage(m);
        if (icon != null) ImageLoader.loadOver(this, icon, img);
        top.addView(img, new LinearLayout.LayoutParams(Design.dp(this, 66), Design.dp(this, 66)));

        LinearLayout copy = vertical();
        copy.addView(text(m.name, 15, Design.INK(), Design.sansBold()));
        copy.addView(text(m.tokenid == null || m.tokenid.isEmpty() ? "Token not created yet" : Util.shorten(m.tokenid), 11, Design.DIM(), Design.mono()));
        copy.addView(text(collectionProgressText(m), 12, Design.GRAPHITE(), Design.sans()));
        top.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));

        TextView badge = Design.chip(this, collectionStatus(m),
                collectionStatusColor(m), Design.RAIL());
        top.addView(badge);
        top.addView(text(">", 24, Design.INK(), Design.sans()));
        row.addView(top);
        row.addView(progressBar(collectionProgress(m)), lp(-1, Design.dp(this, 5), 78, 8, 8, 8));
        row.addView(thumbnailStrip(m, 6), lp(-1, Design.dp(this, 42), 78, 0, 8, 0));
        return row;
    }

    private String collectionLeadImage(StateNft.Meta m) {
        String icon = IconResolver.resolve(m == null ? "" : m.icon);
        if (icon != null && !icon.isEmpty()) return icon;
        List<StateNft.Item> local = localItemsForMeta(m);
        if (!local.isEmpty()) return local.get(0).imageUrl;
        return null;
    }

    private LinearLayout mintStatusPanel(StateNft.Meta m, List<StateNft.Item> items) {
        LinearLayout panel = panel(14);
        LinearLayout head = horizontal(10, Gravity.CENTER_VERTICAL);
        LinearLayout copy = vertical();
        copy.addView(text(collectionStatus(m), 19, Design.INK(), Design.sansBold()));
        copy.addView(text(collectionProgressText(m), 12, Design.GRAPHITE(), Design.sans()));
        head.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        TextView live = Design.chip(this, activeMint(m) ? "Live" : "Done", activeMint(m) ? Design.ACCENT() : Design.GOOD(), Design.RAIL());
        head.addView(live);
        panel.addView(head);
        panel.addView(phaseRail(m), lp(-1, Design.dp(this, 42), 0, 14, 0, 8));
        panel.addView(progressBar(collectionProgress(m)), lp(-1, Design.dp(this, 6), 0, 0, 0, 12));
        panel.addView(mintThumbStrip(items, 8), lp(-1, Design.dp(this, 54), 0, 0, 0, 8));
        String msg = "NEEDIMAGES".equals(m.phase)
                ? "Add the missing embedded images, then resume minting."
                : "The app advances this collection through create, move, split and stamp while it is open.";
        panel.addView(note(msg));
        if (m.error != null && !m.error.isEmpty()) panel.addView(text(m.error, 12, Design.RED(), Design.sansBold()), lp(-1, -2, 0, 8, 0, 0));
        return panel;
    }

    private LinearLayout recoveryPanel(StateNft.Meta m) {
        LinearLayout panel = panel(14);
        panel.addView(text("Missing Embedded Images", 18, Design.INK(), Design.sansBold()));
        panel.addView(note("The previews below are the bytes that will be stamped."), lp(-1, -2, 0, 6, 0, 10));
        panel.addView(button("Choose Missing Images", true, v -> pickRecoveryImages(m)), lp(-1, Design.dp(this, 50), 0, 0, 0, 10));
        panel.addView(recoveryImageGrid(m), lp(-1, -2, 0, 0, 0, 8));
        int missing = missingLocalImages(m);
        TextView state = note(missing == 0 ? "Ready to resume minting." : missing + " images still missing.");
        panel.addView(state);
        if (missing == 0) {
            panel.addView(button("Resume Stamping", true, v -> {
                JSONObject row = LocalStore.findById(this, m.localId);
                if (row != null) {
                    put(row, "phase", "MOVE");
                    put(row, "error", "");
                    LocalStore.upsert(this, row);
                    MintEngine.resumeNow(this, node, msg -> toast(msg));
                    loadLocalCollections();
                    openMeta = findCollectionByLocalId(m.localId, m);
                    openCollection(openMeta);
                }
            }), lp(-1, Design.dp(this, 50), 0, 10, 0, 0));
        }
        return panel;
    }

    private LinearLayout phaseRail(StateNft.Meta m) {
        String[] phases = {"CREATE", "MOVE", "SPLIT", "STAMP", "DONE"};
        String phase = m == null || m.phase == null ? "" : m.phase;
        int current = phaseIndex(phase);
        LinearLayout rail = horizontal(4, Gravity.CENTER_VERTICAL);
        for (int i = 0; i < phases.length; i++) {
            boolean done = current > i || ("DONE".equals(phase) && i == phases.length - 1);
            boolean now = current == i && !"DONE".equals(phase);
            TextView chip = Design.chip(this, phases[i], done ? Design.GOOD() : (now ? Design.ACCENT() : Design.DIM()), now ? Design.ACCENT() : Design.RAIL());
            rail.addView(chip, new LinearLayout.LayoutParams(0, Design.dp(this, 34), 1));
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

    private LinearLayout mintThumbStrip(List<StateNft.Item> items, int max) {
        LinearLayout strip = horizontal(6, Gravity.CENTER_VERTICAL);
        int count = Math.min(max, items == null ? 0 : items.size());
        for (int i = 0; i < count; i++) {
            StateNft.Item it = items.get(i);
            LinearLayout cell = vertical();
            cell.setBackground(Design.stroke(it.coin != null ? Design.PAPER() : 0xFFF1F1EF, it.coin != null ? Design.ACCENT() : Design.RAIL()));
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setImageBitmap(Identicon.forToken("mint" + i, 80));
            if (it.imageUrl != null && !it.imageUrl.isEmpty()) ImageLoader.loadOver(this, it.imageUrl, iv);
            cell.addView(iv, new LinearLayout.LayoutParams(-1, 0, 1));
            TextView lab = text("#" + it.index, 9, Design.DIM(), Design.monoBold());
            lab.setGravity(Gravity.CENTER);
            cell.addView(lab, new LinearLayout.LayoutParams(-1, Design.dp(this, 16)));
            strip.addView(cell, new LinearLayout.LayoutParams(Design.dp(this, 48), Design.dp(this, 54)));
        }
        if (count == 0) strip.addView(note("Images will appear here as they are selected or stamped."));
        return strip;
    }

    private String collectionStatus(StateNft.Meta m) {
        String p = m == null || m.phase == null ? "DONE" : m.phase;
        if ("CREATE".equals(p)) return "Creating";
        if ("MOVE".equals(p)) return "Moving";
        if ("SPLIT".equals(p)) return "Splitting";
        if ("STAMP".equals(p)) return "Stamping";
        if ("NEEDIMAGES".equals(p)) return "Images Needed";
        if ("BURIED".equals(p)) return "Buried";
        if (m != null && m.size > 0 && m.minted >= m.size) return "Minted";
        return "Open";
    }

    private int collectionStatusColor(StateNft.Meta m) {
        String p = m == null || m.phase == null ? "DONE" : m.phase;
        if ("DONE".equals(p) && m != null && m.size > 0 && m.minted >= m.size) return Design.GOOD();
        if ("BURIED".equals(p)) return Design.DIM();
        if ("NEEDIMAGES".equals(p)) return Design.RED();
        return Design.ACCENT();
    }

    private boolean activeMint(StateNft.Meta m) {
        String p = m == null || m.phase == null ? "" : m.phase;
        return "CREATE".equals(p) || "MOVE".equals(p) || "SPLIT".equals(p) || "STAMP".equals(p) || "NEEDIMAGES".equals(p);
    }

    private String collectionProgressText(StateNft.Meta m) {
        if (m == null) return "";
        String stage = collectionStatus(m);
        int minted = Math.max(0, m.minted);
        int size = Math.max(0, m.size);
        return stage + "   Items " + size + "   Stamped " + minted + "/" + size + "   Owned " + m.owned;
    }

    private float collectionProgress(StateNft.Meta m) {
        if (m == null) return 0f;
        if (m.size > 0 && m.minted > 0) return Math.min(1f, m.minted / (float) m.size);
        String p = m.phase == null ? "" : m.phase;
        if ("CREATE".equals(p)) return 0.12f;
        if ("MOVE".equals(p)) return 0.28f;
        if ("SPLIT".equals(p)) return 0.48f;
        if ("STAMP".equals(p)) return 0.68f;
        if ("DONE".equals(p)) return 1f;
        return 0f;
    }

    private View progressBar(float pct) {
        LinearLayout outer = horizontal(0, Gravity.CENTER_VERTICAL);
        outer.setBackground(Design.stroke(0x00FFFFFF, Design.RAIL()));
        TextView fill = new TextView(this);
        fill.setBackgroundColor(Design.ACCENT());
        outer.addView(fill, new LinearLayout.LayoutParams(0, -1, Math.max(0.02f, Math.min(1f, pct))));
        Space rest = new Space(this);
        outer.addView(rest, new LinearLayout.LayoutParams(0, -1, Math.max(0.02f, 1f - Math.min(1f, pct))));
        return outer;
    }

    private LinearLayout thumbnailStrip(StateNft.Meta m, int max) {
        LinearLayout strip = horizontal(6, Gravity.CENTER_VERTICAL);
        List<StateNft.Item> items = localItemsForMeta(m);
        if (items.isEmpty() && m != null) items = StateNft.items(m, openOwned, openAll);
        int count = Math.min(max, items.size());
        for (int i = 0; i < count; i++) {
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setImageBitmap(Identicon.forToken((m == null ? "" : m.tokenid) + i, 80));
            String url = items.get(i).imageUrl;
            if (url != null && !url.isEmpty()) ImageLoader.loadOver(this, url, iv);
            strip.addView(iv, new LinearLayout.LayoutParams(Design.dp(this, 38), Design.dp(this, 38)));
        }
        if (count == 0) strip.addView(note("No images visible yet"));
        return strip;
    }

    private LinearLayout appBar(String title, View.OnClickListener back, boolean menu) {
        LinearLayout bar = horizontal(12, Gravity.CENTER_VERTICAL);
        bar.setPadding(Design.dp(this, 20), Design.dp(this, 12), Design.dp(this, 20), Design.dp(this, 12));
        if (back != null) {
            currentBackAction = () -> back.onClick(bar);
            TextView backButton = iconButton("< Back", back);
            bar.addView(backButton, new LinearLayout.LayoutParams(Design.dp(this, 78), Design.dp(this, 44)));
        }
        else if (menu) bar.addView(iconButton("Menu", v -> {}), new LinearLayout.LayoutParams(Design.dp(this, 52), Design.dp(this, 40)));
        TextView tv = text(title, 20, Design.INK(), Design.sansBold());
        bar.addView(tv, new LinearLayout.LayoutParams(0, -2, 1));
        nodeChip = Design.chip(this, node != null && node.isEnabled() ? "Connected" : "Not enabled",
                node != null && node.isEnabled() ? Design.GOOD() : Design.DIM(), Design.RAIL());
        bar.addView(nodeChip);
        return bar;
    }

    private LinearLayout bottomNav(int active) {
        LinearLayout nav = horizontal(0, Gravity.CENTER);
        nav.setPadding(Design.dp(this, 20), Design.dp(this, 10), Design.dp(this, 20), 0);
        nav.addView(navItem("Collections", active == 0, v -> renderCollections()), new LinearLayout.LayoutParams(0, Design.dp(this, 58), 1));
        nav.addView(navItem("Create", active == 1, v -> renderCreate()), new LinearLayout.LayoutParams(0, Design.dp(this, 58), 1));
        nav.addView(navItem("Settings", active == 2, v -> renderSettings()), new LinearLayout.LayoutParams(0, Design.dp(this, 58), 1));
        return nav;
    }

    private TextView navItem(String label, boolean active, View.OnClickListener click) {
        TextView t = text(label, 11, active ? Design.INK() : Design.DIM(), active ? Design.sansBold() : Design.sans());
        t.setGravity(Gravity.CENTER);
        t.setBackground(Design.stroke(active ? 0x11111111 : 0x00FFFFFF, active ? Design.ACCENT() : Design.RAIL()));
        t.setOnClickListener(click);
        t.setClickable(true);
        return t;
    }

    private LinearLayout panel(int pad) {
        LinearLayout p = vertical();
        p.setPadding(Design.dp(this, pad), Design.dp(this, pad), Design.dp(this, pad), Design.dp(this, pad));
        p.setBackground(Design.stroke(Design.PAPER(), Design.RAIL()));
        return p;
    }

    private TextView button(String label, boolean filled, View.OnClickListener click) {
        TextView b = text(label, 13, filled ? Design.PAPER() : Design.INK(), Design.sansBold());
        b.setGravity(Gravity.CENTER);
        b.setBackground(Design.ripple(Design.lineButton(this, filled)));
        b.setClickable(true);
        b.setOnClickListener(click);
        Design.pressable(b);
        return b;
    }

    private TextView dangerButton(String label, View.OnClickListener click) {
        TextView b = text(label, 13, 0xFFFFFFFF, Design.sansBold());
        b.setGravity(Gravity.CENTER);
        b.setBackground(Design.ripple(Design.stroke(0xFFC4493D, 0xFFC4493D)));
        b.setClickable(true);
        b.setOnClickListener(click);
        Design.pressable(b);
        return b;
    }

    private TextView iconButton(String label, View.OnClickListener click) {
        TextView b = text(label, label.length() > 2 ? 13 : 24, Design.INK(), Design.sansBold());
        b.setGravity(Gravity.CENTER);
        b.setBackground(Design.ripple(Design.stroke(0x00FFFFFF, Design.RAIL())));
        b.setClickable(true);
        b.setOnClickListener(click);
        Design.pressable(b);
        return b;
    }

    private EditText addInputField(LinearLayout parent, String label, String hint, String help) {
        LinearLayout box = vertical();
        box.addView(label(label), lp(-1, -2, 0, 0, 0, 5));
        EditText e = input(hint, false);
        box.addView(e, new LinearLayout.LayoutParams(-1, Design.dp(this, 50)));
        if (help != null && !help.isEmpty()) box.addView(note(help), lp(-1, -2, 0, 5, 0, 0));
        box.setPadding(Design.dp(this, 20), Design.dp(this, 0), Design.dp(this, 20), Design.dp(this, 10));
        parent.addView(box);
        return e;
    }

    private TextView label(String s) {
        return text(s, 12, Design.INK(), Design.sansBold());
    }

    private TextView sectionLabel(String s) {
        return text(s, 13, Design.INK(), Design.sansBold());
    }

    private TextView note(String s) {
        return text(s, 12, Design.DIM(), Design.sans());
    }

    private LinearLayout kv(String k, String v) {
        LinearLayout row = horizontal(8, Gravity.CENTER_VERTICAL);
        row.setPadding(0, Design.dp(this, 5), 0, Design.dp(this, 5));
        row.addView(text(k, 13, Design.GRAPHITE(), Design.sans()), new LinearLayout.LayoutParams(0, -2, 1));
        TextView val = text(v == null ? "" : v, 13, Design.INK(), Design.sansBold());
        val.setGravity(Gravity.RIGHT);
        row.addView(val, new LinearLayout.LayoutParams(0, -2, 1));
        return row;
    }

    private EditText input(String hint, boolean multi) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextColor(Design.INK());
        e.setHintTextColor(Design.DIM());
        e.setTextSize(14);
        e.setTypeface(Design.sans());
        e.setSingleLine(!multi);
        e.setInputType(multi ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE : InputType.TYPE_CLASS_TEXT);
        e.setPadding(Design.dp(this, 12), 0, Design.dp(this, 12), 0);
        e.setBackground(Design.stroke(Design.PAPER(), Design.RAIL_DARK()));
        return e;
    }

    private TextView text(String s, float sp, int color, Typeface tf) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(sp);
        t.setTypeface(tf);
        t.setIncludeFontPadding(true);
        return t;
    }

    private LinearLayout shell() {
        page = new ScrollView(this);
        page.setFillViewport(true);
        page.setBackgroundColor(Design.BG());
        LinearLayout root = vertical();
        root.setPadding(0, Design.dp(this, 4), 0, Design.dp(this, 22));
        page.addView(root, new ScrollView.LayoutParams(-1, -2));
        return root;
    }

    private LinearLayout vertical() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private LinearLayout horizontal(int gap, int gravity) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(gravity);
        return l;
    }

    private View spacer(int h) {
        Space s = new Space(this);
        s.setLayoutParams(new LinearLayout.LayoutParams(1, Design.dp(this, h)));
        return s;
    }

    private LinearLayout.LayoutParams lp(int w, int h, int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, h);
        p.setMargins(Design.dp(this, l), Design.dp(this, t), Design.dp(this, r), Design.dp(this, b));
        return p;
    }

    private void refreshNodeChip() {
        if (nodeChip == null) return;
        nodeChip.setText(node != null && node.isEnabled() ? "Connected" : "Not enabled");
        nodeChip.setTextColor(node != null && node.isEnabled() ? Design.GOOD() : Design.DIM());
    }

    private void setInlineStatus(String s) {
        if (inlineStatus != null) {
            inlineStatus.setText(s);
            Design.pulse(inlineStatus);
        }
    }

    private String modeLabel(StateNft.Meta m) {
        if (m == null) return "";
        if ("embed".equalsIgnoreCase(m.mode)) return "NFT (embedded state image)";
        return "NFT (One TokenID, many states)";
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

    private NodeApi.Cb ignore() {
        return new NodeApi.Cb() {
            @Override public void onResult(JSONObject json) {}
            @Override public void onError(String message) {}
        };
    }

    private void loadLocalCollections() {
        ArrayList<StateNft.Meta> locals = new ArrayList<>();
        JSONArray rows = LocalStore.load(this);
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null) locals.add(MintEngine.metaFromRow(row));
        }
        for (StateNft.Meta local : locals) {
            boolean replaced = false;
            for (int i = 0; i < collections.size(); i++) {
                StateNft.Meta existing = collections.get(i);
                if ((local.localId != 0 && local.localId == existing.localId)
                        || (!local.tokenid.isEmpty() && local.tokenid.equals(existing.tokenid))) {
                    collections.set(i, local);
                    replaced = true;
                    break;
                }
            }
            if (!replaced) collections.add(local);
        }
    }

    private StateNft.Meta findCollectionByLocalId(long id, StateNft.Meta fallback) {
        loadLocalCollections();
        for (StateNft.Meta m : collections) if (m.localId == id) return m;
        return fallback;
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
                    ? "data:image/jpeg;base64," + j.optString("image")
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
        ArrayList<StateNft.Item> out = new ArrayList<>();
        for (StateNft.Item it : chainItems) {
            String localUrl = preview.get(it.index);
            if (localUrl != null && !localUrl.isEmpty()
                    && (it.coin == null || it.imageUrl == null || it.imageUrl.isEmpty()
                    || it.imageUrl.equals(IconResolver.resolve(m.icon)))) {
                it.imageUrl = localUrl;
            }
            out.add(it);
        }
        return out;
    }

    private String localImage(long localId, int idx) {
        JSONObject row = LocalStore.findById(this, localId);
        if (row == null) return "";
        JSONArray items = MintEngine.localItems(row);
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it != null && it.optInt("idx") == idx) return it.optString("image", "");
        }
        return "";
    }

    private int missingLocalImages(StateNft.Meta m) {
        if (m == null || !"embed".equals(m.mode)) return 0;
        int missing = 0;
        for (int i = 1; i <= m.size; i++) {
            String img = localImage(m.localId, i);
            if (img == null || img.isEmpty()) missing++;
        }
        return missing;
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

    private void rotateRecoveryImage(long localId, int idx) {
        JSONObject row = LocalStore.findById(this, localId);
        if (row == null) return;
        String img = localImageInRow(row, idx);
        if (img.isEmpty()) return;
        String rotated = ImageTools.rotateBase64(img, 90, 8000);
        if (rotated.isEmpty()) { toast("Could not rotate image"); return; }
        setLocalImage(row, idx, rotated);
        LocalStore.upsert(this, row);
        loadLocalCollections();
        openMeta = findCollectionByLocalId(localId, openMeta);
        openCollection(openMeta);
    }

    private void ensureCreateImages(int count) {
        if (createImages.length == count) return;
        String[] next = new String[count];
        for (int i = 0; i < Math.min(createImages.length, next.length); i++) next[i] = createImages[i];
        createImages = next;
    }

    private void saveCreateDraft(EditText name, EditText desc, EditText size, EditText base,
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

    private void resetCreateDraft() {
        createName = "";
        createDesc = "";
        createSize = "20";
        createBase = "";
        createExt = ".png";
        createIcon = "";
        createExternal = "";
        createWeb = "";
        createImages = new String[0];
    }

    private LinearLayout imageSlotGrid() {
        LinearLayout grid = vertical();
        int cols = 4;
        for (int i = 0; i < createImages.length; i += cols) {
            LinearLayout row = horizontal(8, Gravity.CENTER);
            for (int c = 0; c < cols; c++) {
                int idx = i + c;
                if (idx >= createImages.length) {
                    Space s = new Space(this);
                    row.addView(s, new LinearLayout.LayoutParams(0, Design.dp(this, 86), 1));
                    continue;
                }
                row.addView(imageSlotCell(idx), new LinearLayout.LayoutParams(0, Design.dp(this, 86), 1));
            }
            grid.addView(row, lp(-1, Design.dp(this, 86), 0, 0, 0, 8));
        }
        return grid;
    }

    private View imageSlotCell(int idx) {
        LinearLayout cell = vertical();
        cell.setPadding(Design.dp(this, 4), Design.dp(this, 4), Design.dp(this, 4), Design.dp(this, 4));
        boolean ready = idx < createImages.length && createImages[idx] != null && !createImages[idx].isEmpty();
        cell.setBackground(Design.stroke(ready ? Design.PAPER() : 0xFFF1F1EF, ready ? Design.INK() : Design.RAIL()));
        cell.setClickable(true);
        cell.setOnClickListener(v -> {
            if (idx < createImages.length && createImages[idx] != null && !createImages[idx].isEmpty()) rotateCreateImage(idx);
            else pickImage(idx);
        });
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken("slot" + idx, 160));
        if (ready) ImageLoader.loadOver(this, "data:image/jpeg;base64," + createImages[idx], img);
        cell.addView(img, new LinearLayout.LayoutParams(-1, 0, 1));
        TextView label = text("#" + (idx + 1) + (ready ? " rotate" : " add"), 10, ready ? Design.INK() : Design.DIM(), Design.monoBold());
        label.setGravity(Gravity.CENTER);
        cell.addView(label, new LinearLayout.LayoutParams(-1, Design.dp(this, 22)));
        return cell;
    }

    private void rotateCreateImage(int idx) {
        if (idx < 0 || idx >= createImages.length || createImages[idx] == null || createImages[idx].isEmpty()) return;
        String rotated = ImageTools.rotateBase64(createImages[idx], 90, 8000);
        if (rotated.isEmpty()) { toast("Could not rotate image"); return; }
        createImages[idx] = rotated;
        jumpCreateImages = true;
        renderCreate();
    }

    private LinearLayout recoveryImageGrid(StateNft.Meta m) {
        LinearLayout grid = vertical();
        int cols = 4;
        for (int i = 1; i <= Math.max(0, m.size); i += cols) {
            LinearLayout row = horizontal(8, Gravity.CENTER);
            for (int c = 0; c < cols; c++) {
                int idx = i + c;
                if (idx > m.size) {
                    row.addView(new Space(this), new LinearLayout.LayoutParams(0, Design.dp(this, 86), 1));
                } else {
                    row.addView(recoverySlotCell(m, idx), new LinearLayout.LayoutParams(0, Design.dp(this, 86), 1));
                }
            }
            grid.addView(row, lp(-1, Design.dp(this, 86), 0, 0, 0, 8));
        }
        return grid;
    }

    private View recoverySlotCell(StateNft.Meta m, int idx) {
        String image = localImage(m.localId, idx);
        boolean ready = image != null && !image.isEmpty();
        LinearLayout cell = vertical();
        cell.setPadding(Design.dp(this, 4), Design.dp(this, 4), Design.dp(this, 4), Design.dp(this, 4));
        cell.setBackground(Design.stroke(ready ? Design.PAPER() : 0xFFF1F1EF, ready ? Design.INK() : Design.RED()));
        cell.setClickable(true);
        cell.setOnClickListener(v -> {
            if (ready) rotateRecoveryImage(m.localId, idx);
            else pickRecoveryImage(m, idx);
        });
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(Identicon.forToken("recover" + idx, 160));
        if (ready) ImageLoader.loadOver(this, "data:image/jpeg;base64," + image, img);
        cell.addView(img, new LinearLayout.LayoutParams(-1, 0, 1));
        TextView label = text("#" + idx + (ready ? " rotate" : " missing"), 10,
                ready ? Design.INK() : Design.RED(), Design.monoBold());
        label.setGravity(Gravity.CENTER);
        cell.addView(label, new LinearLayout.LayoutParams(-1, Design.dp(this, 22)));
        return cell;
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

    private void pickImages() {
        pendingPickContext = PICK_CREATE;
        pendingImageIndex = -1;
        pendingBatchImages = true;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("image/*");
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(Intent.createChooser(i, "Choose StateNFT images"), 7001);
    }

    private void pickImage(int idx) {
        pendingPickContext = PICK_CREATE;
        pendingImageIndex = idx;
        pendingBatchImages = false;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("image/*");
        startActivityForResult(Intent.createChooser(i, "Choose StateNFT image"), 7001);
    }

    private void pickRecoveryImages(StateNft.Meta m) {
        pendingPickContext = PICK_RECOVERY;
        pendingRecoveryId = m.localId;
        pendingImageIndex = firstMissingLocalImageIndex(m) - 1;
        pendingBatchImages = true;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("image/*");
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(Intent.createChooser(i, "Choose missing StateNFT images"), 7001);
    }

    private void pickRecoveryImage(StateNft.Meta m, int idx) {
        pendingPickContext = PICK_RECOVERY;
        pendingRecoveryId = m.localId;
        pendingImageIndex = idx - 1;
        pendingBatchImages = false;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("image/*");
        startActivityForResult(Intent.createChooser(i, "Choose StateNFT image"), 7001);
    }

    private int firstMissingLocalImageIndex(StateNft.Meta m) {
        if (m == null) return 1;
        for (int i = 1; i <= m.size; i++) if (localImage(m.localId, i).isEmpty()) return i;
        return 1;
    }

    private int parseInt(String s, int fallback) {
        try { return Integer.parseInt(s); } catch (Exception e) { return fallback; }
    }

    private void put(JSONObject o, String k, Object v) {
        try { o.put(k, v); } catch (Exception ignored) {}
    }
}
