package com.eurobuddha.statenft;

import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

import static org.junit.Assert.*;

public class StampPlannerTest {

    /* ALWAYS SIGNED, ALWAYS FITS: the gate signs or refuses — never unsigned.
     * The envelope (record incl. the 8.4KB signature) decides the image room. */
    @Test public void gateSignsOrRefusesNeverUnsigned() {
        assertEquals("sign", MintEngine.jointGate(3000, 7500));        // light record, image fits
        assertNotEquals("sign", MintEngine.jointGate(3000, 7600));     // image over the room
        assertNotEquals("sign", MintEngine.jointGate(9000, 0));        // record past META_MAX
        assertNotEquals("sign", MintEngine.jointGate(14587 - 8933, 14850)); // Random's shape refuses
    }

    @Test public void envelopeMath() {
        assertEquals(8367, MintEngine.META_MAX);
        assertEquals(19500 - 533 - 8400 - 3000, MintEngine.imageBudget(3000));
        assertEquals(-1, MintEngine.imageBudget(9000));
    }

    @Test public void defActualLenCountsTheSignature() {
        StateNft.Meta m = new StateNft.Meta();
        m.name = "T"; m.description = ""; m.mode = "embed"; m.size = 2; m.icon = "";
        assertEquals(StateNft.tokenMetadata(m).toString().length()
                + MintEngine.DEF_WRAPPER + MintEngine.DEF_SIGN_WEIGHT,
                MintEngine.defActualLen(m, null));
    }

    @Test public void splitBatchSizesToTokenDefinition() {
        // conservative (28000): every coin embeds the full def + a ~9KB spend
        // signature, so a ~9KB signed def must split ONE at a time to stay
        // mineable (Gallery Bibeau silently-rejected at batch 2, 2026-08-12).
        assertEquals(2, MintEngine.splitBatch(7000));    // legacy
        assertEquals(1, MintEngine.splitBatch(9208));    // signed ~9.2KB def (Bibeau)
        assertEquals(1, MintEngine.splitBatch(11079));   // generative: unit + change
        assertEquals(3, MintEngine.splitBatch(500));     // tiny: capped
        assertEquals(1, MintEngine.splitBatch(10000));
        assertEquals(1, MintEngine.splitBatch(90000));   // degenerate: floor 1
    }

    @Test public void assignsLowestFreeIndicesInOrder() {
        HashSet<String> used = new HashSet<>(Arrays.asList("1", "3"));
        List<String[]> plan = MintEngine.planAssignments(Arrays.asList("cA", "cB", "cC"), used, 5);
        assertEquals(3, plan.size());
        assertArrayEquals(new String[]{"cA", "2"}, plan.get(0));
        assertArrayEquals(new String[]{"cB", "4"}, plan.get(1));
        assertArrayEquals(new String[]{"cC", "5"}, plan.get(2));
    }

    @Test public void neverIssuesDuplicateIndices() {
        List<String[]> plan = MintEngine.planAssignments(
                Arrays.asList("c1", "c2", "c3", "c4"), new HashSet<>(), 10);
        HashSet<String> seen = new HashSet<>();
        for (String[] p : plan) assertTrue("duplicate idx " + p[1], seen.add(p[1]));
    }

    @Test public void stopsWhenCollectionIsFull() {
        HashSet<String> used = new HashSet<>(Arrays.asList("1", "2"));
        List<String[]> plan = MintEngine.planAssignments(Arrays.asList("cA", "cB", "cC"), used, 3);
        assertEquals(1, plan.size());
        assertEquals("3", plan.get(0)[1]);
    }

    @Test public void emptyInputsPlanNothing() {
        assertTrue(MintEngine.planAssignments(Arrays.asList(), new HashSet<>(), 5).isEmpty());
        HashSet<String> full = new HashSet<>(Arrays.asList("1", "2"));
        assertTrue(MintEngine.planAssignments(Arrays.asList("c"), full, 2).isEmpty());
    }

    /* DONE takes chain-confirmed seals ONLY. Counting reservations marked
     * Maths DONE at 14/20 real seals (2026-08-10) while six blanks waited. */
    @Test public void doneRequiresChainConfirmedSeals() {
        // classifyStamp(distinctOnChain, size, blanks, bigs, coins)
        assertEquals("DONE",    MintEngine.classifyStamp(20, 20, 0, 0, 20));
        assertEquals("STAMP",   MintEngine.classifyStamp(14, 20, 6, 0, 20)); // Maths: NOT done
        assertEquals("STAMP",   MintEngine.classifyStamp(0, 20, 20, 0, 20));
        assertEquals("SPLIT",   MintEngine.classifyStamp(10, 20, 0, 1, 11));
        assertEquals("MOVE",    MintEngine.classifyStamp(0, 20, 0, 0, 0));
    }

    /* All coins sealed but distinct short = permanent duplicate seals under
     * the locked contract (math 9/20, abstract thought forms 8/20). Terminal:
     * the engine must stop churning instead of flip-flopping STAMP<->RECOVER. */
    @Test public void duplicateSealsClassifyAsDamagedNotStamp() {
        assertEquals("DAMAGED", MintEngine.classifyStamp(9, 20, 0, 0, 20));
        assertEquals("DAMAGED", MintEngine.classifyStamp(8, 20, 0, 0, 20));
        // a partial coin window (fewer coins than size) must NOT read as damage
        assertEquals("STAMP",   MintEngine.classifyStamp(9, 20, 0, 0, 12));
        // blanks or unsplit coins present -> still workable, never damaged
        assertEquals("STAMP",   MintEngine.classifyStamp(9, 20, 1, 0, 20));
        assertEquals("SPLIT",   MintEngine.classifyStamp(9, 20, 0, 2, 20));
    }
}
