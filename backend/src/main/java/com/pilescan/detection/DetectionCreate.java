package com.pilescan.detection;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record DetectionCreate(@NotBlank String partNum, @NotNull Integer colorId, @Valid BBox bbox) {
}
