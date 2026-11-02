package com.pilescan.scan;

import com.pilescan.catalog.CatalogRepository;
import com.pilescan.catalog.ColorRef;
import com.pilescan.detection.BBox;
import com.pilescan.detection.ColorCandidate;
import com.pilescan.detection.DetectionRecord;
import com.pilescan.detection.DetectionSource;
import com.pilescan.detection.MappingStatus;
import com.pilescan.detection.PartCandidate;
import com.pilescan.inference.RecognizeResponse;
import com.pilescan.inference.RecognizeResponse.DetectionResult;
import com.pilescan.partmapping.MappingResult;
import com.pilescan.partmapping.PartIdMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Turns an inference response into detection rows: maps part IDs to Rebrickable, resolves colors
 * and picks the current part and color of every detection.
 *
 * <p>The current part is the highest-scored candidate that could be mapped. The current color is
 * the top color candidate. {@code confidence} is the product of the detection score and the scores
 * of the chosen part and color, with missing factors left out.
 */
@Component
class RecognitionMapper {

    record Result(List<DetectionRecord> detections, List<String> warnings) { }

    private final PartIdMapper partIdMapper;
    private final CatalogRepository catalog;

    RecognitionMapper(PartIdMapper partIdMapper, CatalogRepository catalog) {
        this.partIdMapper = partIdMapper;
        this.catalog = catalog;
    }

    Result map(UUID scanId, RecognizeResponse response, OffsetDateTime now) {
        Set<Integer> colorIds = new HashSet<>();
        response.detections().forEach(d -> d.colorCandidates().forEach(c -> colorIds.add(c.rebrickableColorId())));
        Map<Integer, ColorRef> colors = catalog.colorRefs(colorIds);
        Map<String, MappingResult> mappings = new HashMap<>();

        List<DetectionRecord> records = new ArrayList<>();
        int unmappedDetections = 0;
        for (DetectionResult d : response.detections()) {
            DetectionRecord record = toRecord(scanId, d, colors, mappings, now);
            if (record.mappingStatus() == MappingStatus.UNMAPPED) {
                unmappedDetections++;
            }
            records.add(record);
        }

        List<String> warnings = new ArrayList<>(response.warnings() == null ? List.of() : response.warnings());
        if (unmappedDetections > 0) {
            warnings.add(unmappedDetections + " detected piece(s) have part IDs that could not be mapped to a "
                    + "Rebrickable part. Pick the part manually.");
        }
        return new Result(records, warnings);
    }

    private DetectionRecord toRecord(UUID scanId, DetectionResult d, Map<Integer, ColorRef> colors,
                                     Map<String, MappingResult> mappings, OffsetDateTime now) {
        List<PartCandidate> partCandidates = new ArrayList<>();
        PartCandidate chosen = null;
        for (RecognizeResponse.PartCandidate c : d.partCandidates()) {
            MappingResult mapping = mappings.computeIfAbsent(c.idSystem() + ":" + c.partId(),
                    key -> partIdMapper.map(c.idSystem(), c.partId()));
            PartCandidate candidate = new PartCandidate(mapping.partNum(), c.partId(), c.idSystem(), c.name(),
                    c.score(), c.imageUrl());
            partCandidates.add(candidate);
            if (chosen == null && candidate.partNum() != null) {
                chosen = candidate;
            }
        }

        List<ColorCandidate> colorCandidates = d.colorCandidates().stream()
                .filter(c -> colors.containsKey(c.rebrickableColorId()))
                .map(c -> new ColorCandidate(colors.get(c.rebrickableColorId()), c.score()))
                .toList();
        ColorCandidate topColor = colorCandidates.isEmpty() ? null : colorCandidates.getFirst();

        MappingStatus status = partCandidates.isEmpty() ? MappingStatus.NONE
                : chosen != null ? MappingStatus.MAPPED : MappingStatus.UNMAPPED;
        double confidence = confidence(d.detectionScore(), chosen == null ? null : chosen.score(),
                topColor == null ? null : topColor.score());

        BBox bbox = new BBox(d.bbox().x(), d.bbox().y(), d.bbox().width(), d.bbox().height());
        return new DetectionRecord(UUID.randomUUID(), scanId, DetectionSource.DETECTED, false, confidence, bbox,
                chosen == null ? null : chosen.partNum(), topColor == null ? null : topColor.color().id(),
                d.measuredRgb() == null ? null : d.measuredRgb().hex(), status, partCandidates, colorCandidates, now);
    }

    static double confidence(double detectionScore, Double partScore, Double colorScore) {
        double value = detectionScore * (partScore == null ? 1 : partScore) * (colorScore == null ? 1 : colorScore);
        return Math.max(0, Math.min(1, value));
    }
}
