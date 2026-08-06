package com.eurobuddha.statenft;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.*;

public class NftBuilderTest {

    @Test public void nftCommandCarriesWalletStandardMetadata() throws Exception {
        List<String[]> traits = new ArrayList<>();
        traits.add(new String[]{"District", "Rive Gauche"});
        traits.add(new String[]{"Time", "Dusk"});
        String cmd = StateNft.nftCreateCommand("Nocturne 04", "study", "<artimage>AAAA</artimage>",
                "EuroBuddha", "https://example.com", "https://example.com/v",
                StateNft.traitsToAttributes(traits), 3, "0xPK");

        assertTrue(cmd.startsWith("tokencreate name:{"));
        assertTrue(cmd.endsWith(" amount:3 decimals:0 webvalidate:https://example.com/v signtoken:0xPK"));
        String json = cmd.substring("tokencreate name:".length(), cmd.indexOf(" amount:"));
        JSONObject meta = new JSONObject(json);
        assertEquals("Nocturne 04", meta.getString("name"));
        assertEquals("true", meta.getString("nft"));
        assertEquals("EuroBuddha", meta.getString("owner"));
        JSONArray attrs = meta.getJSONArray("attributes");
        assertEquals(2, attrs.length());
        assertEquals("District", attrs.getJSONObject(0).getString("trait_type"));
        assertEquals("Dusk", attrs.getJSONObject(1).getString("value"));
    }

    @Test public void nftCommandOmitsEmptyOptionals() throws Exception {
        String cmd = StateNft.nftCreateCommand("Solo", "", "https://x/y.png", "", "", "",
                new JSONArray(), 1, "");
        assertTrue(cmd.endsWith(" amount:1 decimals:0"));
        JSONObject meta = new JSONObject(cmd.substring("tokencreate name:".length(), cmd.indexOf(" amount:")));
        assertFalse(meta.has("owner"));
        assertFalse(meta.has("external_url"));
        assertFalse(meta.has("webvalidate"));
        assertFalse(meta.has("attributes"));
    }

    @Test public void traitsSkipBlankRows() {
        List<String[]> traits = new ArrayList<>();
        traits.add(new String[]{"", "x"});
        traits.add(new String[]{"y", ""});
        traits.add(new String[]{"Mood", "Calm"});
        JSONArray attrs = StateNft.traitsToAttributes(traits);
        assertEquals(1, attrs.length());
    }

    @Test public void tokenCommandGuardsReservedKeys() throws Exception {
        List<String[]> pairs = Arrays.asList(
                new String[]{"website", "https://x"},
                new String[]{"NAME", "evil"},          // reserved (case-insensitive)
                new String[]{"url", "evil"},           // reserved
                new String[]{"", "empty"},             // blank key
                new String[]{"team", "minima"});
        String cmd = StateNft.tokenCreateCommand("EuroB", "coin", "EUROB", "https://i.png", 1000000, 8, pairs);
        assertTrue(cmd.endsWith(" amount:1000000 decimals:8"));
        JSONObject meta = new JSONObject(cmd.substring("tokencreate name:".length(), cmd.indexOf(" amount:")));
        assertEquals("EuroB", meta.getString("name"));
        assertEquals("EUROB", meta.getString("ticker"));
        assertEquals("https://i.png", meta.getString("url"));
        assertEquals("https://x", meta.getString("website"));
        assertEquals("minima", meta.getString("team"));
        assertFalse(meta.has("NAME"));
    }

    @Test public void commandUrlValidatorRejectsInjection() {
        assertTrue(Util.validCmdUrl("https://ok.example/x.png"));
        assertTrue(Util.validCmdUrl(""));
        assertFalse(Util.validCmdUrl("https://x/a b.png"));
        assertFalse(Util.validCmdUrl("https://x/\"quote"));
        assertFalse(Util.validCmdUrl("https://x/;txndelete"));
    }
}
