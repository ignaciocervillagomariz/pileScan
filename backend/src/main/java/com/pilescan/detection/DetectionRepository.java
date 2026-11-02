package com.pilescan.detection;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Persistence of detections. Soft-deleted rows are invisible to every method here. */
@Repository
public class DetectionRepository {

    private static final TypeReference<List<PartCandidate>> PART_CANDIDATES = new TypeReference<>() { };
    private static final TypeReference<List<ColorCandidate>> COLOR_CANDIDATES = new TypeReference<>() { };
    private static final String COLUMNS = """
            id, scan_id, source, corrected, confidence, bbox_x, bbox_y, bbox_width, bbox_height, part_num, color_id,
            measured_rgb, mapping_status, part_candidates::text AS part_candidates,
            color_candidates::text AS color_candidates, created_at""";

    private final JdbcClient jdbc;
    private final JsonMapper json;

    DetectionRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public boolean scanExists(UUID scanId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM scans WHERE id = :id)")
                .param("id", scanId).query(Boolean.class).single();
    }

    public void insert(DetectionRecord d) {
        BBox box = d.bbox();
        jdbc.sql("""
                INSERT INTO detections (id, scan_id, source, corrected, confidence, bbox_x, bbox_y, bbox_width,
                    bbox_height, part_num, color_id, measured_rgb, mapping_status, part_candidates,
                    color_candidates, created_at)
                VALUES (:id, :scan, :source, :corrected, :confidence, :x, :y, :w, :h, :part, :color, :rgb, :mapping,
                    CAST(:pc AS jsonb), CAST(:cc AS jsonb), :created)
                """)
                .param("id", d.id()).param("scan", d.scanId()).param("source", d.source().name())
                .param("corrected", d.corrected()).param("confidence", d.confidence())
                .param("x", box == null ? null : box.x()).param("y", box == null ? null : box.y())
                .param("w", box == null ? null : box.width()).param("h", box == null ? null : box.height())
                .param("part", d.partNum()).param("color", d.colorId()).param("rgb", d.measuredRgb())
                .param("mapping", d.mappingStatus().name())
                .param("pc", json.writeValueAsString(d.partCandidates()))
                .param("cc", json.writeValueAsString(d.colorCandidates()))
                .param("created", d.createdAt())
                .update();
    }

    public List<DetectionRecord> listActive(UUID scanId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM detections WHERE scan_id = :scan AND NOT deleted ORDER BY seq")
                .param("scan", scanId).query(this::map).list();
    }

    public Optional<DetectionRecord> findActive(UUID scanId, UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM detections WHERE scan_id = :scan AND id = :id AND NOT deleted")
                .param("scan", scanId).param("id", id).query(this::map).optional();
    }

    /** Applies a user correction: the new values win, so confidence becomes 1.0. */
    public void applyCorrection(UUID id, String partNum, int colorId) {
        jdbc.sql("""
                UPDATE detections SET part_num = :part, color_id = :color, corrected = TRUE, confidence = 1.0,
                    mapping_status = 'MAPPED'
                WHERE id = :id
                """)
                .param("part", partNum).param("color", colorId).param("id", id).update();
    }

    public boolean softDelete(UUID scanId, UUID id) {
        return jdbc.sql("UPDATE detections SET deleted = TRUE WHERE scan_id = :scan AND id = :id AND NOT deleted")
                .param("scan", scanId).param("id", id).update() > 0;
    }

    /** Active detections that have both a part and a color, summed per part+color: the input of ranking. */
    public List<PileEntry> pile(UUID scanId) {
        return jdbc.sql("""
                SELECT part_num, color_id, COUNT(*) AS quantity FROM detections
                WHERE scan_id = :scan AND NOT deleted AND part_num IS NOT NULL AND color_id IS NOT NULL
                GROUP BY part_num, color_id
                """)
                .param("scan", scanId)
                .query((rs, n) -> new PileEntry(rs.getString("part_num"), rs.getInt("color_id"), rs.getInt("quantity")))
                .list();
    }

    private DetectionRecord map(ResultSet rs, int rowNum) throws SQLException {
        Integer boxX = (Integer) rs.getObject("bbox_x");
        BBox bbox = boxX == null ? null
                : new BBox(boxX, rs.getInt("bbox_y"), rs.getInt("bbox_width"), rs.getInt("bbox_height"));
        return new DetectionRecord(
                rs.getObject("id", UUID.class), rs.getObject("scan_id", UUID.class),
                DetectionSource.valueOf(rs.getString("source")), rs.getBoolean("corrected"),
                rs.getDouble("confidence"), bbox, rs.getString("part_num"), (Integer) rs.getObject("color_id"),
                rs.getString("measured_rgb"), MappingStatus.valueOf(rs.getString("mapping_status")),
                json.readValue(rs.getString("part_candidates"), PART_CANDIDATES),
                json.readValue(rs.getString("color_candidates"), COLOR_CANDIDATES),
                rs.getObject("created_at", OffsetDateTime.class));
    }
}
