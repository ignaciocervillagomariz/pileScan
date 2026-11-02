package com.pilescan.scan;

import com.pilescan.catalog.ColorRef;
import com.pilescan.catalog.PartRef;
import com.pilescan.detection.Detection;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Grouped view of the active detections.
 *
 * @param distinctParts      distinct identified part+color combinations (unidentified pieces are not counted)
 * @param unidentifiedPieces active detections without a part
 */
public record ScanSummary(int totalPieces, int distinctParts, int unidentifiedPieces, List<PieceGroup> groups) {

    public record PieceGroup(PartRef part, ColorRef color, int count, List<UUID> detectionIds) { }

    private record GroupKey(String partNum, Integer colorId) { }

    static ScanSummary of(List<Detection> detections) {
        Map<GroupKey, List<Detection>> grouped = new LinkedHashMap<>();
        int unidentified = 0;
        for (Detection d : detections) {
            if (d.part() == null) {
                unidentified++;
            }
            grouped.computeIfAbsent(new GroupKey(d.part() == null ? null : d.part().partNum(),
                    d.color() == null ? null : d.color().id()), k -> new ArrayList<>()).add(d);
        }
        List<PieceGroup> groups = grouped.entrySet().stream()
                .map(e -> new PieceGroup(e.getValue().getFirst().part(), e.getValue().getFirst().color(),
                        e.getValue().size(), e.getValue().stream().map(Detection::id).toList()))
                .sorted(Comparator.comparingInt(PieceGroup::count).reversed()
                        .thenComparing(g -> g.part() == null ? "" : g.part().partNum())
                        .thenComparingInt(g -> g.color() == null ? -1 : g.color().id()))
                .toList();
        int distinctParts = (int) groups.stream().filter(g -> g.part() != null).count();
        return new ScanSummary(detections.size(), distinctParts, unidentified, groups);
    }
}
