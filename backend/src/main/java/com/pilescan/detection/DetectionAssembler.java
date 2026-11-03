package com.pilescan.detection;

import com.pilescan.catalog.CatalogRepository;
import com.pilescan.catalog.ColorRef;
import com.pilescan.catalog.PartRef;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Resolves stored part and color IDs against the catalog (two queries per list, not per detection). */
@Component
public class DetectionAssembler {

    private final CatalogRepository catalog;

    DetectionAssembler(CatalogRepository catalog) {
        this.catalog = catalog;
    }

    public List<Detection> assemble(List<DetectionRecord> records) {
        Set<String> partNums = new HashSet<>();
        Set<Integer> colorIds = new HashSet<>();
        for (DetectionRecord r : records) {
            if (r.partNum() != null) {
                partNums.add(r.partNum());
            }
            if (r.colorId() != null) {
                colorIds.add(r.colorId());
            }
        }
        Map<String, PartRef> parts = catalog.partRefs(partNums);
        Map<Integer, ColorRef> colors = catalog.colorRefs(colorIds);
        return records.stream()
                .map(r -> new Detection(r.id(), r.bbox(), r.source(), r.corrected(), r.confidence(),
                        r.partNum() == null ? null : parts.get(r.partNum()),
                        r.colorId() == null ? null : colors.get(r.colorId()),
                        r.partCandidates(), r.colorCandidates(), r.measuredRgb(), r.mappingStatus(),
                        r.classificationStatus()))
                .toList();
    }

    public Detection assemble(DetectionRecord record) {
        return assemble(List.of(record)).getFirst();
    }
}
