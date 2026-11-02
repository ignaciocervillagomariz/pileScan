package com.pilescan.ranking;

import java.util.List;
import java.util.UUID;

public record SetCandidatesResponse(UUID scanId, String strategy, int pilePieces, List<SetCandidate> candidates) {
}
