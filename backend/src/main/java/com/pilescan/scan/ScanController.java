package com.pilescan.scan;

import com.pilescan.common.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "scans")
@RestController
@RequestMapping("/api/scans")
class ScanController {

    private static final long MAX_IMAGE_BYTES = 15L * 1024 * 1024;

    private final ScanService service;

    ScanController(ScanService service) {
        this.service = service;
    }

    @Operation(operationId = "createScan", summary = "Upload a photo, run recognition synchronously, and return the scan.")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<Scan> create(@RequestPart("image") MultipartFile image) throws IOException {
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw ApiException.payloadTooLarge("Image exceeds the 15 MB limit.");
        }
        if (image.isEmpty()) {
            throw ApiException.badRequest("The image is empty.");
        }
        Scan scan = service.create(image.getBytes());
        return ResponseEntity.created(URI.create("/api/scans/" + scan.id())).body(scan);
    }

    @Operation(operationId = "getScan", summary = "Get a scan with its active detections and grouped summary.")
    @GetMapping("/{scanId}")
    Scan get(@PathVariable UUID scanId) {
        return service.get(scanId);
    }

    @Operation(operationId = "getScanDebugImage", summary = "Get the inference debug overlay of a scan.")
    @GetMapping("/{scanId}/debug-image")
    ResponseEntity<Resource> debugImage(@PathVariable UUID scanId) {
        ScanService.StoredImage image = service.debugImage(scanId);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate().immutable())
                .body(image.resource());
    }

    @Operation(operationId = "getScanImage", summary = "Get the stored (orientation-corrected) scan image.")
    @GetMapping("/{scanId}/image")
    ResponseEntity<Resource> image(@PathVariable UUID scanId) {
        ScanService.StoredImage image = service.image(scanId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate().immutable())
                .body(image.resource());
    }
}
