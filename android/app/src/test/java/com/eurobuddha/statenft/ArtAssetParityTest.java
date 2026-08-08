package com.eurobuddha.statenft;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import org.junit.Test;

import java.io.File;
import java.nio.file.Files;

/**
 * The generative engine ships TWICE — minidapp/art.js (the canonical copy the
 * MiniDapp runs and the node test suite sweeps) and assets/artstudio/art.js
 * (what the hidden WebView runs on-device). Determinism across both clients
 * only holds while they are byte-identical, so a divergence is a build error,
 * never a "small fix": update by re-copying from minidapp/, never by editing
 * the asset.
 */
public class ArtAssetParityTest {

    @Test
    public void assetIsByteIdenticalToMinidappArtJs() throws Exception {
        File asset = new File("src/main/assets/artstudio/art.js");
        assertTrue("asset art.js missing — the WebView bridge has no engine", asset.isFile());
        // gradle runs unit tests from android/app; the repo's minidapp/ sits two levels up
        File canonical = new File("../../minidapp/art.js");
        assumeTrue("minidapp/art.js not found from " + new File(".").getAbsolutePath()
                + " — parity is checked in full-repo builds", canonical.isFile());
        assertArrayEquals("assets/artstudio/art.js diverged from minidapp/art.js — re-copy, never edit",
                Files.readAllBytes(canonical.toPath()), Files.readAllBytes(asset.toPath()));
    }
}
