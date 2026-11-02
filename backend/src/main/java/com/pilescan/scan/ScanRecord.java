package com.pilescan.scan;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Persisted scan row. */
record ScanRecord(UUID id, ScanStatus status, OffsetDateTime createdAt, String imageFile, String imageContentType,
                  int imageWidth, int imageHeight, String pipeline, String errorMessage, List<String> warnings) {
}
