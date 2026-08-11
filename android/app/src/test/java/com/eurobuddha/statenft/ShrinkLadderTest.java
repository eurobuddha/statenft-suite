package com.eurobuddha.statenft;

import android.graphics.Bitmap;
import android.util.Base64;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.ByteArrayOutputStream;
import java.util.Random;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** RASTER ALWAYS FITS — the invariant four releases were spent restoring
 *  (2026-08-10/11: plate ladder, MDS ladder, icon intake, icon slim). Runs
 *  the REAL codecs via Robolectric native graphics, on pure noise — the
 *  least compressible image there is — against every budget the app uses.
 *  If a ladder ever loses its floor again, this fails before a mint burns. */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 33)
public class ShrinkLadderTest {

    private static Bitmap noise(int side) {
        int[] px = new int[side * side];
        Random r = new Random(7);
        for (int i = 0; i < px.length; i++) px[i] = 0xFF000000 | r.nextInt(0xFFFFFF);
        Bitmap b = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888);
        b.setPixels(px, 0, side, 0, 0, side, side);
        return b;
    }

    @Test public void rasterAlwaysFitsEveryBudgetTheAppUses() {
        Bitmap busy = noise(1080);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        assertTrue(busy.compress(Bitmap.CompressFormat.PNG, 100, bos));
        String b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
        // 1200 is the GUARANTEED floor — every fixed minimum in the app
        // (token icon 1200, singles 1500, icon-gate 1200) sits on or above it
        int[] budgets = { ImageTools.STATE_IMG_BUDGET, ImageTools.ARTIMAGE_BUDGET,
                          ImageTools.ICON_BUDGET, 2000, 1500, 1200 };
        for (int budget : budgets) {
            String out = ImageTools.recompressBase64(b64, budget);
            assertFalse("recompressBase64 refused budget " + budget, out.isEmpty());
            assertTrue("plate over budget " + budget + ": " + out.length(),
                    out.length() <= budget);
            String icon = ImageTools.iconFromBitmap(busy, budget);
            assertFalse("iconFromBitmap refused budget " + budget, icon.isEmpty());
            assertTrue("icon over budget " + budget + ": " + icon.length(),
                    icon.length() <= budget);
        }
    }
}
