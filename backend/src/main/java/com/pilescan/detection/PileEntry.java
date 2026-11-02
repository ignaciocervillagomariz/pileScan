package com.pilescan.detection;

/** Quantity of one part+color in a scan's active, identified pieces. */
public record PileEntry(String partNum, int colorId, int quantity) {
}
