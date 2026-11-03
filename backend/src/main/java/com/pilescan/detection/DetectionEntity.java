package com.pilescan.detection;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

/**
 * A piece found (or added) in a scan. Soft-deleted rows are filtered out of every query by the
 * restriction below, which is how "deleted detections are invisible everywhere" is enforced.
 * The owning aggregate is {@code ScanEntity}; this side only keeps the foreign key so the
 * {@code detection} package does not depend on {@code scan}.
 */
@Entity
@Table(name = "detections")
@SQLRestriction("NOT deleted")
public class DetectionEntity {

    @Id
    private UUID id;

    /** Database-generated insertion order, used to keep detections in detector order. */
    @Column(insertable = false, updatable = false)
    private Long seq;

    @Column(name = "scan_id", nullable = false, updatable = false)
    private UUID scanId;

    @Enumerated(EnumType.STRING)
    private DetectionSource source;

    private boolean corrected;
    private boolean deleted;
    private double confidence;
    @Column(name = "bbox_x")
    private Integer bboxX;

    @Column(name = "bbox_y")
    private Integer bboxY;

    private Integer bboxWidth;
    private Integer bboxHeight;
    private String partNum;
    private Integer colorId;

    @JdbcTypeCode(Types.CHAR)
    @Column(length = 7)
    private String measuredRgb;

    @Enumerated(EnumType.STRING)
    private MappingStatus mappingStatus;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<PartCandidate> partCandidates;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<ColorCandidate> colorCandidates;

    @Enumerated(EnumType.STRING)
    private ClassificationStatus classificationStatus;

    private OffsetDateTime createdAt;

    protected DetectionEntity() {
    }

    static DetectionEntity from(DetectionRecord r) {
        DetectionEntity e = new DetectionEntity();
        e.id = r.id();
        e.scanId = r.scanId();
        e.source = r.source();
        e.corrected = r.corrected();
        e.confidence = r.confidence();
        if (r.bbox() != null) {
            e.bboxX = r.bbox().x();
            e.bboxY = r.bbox().y();
            e.bboxWidth = r.bbox().width();
            e.bboxHeight = r.bbox().height();
        }
        e.partNum = r.partNum();
        e.colorId = r.colorId();
        e.measuredRgb = r.measuredRgb();
        e.mappingStatus = r.mappingStatus();
        e.partCandidates = r.partCandidates();
        e.colorCandidates = r.colorCandidates();
        e.createdAt = r.createdAt();
        e.classificationStatus = r.classificationStatus();
        return e;
    }

    public DetectionRecord toRecord() {
        BBox bbox = bboxX == null ? null : new BBox(bboxX, bboxY, bboxWidth, bboxHeight);
        return new DetectionRecord(id, scanId, source, corrected, confidence, bbox, partNum, colorId, measuredRgb,
                mappingStatus, partCandidates, colorCandidates, createdAt, classificationStatus);
    }

    /** A user correction wins over the classifier, so confidence becomes 1.0. */
    void correct(String partNum, int colorId) {
        this.partNum = partNum;
        this.colorId = colorId;
        this.corrected = true;
        this.confidence = 1.0;
        this.mappingStatus = MappingStatus.MAPPED;
    }
}
