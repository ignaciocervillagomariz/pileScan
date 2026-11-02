package com.pilescan.ranking;

/** A set sharing at least one part+color with the pile, as selected by the SQL prefilter. */
record CandidateSet(String setNum, int year, int totalPieces, int matchedPieces) {
}
