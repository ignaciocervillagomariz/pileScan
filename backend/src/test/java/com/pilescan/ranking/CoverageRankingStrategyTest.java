package com.pilescan.ranking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pilescan.catalog.CatalogRepository;
import com.pilescan.catalog.ColorRef;
import com.pilescan.catalog.PartRef;
import com.pilescan.detection.PileEntry;
import com.pilescan.ranking.CandidateSetRepository.InventoryLine;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CoverageRankingStrategyTest {

    private final CandidateSetRepository sets = mock(CandidateSetRepository.class);
    private final CatalogRepository catalog = mock(CatalogRepository.class);
    private final CoverageRankingStrategy strategy = new CoverageRankingStrategy(sets, catalog);

    @Test
    void scoreIsF1OfCoverageAndCompleteness() {
        // 8 of the pile's 10 pieces are in a 40-piece set.
        CoverageRankingStrategy.ScoredSet scored = CoverageRankingStrategy.score(
                new CandidateSet("1-1", 2000, 40, 8), 10);

        assertThat(scored.coverage()).isCloseTo(0.8, within(1e-9));
        assertThat(scored.completeness()).isCloseTo(0.2, within(1e-9));
        assertThat(scored.score()).isCloseTo(0.32, within(1e-9));
        // F1 = 2*matched / (pile + set)
        assertThat(scored.score()).isCloseTo(2.0 * 8 / (10 + 40), within(1e-9));
    }

    @Test
    void perfectMatchScoresOneAndNoOverlapScoresZero() {
        assertThat(CoverageRankingStrategy.score(new CandidateSet("a", 2000, 10, 10), 10).score()).isEqualTo(1.0);
        assertThat(CoverageRankingStrategy.score(new CandidateSet("b", 2000, 10, 0), 10).score()).isZero();
        assertThat(CoverageRankingStrategy.score(new CandidateSet("c", 2000, 0, 0), 0).score()).isZero();
    }

    @Test
    void ranksByScoreThenCompletenessThenYearAndComputesMissingParts() {
        List<PileEntry> pile = List.of(new PileEntry("3001", 4, 3), new PileEntry("3002", 4, 2));
        when(sets.shortlist(anyList(), anyInt(), anyInt())).thenReturn(List.of(
                new CandidateSet("big-1", 2020, 100, 5),
                new CandidateSet("exact-1", 1999, 5, 5),
                new CandidateSet("old-1", 1990, 10, 5),
                new CandidateSet("new-1", 2010, 10, 5)));
        when(sets.summaries(anyCollection())).thenReturn(Map.of(
                "exact-1", new SetSummary("exact-1", "Exact", 1999, "Town", 5, null),
                "new-1", new SetSummary("new-1", "New", 2010, null, 10, null),
                "old-1", new SetSummary("old-1", "Old", 1990, null, 10, null),
                "big-1", new SetSummary("big-1", "Big", 2020, null, 100, null)));
        when(sets.inventory(org.mockito.ArgumentMatchers.anyString())).thenReturn(List.of());
        when(sets.inventory("exact-1")).thenReturn(List.of(
                new InventoryLine("3001", 4, 3, null), new InventoryLine("3002", 4, 2, null)));
        when(catalog.partRefs(anyCollection())).thenReturn(Map.of());
        when(catalog.colorRefs(anyCollection())).thenReturn(Map.of());

        List<SetCandidate> ranked = strategy.rank(pile, 4, 50);

        // new-1 before old-1: equal score and completeness, newer year wins
        assertThat(ranked).extracting(c -> c.set().setNum()).containsExactly("exact-1", "new-1", "old-1", "big-1");
        SetCandidate best = ranked.getFirst();
        assertThat(best.rank()).isEqualTo(1);
        assertThat(best.matchPercent()).isCloseTo(100.0, within(1e-9));
        assertThat(best.missingPieces()).isZero();
        assertThat(best.missingParts()).isEmpty();
        assertThat(ranked.stream().map(SetCandidate::rank)).containsExactly(1, 2, 3, 4);
    }

    @Test
    void missingPartsAreLargestShortfallFirstCappedAndColorSpecificImage() {
        List<PileEntry> pile = List.of(new PileEntry("3001", 4, 1), new PileEntry("3002", 4, 2));
        when(sets.shortlist(anyList(), anyInt(), anyInt())).thenReturn(List.of(new CandidateSet("s-1", 2000, 17, 3)));
        when(sets.summaries(anyCollection())).thenReturn(Map.of(
                "s-1", new SetSummary("s-1", "S", 2000, null, 17, null)));
        when(sets.inventory("s-1")).thenReturn(List.of(
                new InventoryLine("3001", 4, 4, "https://img/3001-4.jpg"),   // short by 3
                new InventoryLine("3002", 4, 2, null),                       // fully covered
                new InventoryLine("3005", 0, 10, null)));                    // short by 10
        when(catalog.partRefs(anyCollection())).thenReturn(Map.of(
                "3001", new PartRef("3001", "Brick 2 x 4", "https://img/3001.jpg"),
                "3005", new PartRef("3005", "Brick 1 x 1", null)));
        when(catalog.colorRefs(anyCollection())).thenReturn(Map.of(
                4, new ColorRef(4, "Red", "#C91A09"), 0, new ColorRef(0, "Black", "#05131D")));

        SetCandidate candidate = strategy.rank(pile, 5, 50).getFirst();

        assertThat(candidate.missingPieces()).isEqualTo(14);
        assertThat(candidate.missingParts()).extracting(m -> m.part().partNum()).containsExactly("3005", "3001");
        assertThat(candidate.missingParts().get(1).quantityNeeded()).isEqualTo(4);
        assertThat(candidate.missingParts().get(1).quantityHave()).isEqualTo(1);
        assertThat(candidate.missingParts().get(1).part().imageUrl()).isEqualTo("https://img/3001-4.jpg");

        assertThat(strategy.rank(pile, 5, 1).getFirst().missingParts()).hasSize(1);
        assertThat(strategy.rank(pile, 5, 0).getFirst().missingParts()).isEmpty();
    }
}
