package com.pilescan.detection;

import jakarta.validation.constraints.Min;

/** Axis-aligned box in pixels of the stored scan image, origin top-left. */
public record BBox(@Min(0) int x, @Min(0) int y, @Min(1) int width, @Min(1) int height) {
}
