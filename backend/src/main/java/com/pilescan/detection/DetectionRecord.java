package com.pilescan.detection;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Persisted detection row. The part and color are stored as IDs and resolved against the catalog on read. */
public record DetectionRecord(
        UUID id,
        UUID scanId,
        DetectionSource source,
        boolean corrected,
        double confidence,
        BBox bbox,
        String partNum,
        Integer colorId,
        String measuredRgb,
        MappingStatus mappingStatus,
        List<PartCandidate> partCandidates,
        List<ColorCandidate> colorCandidates,
        OffsetDateTime createdAt) {
}
