package com.eurobuddha.statenft;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.Assert.*;

public class ImageFormatTest {

    private static String b64(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    @Test public void sniffsWebp() {
        byte[] webp = "RIFF????WEBPVP8 ................".getBytes(StandardCharsets.US_ASCII);
        assertEquals("image/webp", ImageTools.mimeOf(b64(webp)));
        assertTrue(ImageTools.dataUri(b64(webp)).startsWith("data:image/webp;base64,"));
    }

    @Test public void sniffsJpegPngSvg() {
        byte[] jpeg = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0, 0, 0, 0, 0, 0, 0};
        assertEquals("image/jpeg", ImageTools.mimeOf(b64(jpeg)));
        byte[] png = new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
        assertEquals("image/png", ImageTools.mimeOf(b64(png)));
        String svg = "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
        assertEquals("image/svg+xml", ImageTools.mimeOf(b64(svg.getBytes(StandardCharsets.UTF_8))));
    }

    @Test public void unknownBytesDefaultToJpeg() {
        assertEquals("image/jpeg", ImageTools.mimeOf(b64("ABCDEF".getBytes(StandardCharsets.US_ASCII))));
        assertEquals("", ImageTools.dataUri(""));
        assertEquals("", ImageTools.dataUri(null));
    }

    @Test public void sanitizerStripsActiveContent() {
        String hostile = "<svg xmlns='http://www.w3.org/2000/svg' onload=\"alert(1)\">"
                + "<script>steal()</script>"
                + "<foreignObject><body>html</body></foreignObject>"
                + "<a href=\"javascript:evil()\"><text>x</text></a>"
                + "<image href=\"https://evil.example/track.png\"/>"
                + "<use href=\"#localDef\"/>"
                + "<rect width='10' height='10' fill='url(#grad)'/></svg>";
        String clean = SvgSanitizer.sanitize(hostile);
        assertNotNull(clean);
        assertFalse(clean.toLowerCase().contains("<script"));
        assertFalse(clean.toLowerCase().contains("onload"));
        assertFalse(clean.toLowerCase().contains("foreignobject"));
        assertFalse(clean.toLowerCase().contains("javascript:"));
        assertFalse(clean.contains("evil.example"));
        assertTrue("local refs survive", clean.contains("#localDef"));
        assertTrue(clean.contains("url(#grad)"));
    }

    @Test public void sanitizerStripsDoctypeEntities() {
        String bomb = "<?xml version=\"1.0\"?><!DOCTYPE svg [<!ENTITY x \"y\">]>"
                + "<svg xmlns='http://www.w3.org/2000/svg'><text>&x;</text></svg>";
        String clean = SvgSanitizer.sanitize(bomb);
        assertNotNull(clean);
        assertFalse(clean.contains("DOCTYPE"));
        assertFalse(clean.contains("ENTITY"));
    }

    @Test public void sanitizerRejectsNonSvg() {
        assertNull(SvgSanitizer.sanitize("just text"));
        assertNull(SvgSanitizer.sanitize(null));
        assertFalse(SvgSanitizer.isSvg("<html><svg/></html>"));
        assertTrue(SvgSanitizer.isSvg("  <svg viewBox='0 0 1 1'/>"));
    }
}
