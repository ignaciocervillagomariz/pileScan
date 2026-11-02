package com.pilescan.ranking;

import com.pilescan.catalog.CatalogRepository;
import com.pilescan.catalog.ColorRef;
import com.pilescan.catalog.PartRef;
import com.pilescan.detection.PileEntry;
import com.pilescan.ranking.CandidateSetRepository.InventoryLine;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Baseline ranking by unweighted overlap of part+color quantities.
 *
 * <p>With pile {@code P} and set inventory {@code S} (quantities per part+color):
 * <pre>
 *   matched         = sum_k min(P[k], S[k])
 *   pileCoverage    = matched / |P|      "how much of my pile belongs to this set"
 *   setCompleteness = matched / |S|      "how much of this set my pile contains"
 *   score           = F1 = 2 * coverage * completeness / (coverage + completeness) = 2 * matched / (|P| + |S|)
 *   matchPercent    = 100 * score
 * </pre>
 * Coverage alone favours huge sets that contain everything, completeness alone favours tiny sets.
 * Their harmonic mean needs both to be high. Ties are broken by completeness, then newer year.
 *
 * <p>Missing parts of a set are the part+color lines where {@code S[k] > P[k]}, largest shortfall first.
 */
@Component
class CoverageRankingStrategy implements SetRankingStrategy {

    static final int SHORTLIST_SIZE = 200;

    private final CandidateSetRepository sets;
    private final CatalogRepository catalog;

    CoverageRankingStrategy(CandidateSetRepository sets, CatalogRepository catalog) {
        this.sets = sets;
        this.catalog = catalog;
    }

    @Override
    public String name() {
        return "coverage";
    }

    @Override
    public List<SetCandidate> rank(List<PileEntry> pile, int limit, int missingLimit) {
        int pilePieces = pile.stream().mapToInt(PileEntry::quantity).sum();
        List<ScoredSet> top = sets.shortlist(pile, pilePieces, SHORTLIST_SIZE).stream()
                .map(set -> score(set, pilePieces))
                .sorted(BEST_FIRST)
                .limit(limit)
                .toList();

        Map<String, SetSummary> summaries = sets.summaries(top.stream().map(s -> s.set().setNum()).toList());
        Map<String, Integer> have = new HashMap<>();
        pile.forEach(e -> have.put(key(e.partNum(), e.colorId()), e.quantity()));

        List<SetCandidate> result = new ArrayList<>();
        for (int i = 0; i < top.size(); i++) {
            ScoredSet scored = top.get(i);
            CandidateSet set = scored.set();
            result.add(new SetCandidate(i + 1, summaries.get(set.setNum()), scored.score() * 100,
                    scored.coverage(), scored.completeness(), set.matchedPieces(),
                    set.totalPieces() - set.matchedPieces(), missingParts(set.setNum(), have, missingLimit)));
        }
        return result;
    }

    record ScoredSet(CandidateSet set, double coverage, double completeness, double score) { }

    private static final Comparator<ScoredSet> BEST_FIRST = Comparator
            .comparingDouble(ScoredSet::score).reversed()
            .thenComparing(Comparator.comparingDouble(ScoredSet::completeness).reversed())
            .thenComparing(Comparator.comparingInt((ScoredSet s) -> s.set().year()).reversed())
            .thenComparing(s -> s.set().setNum());

    static ScoredSet score(CandidateSet set, int pilePieces) {
        double coverage = pilePieces == 0 ? 0 : (double) set.matchedPieces() / pilePieces;
        double completeness = set.totalPieces() == 0 ? 0 : (double) set.matchedPieces() / set.totalPieces();
        double sum = coverage + completeness;
        double f1 = sum == 0 ? 0 : 2 * coverage * completeness / sum;
        return new ScoredSet(set, coverage, completeness, f1);
    }

    private List<MissingPart> missingParts(String setNum, Map<String, Integer> have, int missingLimit) {
        if (missingLimit == 0) {
            return List.of();
        }
        List<InventoryLine> shortfalls = sets.inventory(setNum).stream()
                .filter(line -> line.quantity() > have.getOrDefault(key(line.partNum(), line.colorId()), 0))
                .sorted(Comparator.comparingInt((InventoryLine l) ->
                                have.getOrDefault(key(l.partNum(), l.colorId()), 0) - l.quantity())
                        .thenComparing(InventoryLine::partNum).thenComparingInt(InventoryLine::colorId))
                .limit(missingLimit)
                .toList();

        Set<String> partNums = new HashSet<>();
        Set<Integer> colorIds = new HashSet<>();
        shortfalls.forEach(l -> {
            partNums.add(l.partNum());
            colorIds.add(l.colorId());
        });
        Map<String, PartRef> parts = catalog.partRefs(partNums);
        Map<Integer, ColorRef> colors = catalog.colorRefs(colorIds);
        return shortfalls.stream()
                .filter(l -> parts.containsKey(l.partNum()) && colors.containsKey(l.colorId()))
                .map(l -> {
                    PartRef part = parts.get(l.partNum());
                    // Prefer the image of this exact color over the generic part image.
                    PartRef withImage = new PartRef(part.partNum(), part.name(),
                            l.imageUrl() != null ? l.imageUrl() : part.imageUrl());
                    return new MissingPart(withImage, colors.get(l.colorId()), l.quantity(),
                            have.getOrDefault(key(l.partNum(), l.colorId()), 0));
                })
                .toList();
    }

    private static String key(String partNum, int colorId) {
        return partNum + "/" + colorId;
    }
}
