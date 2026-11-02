package com.pilescan.catalog;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Read access to the imported Rebrickable catalog. */
@Repository
public class CatalogRepository {

    private final JdbcClient jdbc;

    CatalogRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Exact part_num first, then prefix, then name contains. LIKE wildcards in {@code q} are literal. */
    public List<Part> searchParts(String q, int limit) {
        String escaped = q.toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return jdbc.sql("""
                SELECT p.part_num, p.name, pc.name AS category, p.img_url
                FROM parts p LEFT JOIN part_categories pc ON pc.id = p.part_cat_id
                WHERE lower(p.part_num) = :exact
                   OR lower(p.part_num) LIKE :prefix
                   OR lower(p.name) LIKE :contains
                ORDER BY CASE WHEN lower(p.part_num) = :exact THEN 0
                              WHEN lower(p.part_num) LIKE :prefix THEN 1 ELSE 2 END,
                         length(p.part_num), p.part_num
                LIMIT :limit
                """)
                .param("exact", q.toLowerCase())
                .param("prefix", escaped + "%")
                .param("contains", "%" + escaped + "%")
                .param("limit", limit)
                .query((rs, n) -> new Part(rs.getString("part_num"), rs.getString("name"),
                        rs.getString("category"), rs.getString("img_url")))
                .list();
    }

    public Optional<Part> findPart(String partNum) {
        return jdbc.sql("""
                SELECT p.part_num, p.name, pc.name AS category, p.img_url
                FROM parts p LEFT JOIN part_categories pc ON pc.id = p.part_cat_id
                WHERE p.part_num = :partNum
                """)
                .param("partNum", partNum)
                .query((rs, n) -> new Part(rs.getString("part_num"), rs.getString("name"),
                        rs.getString("category"), rs.getString("img_url")))
                .optional();
    }

    public boolean partExists(String partNum) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM parts WHERE part_num = :p)")
                .param("p", partNum).query(Boolean.class).single();
    }

    public List<Color> listColors() {
        return jdbc.sql("SELECT id, name, rgb, is_trans FROM colors ORDER BY name, id")
                .query((rs, n) -> new Color(rs.getInt("id"), rs.getString("name"),
                        hex(rs.getString("rgb")), rs.getBoolean("is_trans")))
                .list();
    }

    public Map<String, PartRef> partRefs(Collection<String> partNums) {
        Map<String, PartRef> result = new HashMap<>();
        if (partNums.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT part_num, name, img_url FROM parts WHERE part_num IN (:nums)")
                .param("nums", partNums)
                .query((rs, n) -> new PartRef(rs.getString("part_num"), rs.getString("name"), rs.getString("img_url")))
                .list().forEach(ref -> result.put(ref.partNum(), ref));
        return result;
    }

    public Map<Integer, ColorRef> colorRefs(Collection<Integer> ids) {
        Map<Integer, ColorRef> result = new HashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT id, name, rgb FROM colors WHERE id IN (:ids)")
                .param("ids", ids)
                .query((rs, n) -> new ColorRef(rs.getInt("id"), rs.getString("name"), hex(rs.getString("rgb"))))
                .list().forEach(ref -> result.put(ref.id(), ref));
        return result;
    }

    private static String hex(String rgb) {
        return "#" + rgb.trim().toUpperCase();
    }
}
