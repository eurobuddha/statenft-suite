package com.eurobuddha.statenft;

import org.json.JSONObject;
import org.junit.Test;

import java.util.LinkedHashMap;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** Pure-static pieces of ArweaveUploader (transport uses static Hosting.open,
 *  so HTTP itself is exercised on-device, not here). */
public class ArweaveUploaderTest {

    @Test public void manifestJsonShape() throws Exception {
        LinkedHashMap<String, String> m = new LinkedHashMap<>();
        m.put("1.jpg", "tx_one_11111111111111111111111111111111111");
        m.put("2.jpg", "tx_two_22222222222222222222222222222222222");
        JSONObject j = new JSONObject(ArweaveUploader.manifestJson(m, "1.jpg"));
        assertEquals("arweave/paths", j.getString("manifest"));
        assertEquals("0.1.0", j.getString("version"));
        assertEquals("1.jpg", j.getJSONObject("index").getString("path"));
        assertEquals("tx_one_11111111111111111111111111111111111",
                j.getJSONObject("paths").getJSONObject("1.jpg").getString("id"));
        assertEquals("tx_two_22222222222222222222222222222222222",
                j.getJSONObject("paths").getJSONObject("2.jpg").getString("id"));
        assertEquals(2, j.getJSONObject("paths").length());
    }

    @Test public void parseUploadIdVariants() {
        assertEquals("abc123", ArweaveUploader.parseUploadId("{\"id\":\"abc123\",\"winc\":\"0\"}"));
        assertEquals("", ArweaveUploader.parseUploadId("{\"winc\":\"0\"}"));
        assertEquals("", ArweaveUploader.parseUploadId("not json at all"));
        assertEquals("", ArweaveUploader.parseUploadId(""));
    }

    @Test public void insufficientFundsMessageIsComplete() {
        String addr = "4qkY4e-VHmHrWhLJ7X1WkoIPzGLEOfnlGQ_8Jvhv8YI";
        String msg = ArweaveUploader.insufficientFundsMessage(addr, 20971520, "$0.61 (222963394521 credits)");
        assertTrue(msg.contains(addr));                    // FULL address, never truncated
        assertTrue(msg.contains("20971520"));
        assertTrue(msg.contains("https://turbo.ar.io"));
        assertTrue(msg.contains("$0.61"));
        String noEstimate = ArweaveUploader.insufficientFundsMessage(addr, 5, "");
        assertTrue(noEstimate.contains(addr));
        assertTrue(noEstimate.contains("https://turbo.ar.io"));
    }
}
