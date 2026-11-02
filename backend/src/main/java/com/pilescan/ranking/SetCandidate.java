package com.pilescan.ranking;

import java.util.List;

/**
 * One ranked set.
 *
 * @param matchPercent    strategy score times 100
 * @param pileCoverage    matched pieces / pile pieces
 * @param setCompleteness matched pieces / set pieces
 * @param missingPieces   quantity the pile lacks to complete the set
 */
public record SetCandidate(int rank, SetSummary set, double matchPercent, double pileCoverage,
                           double setCompleteness, int matchedPieces, int missingPieces,
                           List<MissingPart> missingParts) {
}
