package com.eurobuddha.statenft;

import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

import static org.junit.Assert.*;

public class StampPlannerTest {

    /* JOINT transfer budget: the record and the largest image ride TWICE per
     * transfer (+sig) under 64KB — defActual + maxImg <= 23000 (proven point:
     * 7K def + 16000 image, spike 2026-08-05). "Random" (def 14587 + images up
     * to 14850) must REFUSE; the proven spike shape must PASS. */
    @Test public void jointBudgetRefusesRandomShapePassesSpikeShape() {
        assertNotNull(MintEngine.jointBudgetError(14587, 14850));   // Random: 65-71KB txns, sealed forever
        assertNull(MintEngine.jointBudgetError(7000, 16000));       // the proven on-chain spike, exactly 23000
        assertNotNull(MintEngine.jointBudgetError(7001, 16000));    // one byte past the proven point
        assertNotNull(MintEngine.jointBudgetError(18000, 0));       // split bound alone (Math's record)
        assertNull(MintEngine.jointBudgetError(9000, 8192));        // classic generative shape
    }

    @Test public void defActualLenIsExactMetadataPlusWrapper() {
        StateNft.Meta m = new StateNft.Meta();
        m.name = "T"; m.description = ""; m.mode = "embed"; m.size = 2; m.icon = "";
        assertEquals(StateNft.tokenMetadata(m).toString().length() + MintEngine.DEF_WRAPPER,
                MintEngine.defActualLen(m, null));
    }

    @Test public void splitBatchSizesToTokenDefinition() {
        assertEquals(3, MintEngine.splitBatch(7000));    // legacy: proven batch
        assertEquals(1, MintEngine.splitBatch(11079));   // generative: unit + change
        assertEquals(3, MintEngine.splitBatch(500));     // tiny: capped
        assertEquals(2, MintEngine.splitBatch(10000));
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
}
