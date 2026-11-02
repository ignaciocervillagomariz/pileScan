package com.pilescan.ranking;

import com.pilescan.catalog.ColorRef;
import com.pilescan.catalog.PartRef;

public record MissingPart(PartRef part, ColorRef color, int quantityNeeded, int quantityHave) {
}
