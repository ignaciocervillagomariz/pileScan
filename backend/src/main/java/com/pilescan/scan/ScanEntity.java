package com.pilescan.scan;

import com.pilescan.detection.DetectionEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Aggregate root of a scan: the stored image, the recognition outcome and its (active) detections.
 * Detections are navigable from here but written through the detection repository, which keeps
 * the {@code detection} package independent of {@code scan}.
 */
@Entity
@Table(name = "scans")
class ScanEntity {

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    private ScanStatus status;

    private OffsetDateTime createdAt;
    private String imageFile;
    private String imageContentType;
    private int imageWidth;
    private int imageHeight;
    private String pipeline;
    private String errorMessage;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> warnings = new ArrayList<>();

    private String debugImageFile;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Double> inferenceTimingsMs;

    @OneToMany(fetch = FetchType.LAZY)
    @JoinColumn(name = "scan_id", insertable = false, updatable = false)
    @OrderBy("seq")
    private List<DetectionEntity> detections = new ArrayList<>();

    protected ScanEntity() {
    }

    ScanEntity(UUID id, OffsetDateTime createdAt, String imageFile, String imageContentType, int imageWidth,
               int imageHeight) {
        this.id = id;
        this.status = ScanStatus.PROCESSING;
        this.createdAt = createdAt;
        this.imageFile = imageFile;
        this.imageContentType = imageContentType;
        this.imageWidth = imageWidth;
        this.imageHeight = imageHeight;
    }

    void complete(String pipeline, List<String> warnings, Map<String, Double> inferenceTimingsMs,
                  String debugImageFile) {
        this.status = ScanStatus.COMPLETED;
        this.inferenceTimingsMs = inferenceTimingsMs;
        this.debugImageFile = debugImageFile;
        this.pipeline = pipeline;
        this.warnings = new ArrayList<>(warnings);
    }

    void fail(String errorMessage) {
        this.status = ScanStatus.FAILED;
        this.errorMessage = errorMessage;
    }

    UUID getId() {
        return id;
    }

    ScanStatus getStatus() {
        return status;
    }

    OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    String getImageFile() {
        return imageFile;
    }

    String getImageContentType() {
        return imageContentType;
    }

    int getImageWidth() {
        return imageWidth;
    }

    int getImageHeight() {
        return imageHeight;
    }

    String getPipeline() {
        return pipeline;
    }

    String getErrorMessage() {
        return errorMessage;
    }

    String getDebugImageFile() {
        return debugImageFile;
    }

    Map<String, Double> getInferenceTimingsMs() {
        return inferenceTimingsMs;
    }

    List<String> getWarnings() {
        return warnings;
    }

    List<DetectionEntity> getDetections() {
        return detections;
    }
}
