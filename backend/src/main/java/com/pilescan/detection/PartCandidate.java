package com.pilescan.detection;

/** A classifier guess; {@code partNum} is the mapped Rebrickable part_num or null. */
public record PartCandidate(String partNum, String rawPartId, String idSystem, String name, double score,
                            String imageUrl) {
}
