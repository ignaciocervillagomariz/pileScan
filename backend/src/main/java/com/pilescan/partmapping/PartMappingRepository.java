package com.pilescan.partmapping;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class PartMappingRepository {

    /** A cached answer; {@code partNum} is set only for MAPPED. */
    record CachedMapping(String partNum, String status, String detail, OffsetDateTime checkedAt) { }

    private final JdbcClient jdbc;

    PartMappingRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<CachedMapping> find(String idSystem, String rawId) {
        return jdbc.sql("SELECT part_num, status, detail, checked_at FROM part_id_mapping "
                        + "WHERE id_system = :s AND raw_id = :r")
                .param("s", idSystem).param("r", rawId)
                .query((rs, n) -> new CachedMapping(rs.getString("part_num"), rs.getString("status"),
                        rs.getString("detail"), rs.getObject("checked_at", OffsetDateTime.class)))
                .optional();
    }

    void save(String idSystem, String rawId, String partNum, String status, String detail, OffsetDateTime now) {
        jdbc.sql("""
                INSERT INTO part_id_mapping (id_system, raw_id, part_num, status, detail, checked_at)
                VALUES (:s, :r, :p, :st, :d, :now)
                ON CONFLICT (id_system, raw_id) DO UPDATE SET part_num = EXCLUDED.part_num,
                    status = EXCLUDED.status, detail = EXCLUDED.detail, checked_at = EXCLUDED.checked_at
                """)
                .param("s", idSystem).param("r", rawId).param("p", partNum)
                .param("st", status).param("d", detail).param("now", now).update();
    }

    void recordUnmapped(String idSystem, String rawId, String error, OffsetDateTime now) {
        jdbc.sql("""
                INSERT INTO unmapped_part_ids (id_system, raw_id, occurrences, last_seen_at, last_error)
                VALUES (:s, :r, 1, :now, :e)
                ON CONFLICT (id_system, raw_id) DO UPDATE SET occurrences = unmapped_part_ids.occurrences + 1,
                    last_seen_at = EXCLUDED.last_seen_at, last_error = EXCLUDED.last_error
                """)
                .param("s", idSystem).param("r", rawId).param("e", error).param("now", now).update();
    }

    /** An ID that now maps (new catalog, API key added) no longer belongs on the unmapped list. */
    void clearUnmapped(String idSystem, String rawId) {
        jdbc.sql("DELETE FROM unmapped_part_ids WHERE id_system = :s AND raw_id = :r")
                .param("s", idSystem).param("r", rawId).update();
    }

    List<UnmappedPartId> listUnmapped() {
        return jdbc.sql("SELECT id_system, raw_id, occurrences, last_seen_at, last_error FROM unmapped_part_ids "
                        + "ORDER BY occurrences DESC, last_seen_at DESC")
                .query((rs, n) -> new UnmappedPartId(rs.getString("raw_id"), rs.getString("id_system"),
                        rs.getInt("occurrences"), rs.getObject("last_seen_at", OffsetDateTime.class),
                        rs.getString("last_error")))
                .list();
    }
}
