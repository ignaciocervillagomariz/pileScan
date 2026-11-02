package com.pilescan.ranking;

import com.pilescan.detection.PileEntry;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** SQL side of ranking: shortlist candidate sets and load inventories and summaries on demand. */
@Repository
class CandidateSetRepository {

    /** One part+color line of a set's inventory, with the color-specific part image. */
    record InventoryLine(String partNum, int colorId, int quantity, String imageUrl) { }

    private final JdbcClient jdbc;

    CandidateSetRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Sets that share at least one part+color with the pile, best {@code limit} first by
     * {@code 2*matched / (pilePieces + setPieces)}. That ordering is the Sørensen-Dice coefficient,
     * which equals the F1 of pile coverage and set completeness, so the shortlist already contains
     * the exact top sets of the coverage strategy. The join starts from the pile and uses the
     * (part_num, color_id, set_num) primary key of {@code set_part_quantities}.
     */
    List<CandidateSet> shortlist(List<PileEntry> pile, int pilePieces, int limit) {
        String[] parts = pile.stream().map(PileEntry::partNum).toArray(String[]::new);
        Integer[] colors = pile.stream().map(PileEntry::colorId).toArray(Integer[]::new);
        Integer[] quantities = pile.stream().map(PileEntry::quantity).toArray(Integer[]::new);
        return jdbc.sql("""
                WITH pile AS (
                    SELECT * FROM unnest(CAST(:parts AS text[]), CAST(:colors AS int[]), CAST(:quantities AS int[]))
                        AS t(part_num, color_id, qty)
                ), matched AS (
                    SELECT s.set_num, SUM(LEAST(p.qty, s.quantity)) AS matched
                    FROM pile p
                    JOIN set_part_quantities s ON s.part_num = p.part_num AND s.color_id = p.color_id
                    GROUP BY s.set_num
                )
                SELECT m.set_num, se.year, st.total_pieces, m.matched
                FROM matched m
                JOIN set_stats st ON st.set_num = m.set_num
                JOIN sets se ON se.set_num = m.set_num
                WHERE st.total_pieces > 0
                ORDER BY 2.0 * m.matched / (:pilePieces + st.total_pieces) DESC, m.matched DESC, m.set_num
                LIMIT :limit
                """)
                .param("parts", parts).param("colors", colors).param("quantities", quantities)
                .param("pilePieces", pilePieces).param("limit", limit)
                .query((rs, n) -> new CandidateSet(rs.getString("set_num"), rs.getInt("year"),
                        rs.getInt("total_pieces"), rs.getInt("matched")))
                .list();
    }

    Map<String, SetSummary> summaries(Collection<String> setNums) {
        Map<String, SetSummary> result = new HashMap<>();
        if (setNums.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT se.set_num, se.name, se.year, th.name AS theme, st.total_pieces, se.img_url
                FROM sets se
                JOIN set_stats st ON st.set_num = se.set_num
                LEFT JOIN themes th ON th.id = se.theme_id
                WHERE se.set_num IN (:nums)
                """)
                .param("nums", setNums)
                .query((rs, n) -> new SetSummary(rs.getString("set_num"), rs.getString("name"), rs.getInt("year"),
                        rs.getString("theme"), rs.getInt("total_pieces"), rs.getString("img_url")))
                .list().forEach(s -> result.put(s.setNum(), s));
        return result;
    }

    List<InventoryLine> inventory(String setNum) {
        return jdbc.sql("SELECT part_num, color_id, quantity, img_url FROM set_part_quantities WHERE set_num = :set")
                .param("set", setNum)
                .query((rs, n) -> new InventoryLine(rs.getString("part_num"), rs.getInt("color_id"),
                        rs.getInt("quantity"), rs.getString("img_url")))
                .list();
    }
}
