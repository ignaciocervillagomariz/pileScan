package com.pilescan.detection;

import com.pilescan.catalog.ColorRef;

public record ColorCandidate(ColorRef color, double score) {
}
