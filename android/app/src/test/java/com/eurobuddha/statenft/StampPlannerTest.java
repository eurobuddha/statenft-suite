package com.eurobuddha.statenft;

import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

import static org.junit.Assert.*;

public class StampPlannerTest {

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
