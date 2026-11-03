package com.pilescan.detection;

import com.pilescan.catalog.ColorRef;
import com.pilescan.catalog.PartRef;
import java.util.List;
import java.util.UUID;

/** API representation of an active detection. */
public record Detection(
        UUID id,
        BBox bbox,
        DetectionSource source,
        boolean corrected,
        double confidence,
        PartRef part,
        ColorRef color,
        List<PartCandidate> partCandidates,
        List<ColorCandidate> colorCandidates,
        String measuredRgb,
        MappingStatus mappingStatus,
        ClassificationStatus classificationStatus) {
}
