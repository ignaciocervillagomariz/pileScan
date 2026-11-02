package com.pilescan.scan;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Repository
class ScanRepository {

    private static final TypeReference<List<String>> STRINGS = new TypeReference<>() { };

    private final JdbcClient jdbc;
    private final JsonMapper json;

    ScanRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    void insert(ScanRecord scan) {
        jdbc.sql("""
                INSERT INTO scans (id, status, created_at, image_file, image_content_type, image_width, image_height)
                VALUES (:id, :status, :created, :file, :type, :w, :h)
                """)
                .param("id", scan.id()).param("status", scan.status().name()).param("created", scan.createdAt())
                .param("file", scan.imageFile()).param("type", scan.imageContentType())
                .param("w", scan.imageWidth()).param("h", scan.imageHeight()).update();
    }

    void finish(UUID id, ScanStatus status, String pipeline, String errorMessage, List<String> warnings) {
        jdbc.sql("""
                UPDATE scans SET status = :status, pipeline = :pipeline, error_message = :error,
                    warnings = CAST(:warnings AS jsonb)
                WHERE id = :id
                """)
                .param("status", status.name()).param("pipeline", pipeline).param("error", errorMessage)
                .param("warnings", json.writeValueAsString(warnings)).param("id", id).update();
    }

    Optional<ScanRecord> find(UUID id) {
        return jdbc.sql("""
                SELECT id, status, created_at, image_file, image_content_type, image_width, image_height, pipeline,
                       error_message, warnings::text AS warnings
                FROM scans WHERE id = :id
                """)
                .param("id", id)
                .query((rs, n) -> new ScanRecord(rs.getObject("id", UUID.class),
                        ScanStatus.valueOf(rs.getString("status")), rs.getObject("created_at", OffsetDateTime.class),
                        rs.getString("image_file"), rs.getString("image_content_type"), rs.getInt("image_width"),
                        rs.getInt("image_height"), rs.getString("pipeline"), rs.getString("error_message"),
                        json.readValue(rs.getString("warnings"), STRINGS)))
                .optional();
    }
}
