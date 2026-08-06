package com.eurobuddha.statenft;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Random;

import static org.junit.Assert.*;

public class GenerativeTest {

    private JSONObject model(int... variantCounts) throws Exception {
        JSONObject m = new JSONObject();
        JSONArray layers = new JSONArray();
        for (int i = 0; i < variantCounts.length; i++) {
            JSONObject l = new JSONObject().put("name", "Layer" + i);
            JSONArray vs = new JSONArray();
            for (int v = 0; v < variantCounts[i]; v++) {
                vs.put(new JSONObject().put("name", "V" + v).put("file", "f").put("weight", v == 0 ? 60 : 10));
            }
            l.put("variants", vs);
            layers.put(l);
        }
        m.put("layers", layers);
        return m;
    }

    @Test public void combosMultiply() throws Exception {
        assertEquals(24, GenerativeComposer.possibleCombos(model(2, 3, 4)));
        assertEquals(0, GenerativeComposer.possibleCombos(model(2, 0, 4)));
        assertEquals(0, GenerativeComposer.possibleCombos(new JSONObject()));
    }

    @Test public void samplingIsCollisionFree() throws Exception {
        JSONObject m = model(3, 3, 2);
        List<int[]> out = GenerativeComposer.sample(m, 12, null, new Random(7));
        assertNotNull(out);
        assertEquals(12, out.size());
        HashSet<String> seen = new HashSet<>();
        for (int[] combo : out) {
            StringBuilder sb = new StringBuilder();
            for (int v : combo) sb.append(v).append('.');
            assertTrue("duplicate combo", seen.add(sb.toString()));
        }
    }

    @Test public void samplingRefusesImpossibleCounts() throws Exception {
        assertNull(GenerativeComposer.sample(model(2, 2), 5, null, new Random(1)));
    }

    @Test public void lockedCombosSurviveReroll() throws Exception {
        JSONObject m = model(4, 4);
        List<int[]> keep = List.of(new int[]{2, 3});
        List<int[]> out = GenerativeComposer.sample(m, 6, keep, new Random(3));
        assertNotNull(out);
        assertArrayEquals(new int[]{2, 3}, out.get(0));
    }

    @Test public void traitsMirrorTheCombo() throws Exception {
        JSONObject m = model(2, 2);
        JSONArray attrs = GenerativeComposer.traitsFor(m, new int[]{1, 0});
        assertEquals(2, attrs.length());
        assertEquals("Layer0", attrs.getJSONObject(0).getString("trait_type"));
        assertEquals("V1", attrs.getJSONObject(0).getString("value"));
        assertEquals("V0", attrs.getJSONObject(1).getString("value"));
    }

    @Test public void weightCycleWalksTheLadder() {
        assertEquals(30, GenerativeComposer.nextWeight(60));
        assertEquals(10, GenerativeComposer.nextWeight(30));
        assertEquals(3, GenerativeComposer.nextWeight(10));
        assertEquals(60, GenerativeComposer.nextWeight(3));
        assertEquals("Rare", GenerativeComposer.weightName(10));
    }
}
