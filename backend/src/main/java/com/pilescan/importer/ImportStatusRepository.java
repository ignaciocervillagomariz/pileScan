package com.pilescan.importer;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Single-row table holding the state of the last catalog import. */
@Repository
public class ImportStatusRepository {

    private static final TypeReference<Map<String, Long>> COUNTS = new TypeReference<>() { };

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final Clock clock;

    ImportStatusRepository(JdbcClient jdbc, JsonMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.clock = clock;
    }

    public ImportStatus current() {
        return jdbc.sql("SELECT state, started_at, finished_at, message, counts::text AS counts "
                        + "FROM catalog_import_status WHERE id = 1")
                .query((rs, n) -> new ImportStatus(
                        ImportStatus.State.valueOf(rs.getString("state")),
                        rs.getObject("started_at", OffsetDateTime.class),
                        rs.getObject("finished_at", OffsetDateTime.class),
                        rs.getString("message"),
                        json.readValue(rs.getString("counts"), COUNTS)))
                .single();
    }

    /** True once at least one import has completed: ranking needs a catalog to rank against. */
    public boolean isCatalogAvailable() {
        return jdbc.sql("SELECT last_success_at IS NOT NULL FROM catalog_import_status WHERE id = 1")
                .query(Boolean.class).single();
    }

    /** True when no import ever succeeded or the last success is older than {@code maxAge}. */
    public boolean isStale(Duration maxAge) {
        return jdbc.sql("SELECT last_success_at IS NULL OR last_success_at < :threshold "
                        + "FROM catalog_import_status WHERE id = 1")
                .param("threshold", OffsetDateTime.now(clock).minus(maxAge))
                .query(Boolean.class).single();
    }

    void markRunning() {
        jdbc.sql("UPDATE catalog_import_status SET state = 'RUNNING', started_at = :now, finished_at = NULL, "
                        + "message = NULL WHERE id = 1")
                .param("now", OffsetDateTime.now(clock)).update();
    }

    void markSucceeded(Map<String, Long> counts) {
        jdbc.sql("UPDATE catalog_import_status SET state = 'SUCCEEDED', finished_at = :now, "
                        + "last_success_at = :now, message = NULL, counts = CAST(:counts AS jsonb) WHERE id = 1")
                .param("now", OffsetDateTime.now(clock))
                .param("counts", json.writeValueAsString(counts)).update();
    }

    void markFailed(String message) {
        jdbc.sql("UPDATE catalog_import_status SET state = 'FAILED', finished_at = :now, message = :msg WHERE id = 1")
                .param("now", OffsetDateTime.now(clock)).param("msg", message).update();
    }

    /** A RUNNING row at boot means the previous process died mid-import. */
    void failInterrupted() {
        jdbc.sql("UPDATE catalog_import_status SET state = 'FAILED', finished_at = :now, "
                        + "message = 'Interrupted by application restart' WHERE id = 1 AND state = 'RUNNING'")
                .param("now", OffsetDateTime.now(clock)).update();
    }
}
