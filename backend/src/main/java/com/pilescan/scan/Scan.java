package com.pilescan.scan;

import com.pilescan.detection.Detection;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** API representation of a scan with its active detections. */
public record Scan(
        UUID id,
        ScanStatus status,
        OffsetDateTime createdAt,
        Image image,
        List<Detection> detections,
        ScanSummary summary,
        List<String> warnings,
        String errorMessage,
        String pipeline) {

    public record Image(String url, int width, int height) { }
}
