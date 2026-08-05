package com.eurobuddha.statenft;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.*;

public class StateNftTest {
    private static final String PK = "0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";

    @Test public void recognizesLegacyAndLockedScripts() {
        String legacy = "IF SIGNEDBY(" + PK + ") THEN RETURN TRUE ENDIF "
                + "RETURN VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)";
        String locked = "LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY(" + PK + ") THEN RETURN TRUE ENDIF "
                + "RETURN SAMESTATE(0 1) AND VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)";

        assertEquals(PK, StateNft.creatorPk(legacy));
        assertEquals(PK, StateNft.creatorPk(locked));
        assertTrue(StateNft.isStateNftScript(legacy));
        assertTrue(StateNft.isStateNftScript(locked));
        assertFalse(StateNft.isStateNftScript("RETURN TRUE"));
    }

    @Test public void validatesOnlyStateShapesWeWrite() {
        assertTrue(StateNft.safeStateValue("12"));
        assertTrue(StateNft.safeStateValue("[QUJDRA==]"));
        assertFalse(StateNft.safeStateValue("[abc] txnsign id:x publickey:auto"));
        assertFalse(StateNft.safeStateValue("1 2"));
    }

    @Test public void embeddedStateImageWinsOverUrlBase() throws Exception {
        StateNft.Meta meta = new StateNft.Meta();
        meta.mode = "url";
        meta.base = "https://example.com/nft/";
        meta.ext = ".png";
        JSONObject coin = new JSONObject()
                .put("state", new JSONArray()
                        .put(new JSONObject().put("port", 0).put("data", "3"))
                        .put(new JSONObject().put("port", 1).put("data", "[QUJDRA==]")));
        assertEquals("data:image/jpeg;base64,QUJDRA==", StateNft.imageUrl(meta, 3, coin));
    }

    @Test public void transferReplaysEveryStatePort() throws Exception {
        JSONObject coin = new JSONObject()
                .put("coinid", "0xCOIN")
                .put("state", new JSONArray()
                        .put(new JSONObject().put("port", 0).put("data", "7"))
                        .put(new JSONObject().put("port", 1).put("data", "[AA==]")));
        List<String> cmds = StateNft.transferCommands("x", "0xTOKEN", coin,
                "Mx1234567890123456789012345678901234567890");
        assertTrue(cmds.contains("txnstate id:x port:0 value:7"));
        assertTrue(cmds.contains("txnstate id:x port:1 value:[AA==]"));
        assertEquals("txnpost id:x", cmds.get(cmds.size() - 1));
    }

    @Test public void strippedBuryUsesUnspendableGraveyard() throws Exception {
        JSONObject coin = new JSONObject().put("coinid", "0xCOIN").put("tokenamount", "1");
        List<String> cmds = StateNft.buryCommands("b", "0xTOKEN", PK, coin, false);
        assertTrue(cmds.contains("txnoutput id:b amount:1 address:" + StateNft.GRAVEYARD
                + " tokenid:0xTOKEN storestate:false"));
        assertTrue(cmds.contains("txnsign id:b publickey:" + PK));
    }

    @Test public void nativeScriptMatchesLockedEditionShape() {
        assertEquals("LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY(" + PK + ") THEN RETURN TRUE ENDIF "
                        + "RETURN SAMESTATE(0 0) AND VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)",
                StateNft.script(PK, "url"));
        assertEquals("LET s=PREVSTATE(0) IF s EQ 0 AND SIGNEDBY(" + PK + ") THEN RETURN TRUE ENDIF "
                        + "RETURN SAMESTATE(0 1) AND VERIFYOUT(@INPUT GETOUTADDR(@INPUT) @AMOUNT @TOKENID TRUE)",
                StateNft.script(PK, "embed"));
    }

    @Test public void manualOpenMetadataFallsBackToTokenTotal() throws Exception {
        JSONObject token = new JSONObject()
                .put("name", "Legacy StateNFT")
                .put("total", "12")
                .put("url", "https://example.com/icon.png");

        StateNft.Meta meta = StateNft.parseMeta("0x01", token);

        assertEquals("Legacy StateNFT", meta.name);
        assertEquals(12, meta.size);
        assertEquals("https://example.com/icon.png", meta.icon);
    }

    @Test public void manualOpenMetadataUnwrapsTokenEnvelope() throws Exception {
        JSONObject token = new JSONObject()
                .put("token", new JSONObject()
                        .put("name", new JSONObject()
                                .put("name", "Wrapped StateNFT")
                                .put("mode", "embed")
                                .put("size", 17)
                                .put("url", "<artimage>AAAA</artimage>"))
                        .put("totalamount", "17"))
                .put("script", "RETURN TRUE");

        StateNft.Meta meta = StateNft.parseMeta("0x01", token);

        assertEquals("Wrapped StateNFT", meta.name);
        assertEquals("embed", meta.mode);
        assertEquals(17, meta.size);
        assertEquals("<artimage>AAAA</artimage>", meta.icon);
    }

    @Test public void localMintRowRoundTripsMetadata() throws Exception {
        StateNft.Meta m = new StateNft.Meta();
        m.localId = 7;
        m.name = "Architect Lines";
        m.description = "Monochrome studies";
        m.mode = "url";
        m.size = 20;
        m.base = "https://assets.example.com/nft/";
        m.ext = ".png";
        m.creatorPk = PK;
        m.creatorAddr = "0xADDR";
        m.phase = "CREATE";

        JSONObject row = MintEngine.rowFromMeta(m, new JSONArray()
                .put(new JSONObject().put("idx", 1).put("image", "https://assets.example.com/nft/1.png")));
        StateNft.Meta out = MintEngine.metaFromRow(row);
        assertEquals(7, out.localId);
        assertEquals("Architect Lines", out.name);
        assertEquals("CREATE", out.phase);
        assertEquals("https://assets.example.com/nft/", out.base);
        assertEquals(1, MintEngine.localItems(row).length());
    }
}
