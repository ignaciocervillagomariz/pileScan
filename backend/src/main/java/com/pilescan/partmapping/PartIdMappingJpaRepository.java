package com.pilescan.partmapping;

import java.time.OffsetDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Writes are atomic upserts: two scans may report the same new ID at the same time. */
interface PartIdMappingJpaRepository extends JpaRepository<PartIdMappingEntity, PartIdKey> {

    @Modifying
    @Query(nativeQuery = true, value = """
            INSERT INTO part_id_mapping (id_system, raw_id, part_num, status, detail, checked_at)
            VALUES (:idSystem, :rawId, :partNum, :status, :detail, :now)
            ON CONFLICT (id_system, raw_id) DO UPDATE SET part_num = EXCLUDED.part_num,
                status = EXCLUDED.status, detail = EXCLUDED.detail, checked_at = EXCLUDED.checked_at""")
    void upsert(@Param("idSystem") String idSystem, @Param("rawId") String rawId, @Param("partNum") String partNum,
                @Param("status") String status, @Param("detail") String detail, @Param("now") OffsetDateTime now);
}
