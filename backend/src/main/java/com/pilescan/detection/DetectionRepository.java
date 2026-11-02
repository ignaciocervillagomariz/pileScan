package com.pilescan.detection;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.EntityManager;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persistence of detections. Spring Data JPA does the work; this class exposes immutable
 * {@link DetectionRecord}s so services and ranking do not touch entities.
 */
@Repository
public class DetectionRepository {

    private final DetectionJpaRepository jpa;
    private final EntityManager entityManager;
    private final JdbcClient jdbc;

    DetectionRepository(DetectionJpaRepository jpa, EntityManager entityManager, JdbcClient jdbc) {
        this.jpa = jpa;
        this.entityManager = entityManager;
        this.jdbc = jdbc;
    }

    /** Cross-aggregate existence check by plain SQL, so this package need not know the scan entity. */
    public boolean scanExists(UUID scanId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM scans WHERE id = :id)")
                .param("id", scanId).query(Boolean.class).single();
    }

    @Transactional
    public void insert(DetectionRecord record) {
        entityManager.persist(DetectionEntity.from(record));
    }

    @Transactional(readOnly = true)
    public List<DetectionRecord> listActive(UUID scanId) {
        return jpa.findByScanIdOrderBySeq(scanId).stream().map(DetectionEntity::toRecord).toList();
    }

    @Transactional(readOnly = true)
    public Optional<DetectionRecord> findActive(UUID scanId, UUID id) {
        return jpa.findByIdAndScanId(id, scanId).map(DetectionEntity::toRecord);
    }

    @Transactional
    public void applyCorrection(UUID id, String partNum, int colorId) {
        jpa.findById(id).orElseThrow().correct(partNum, colorId);
    }

    @Transactional
    public boolean softDelete(UUID scanId, UUID id) {
        return jpa.softDelete(scanId, id) > 0;
    }

    /** Active detections that have both a part and a color, summed per part+color: the input of ranking. */
    @Transactional(readOnly = true)
    public List<PileEntry> pile(UUID scanId) {
        return jpa.pile(scanId).stream()
                .map(row -> new PileEntry((String) row[0], (Integer) row[1], ((Long) row[2]).intValue()))
                .toList();
    }
}
