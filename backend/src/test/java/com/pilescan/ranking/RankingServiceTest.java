package com.pilescan.ranking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pilescan.common.ApiException;
import com.pilescan.detection.DetectionRepository;
import com.pilescan.importer.ImportStatusRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class RankingServiceTest {

    private final DetectionRepository detections = mock(DetectionRepository.class);
    private final ImportStatusRepository importStatus = mock(ImportStatusRepository.class);
    private final CandidateSetRepository sets = mock(CandidateSetRepository.class);
    private final RankingService service = new RankingService(detections, importStatus, List.of(
            new CoverageRankingStrategy(sets, null), new RarityWeightedRankingStrategy()));
    private final UUID scan = UUID.randomUUID();

    private HttpStatus failureOf(String strategy) {
        return (HttpStatus) ((ApiException) org.junit.jupiter.api.Assertions.assertThrows(ApiException.class,
                () -> service.candidates(scan, strategy, 5, 50))).status();
    }

    @Test
    void rarityWeightedIs501EvenWhileCatalogIsMissing() {
        when(detections.scanExists(scan)).thenReturn(true);
        when(importStatus.isCatalogAvailable()).thenReturn(false);

        assertThat(failureOf("rarity-weighted")).isEqualTo(HttpStatus.NOT_IMPLEMENTED);
    }

    @Test
    void coverageIs503UntilACatalogExists() {
        when(detections.scanExists(scan)).thenReturn(true);
        when(importStatus.isCatalogAvailable()).thenReturn(false);

        assertThat(failureOf("coverage")).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void unknownScanIs404AndUnknownStrategyIs400() {
        when(detections.scanExists(scan)).thenReturn(false);

        assertThat(failureOf("coverage")).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(failureOf("nope")).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void emptyPileYieldsNoCandidates() {
        when(detections.scanExists(scan)).thenReturn(true);
        when(importStatus.isCatalogAvailable()).thenReturn(true);
        when(detections.pile(scan)).thenReturn(List.of());

        SetCandidatesResponse response = service.candidates(scan, "coverage", 5, 50);

        assertThat(response.candidates()).isEmpty();
        assertThat(response.pilePieces()).isZero();
        assertThatThrownBy(() -> new RarityWeightedRankingStrategy().rank(List.of(), 1, 1))
                .isInstanceOf(StrategyNotImplementedException.class);
    }
}
