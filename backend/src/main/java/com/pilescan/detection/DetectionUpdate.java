package com.pilescan.detection;

/** Partial update: only the provided fields change. At least one must be present. */
public record DetectionUpdate(String partNum, Integer colorId) {
}
