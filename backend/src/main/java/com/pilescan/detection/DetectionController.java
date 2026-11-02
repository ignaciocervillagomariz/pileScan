package com.pilescan.detection;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/scans/{scanId}/detections")
class DetectionController {

    private final DetectionService service;

    DetectionController(DetectionService service) {
        this.service = service;
    }

    @GetMapping
    List<Detection> list(@PathVariable UUID scanId) {
        return service.list(scanId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Detection add(@PathVariable UUID scanId, @Valid @RequestBody DetectionCreate request) {
        return service.add(scanId, request);
    }

    @PatchMapping("/{detectionId}")
    Detection update(@PathVariable UUID scanId, @PathVariable UUID detectionId,
                     @RequestBody DetectionUpdate request) {
        return service.update(scanId, detectionId, request);
    }

    @DeleteMapping("/{detectionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID scanId, @PathVariable UUID detectionId) {
        service.delete(scanId, detectionId);
    }
}
