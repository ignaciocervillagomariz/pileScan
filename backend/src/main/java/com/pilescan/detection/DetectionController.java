package com.pilescan.detection;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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

@Tag(name = "detections")
@RestController
@RequestMapping("/api/scans/{scanId}/detections")
class DetectionController {

    private final DetectionService service;

    DetectionController(DetectionService service) {
        this.service = service;
    }

    @Operation(operationId = "listDetections", summary = "List active detections of a scan.")
    @GetMapping
    List<Detection> list(@PathVariable UUID scanId) {
        return service.list(scanId);
    }

    @Operation(operationId = "addDetection", summary = "Add a piece the detector missed (manual correction).")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Detection add(@PathVariable UUID scanId, @Valid @RequestBody DetectionCreate request) {
        return service.add(scanId, request);
    }

    @Operation(operationId = "updateDetection", summary = "Correct the part and/or color of a detection.")
    @PatchMapping("/{detectionId}")
    Detection update(@PathVariable UUID scanId, @PathVariable UUID detectionId,
                     @RequestBody DetectionUpdate request) {
        return service.update(scanId, detectionId, request);
    }

    @Operation(operationId = "deleteDetection", summary = "Remove a false positive (soft delete).")
    @DeleteMapping("/{detectionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID scanId, @PathVariable UUID detectionId) {
        service.delete(scanId, detectionId);
    }
}
