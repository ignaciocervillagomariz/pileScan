package com.pilescan.partmapping;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface UnmappedPartIdJpaRepository extends JpaRepository<UnmappedPartIdEntity, PartIdKey> {

    List<UnmappedPartIdEntity> findAllByOrderByOccurrencesDescLastSeenAtDesc();

    @Modifying
    @Query(nativeQuery = true, value = """
            INSERT INTO unmapped_part_ids (id_system, raw_id, occurrences, last_seen_at, last_error)
            VALUES (:idSystem, :rawId, 1, :now, :error)
            ON CONFLICT (id_system, raw_id) DO UPDATE SET occurrences = unmapped_part_ids.occurrences + 1,
                last_seen_at = EXCLUDED.last_seen_at, last_error = EXCLUDED.last_error""")
    void countOccurrence(@Param("idSystem") String idSystem, @Param("rawId") String rawId,
                         @Param("error") String error, @Param("now") OffsetDateTime now);
}
