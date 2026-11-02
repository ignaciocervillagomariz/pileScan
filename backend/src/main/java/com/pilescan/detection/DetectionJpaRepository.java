package com.pilescan.detection;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface DetectionJpaRepository extends JpaRepository<DetectionEntity, UUID> {

    List<DetectionEntity> findByScanIdOrderBySeq(UUID scanId);

    Optional<DetectionEntity> findByIdAndScanId(UUID id, UUID scanId);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE DetectionEntity d SET d.deleted = TRUE WHERE d.scanId = :scanId AND d.id = :id")
    int softDelete(@Param("scanId") UUID scanId, @Param("id") UUID id);

    @Query("""
            SELECT d.partNum, d.colorId, COUNT(d) FROM DetectionEntity d
            WHERE d.scanId = :scanId AND d.partNum IS NOT NULL AND d.colorId IS NOT NULL
            GROUP BY d.partNum, d.colorId""")
    List<Object[]> pile(@Param("scanId") UUID scanId);
}
