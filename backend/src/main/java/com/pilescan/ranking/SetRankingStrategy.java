package com.pilescan.ranking;

import com.pilescan.detection.PileEntry;
import java.util.List;

/**
 * Ranks official sets by how likely they are the source of a pile of pieces.
 *
 * <p>Implementations are Spring beans and are selected by {@link #name()} through the
 * {@code strategy} query parameter of {@code GET /api/scans/{id}/set-candidates}.
 */
public interface SetRankingStrategy {

    /** Identifier used in the API, e.g. {@code coverage}. */
    String name();

    /** False for placeholders: the API answers 501 without touching the catalog. */
    default boolean isImplemented() {
        return true;
    }

    /**
     * @param pile         identified pieces, one entry per distinct part+color; never empty
     * @param limit        number of candidates to return
     * @param missingLimit maximum missing-part lines per candidate
     * @return at most {@code limit} candidates, best first, with ranks starting at 1
     */
    List<SetCandidate> rank(List<PileEntry> pile, int limit, int missingLimit);
}
