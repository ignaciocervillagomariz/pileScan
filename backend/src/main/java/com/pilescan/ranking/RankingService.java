package com.pilescan.ranking;

import com.pilescan.common.ApiException;
import com.pilescan.detection.DetectionRepository;
import com.pilescan.detection.PileEntry;
import com.pilescan.importer.ImportStatusRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class RankingService {

    private final DetectionRepository detections;
    private final ImportStatusRepository importStatus;
    private final Map<String, SetRankingStrategy> strategies;

    RankingService(DetectionRepository detections, ImportStatusRepository importStatus,
                   List<SetRankingStrategy> strategies) {
        this.detections = detections;
        this.importStatus = importStatus;
        this.strategies = strategies.stream().collect(Collectors.toMap(SetRankingStrategy::name, Function.identity()));
    }

    public SetCandidatesResponse candidates(UUID scanId, String strategyName, int limit, int missingLimit) {
        SetRankingStrategy strategy = strategies.get(strategyName);
        if (strategy == null) {
            throw ApiException.badRequest("Unknown strategy '" + strategyName + "'. Available: "
                    + String.join(", ", strategies.keySet().stream().sorted().toList()));
        }
        if (!detections.scanExists(scanId)) {
            throw ApiException.notFound("Scan " + scanId + " not found.");
        }
        if (!strategy.isImplemented()) {
            throw new StrategyNotImplementedException(strategyName);
        }
        if (!importStatus.isCatalogAvailable()) {
            throw ApiException.serviceUnavailable(
                    "The catalog is not available yet (first import still running). See GET /api/admin/catalog-import.");
        }
        List<PileEntry> pile = detections.pile(scanId);
        int pilePieces = pile.stream().mapToInt(PileEntry::quantity).sum();
        List<SetCandidate> candidates = pile.isEmpty() ? List.of() : strategy.rank(pile, limit, missingLimit);
        return new SetCandidatesResponse(scanId, strategyName, pilePieces, candidates);
    }
}
