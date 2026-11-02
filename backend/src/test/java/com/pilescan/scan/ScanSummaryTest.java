package com.pilescan.scan;

import static org.assertj.core.api.Assertions.assertThat;

import com.pilescan.catalog.ColorRef;
import com.pilescan.catalog.PartRef;
import com.pilescan.detection.Detection;
import com.pilescan.detection.DetectionSource;
import com.pilescan.detection.MappingStatus;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ScanSummaryTest {

    private static final PartRef BRICK = new PartRef("3001", "Brick 2 x 4", null);
    private static final PartRef PLATE = new PartRef("3020", "Plate 2 x 4", null);
    private static final ColorRef RED = new ColorRef(4, "Red", "#C91A09");
    private static final ColorRef BLUE = new ColorRef(1, "Blue", "#0055BF");

    private static Detection detection(PartRef part, ColorRef color) {
        return new Detection(UUID.randomUUID(), null, DetectionSource.DETECTED, false, 0.5, part, color,
                List.of(), List.of(), null, part == null ? MappingStatus.UNMAPPED : MappingStatus.MAPPED);
    }

    @Test
    void groupsByPartAndColorSortedByCount() {
        List<Detection> detections = List.of(
                detection(BRICK, RED), detection(PLATE, BLUE), detection(BRICK, RED), detection(BRICK, BLUE),
                detection(BRICK, RED), detection(null, RED), detection(null, RED));

        ScanSummary summary = ScanSummary.of(detections);

        assertThat(summary.totalPieces()).isEqualTo(7);
        assertThat(summary.unidentifiedPieces()).isEqualTo(2);
        assertThat(summary.distinctParts()).isEqualTo(3);
        assertThat(summary.groups()).extracting(ScanSummary.PieceGroup::count).containsExactly(3, 2, 1, 1);
        assertThat(summary.groups().getFirst().part()).isEqualTo(BRICK);
        assertThat(summary.groups().getFirst().detectionIds()).hasSize(3);
    }

    @Test
    void emptyScan() {
        ScanSummary summary = ScanSummary.of(List.of());

        assertThat(summary.totalPieces()).isZero();
        assertThat(summary.groups()).isEmpty();
    }
}
