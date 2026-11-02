package com.pilescan.importer;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.postgresql.PGConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Loads the Rebrickable CSV downloads into the catalog tables in one transaction.
 *
 * <p>Each CSV is streamed with PostgreSQL {@code COPY} into a temporary all-text staging table
 * named after the file's header, then upserted with a typed {@code INSERT ... SELECT ... ON CONFLICT}.
 * Staging by header name makes the import tolerant to extra or reordered columns and fails with a
 * clear message when a required column disappears. Nothing is row-by-row, so the 1.5M-row
 * {@code inventory_parts} file loads in seconds. A single transaction means readers keep seeing the
 * previous catalog until the new one is complete, and a failed run leaves the catalog untouched.
 */
@Component
class CatalogImporter {

    private static final Logger log = LoggerFactory.getLogger(CatalogImporter.class);
    private static final Pattern IDENTIFIER = Pattern.compile("[a-z][a-z0-9_]*");

    /** CSV name, required columns, typed upsert from {@code stg_<name>}. */
    private record Table(String name, List<String> required, String upsert) { }

    private static final List<Table> TABLES = List.of(
            new Table("colors", List.of("id", "name", "rgb", "is_trans"), """
                    INSERT INTO colors (id, name, rgb, is_trans)
                    SELECT id::int, name, upper(rgb), is_trans::boolean FROM stg_colors
                    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, rgb = EXCLUDED.rgb,
                                                   is_trans = EXCLUDED.is_trans"""),
            new Table("part_categories", List.of("id", "name"), """
                    INSERT INTO part_categories (id, name)
                    SELECT id::int, name FROM stg_part_categories
                    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name"""),
            new Table("themes", List.of("id", "name", "parent_id"), """
                    INSERT INTO themes (id, name, parent_id)
                    SELECT id::int, name, parent_id::int FROM stg_themes
                    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id"""),
            new Table("parts", List.of("part_num", "name", "part_cat_id", "part_material"), """
                    INSERT INTO parts (part_num, name, part_cat_id, part_material)
                    SELECT part_num, name, part_cat_id::int, part_material FROM stg_parts
                    ON CONFLICT (part_num) DO UPDATE SET name = EXCLUDED.name,
                        part_cat_id = EXCLUDED.part_cat_id, part_material = EXCLUDED.part_material"""),
            new Table("sets", List.of("set_num", "name", "year", "theme_id", "num_parts", "img_url"), """
                    INSERT INTO sets (set_num, name, year, theme_id, num_parts, img_url)
                    SELECT set_num, name, year::int, theme_id::int, num_parts::int, img_url FROM stg_sets
                    ON CONFLICT (set_num) DO UPDATE SET name = EXCLUDED.name, year = EXCLUDED.year,
                        theme_id = EXCLUDED.theme_id, num_parts = EXCLUDED.num_parts, img_url = EXCLUDED.img_url"""),
            new Table("inventories", List.of("id", "version", "set_num"), """
                    INSERT INTO inventories (id, version, set_num)
                    SELECT id::int, version::int, set_num FROM stg_inventories
                    ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, set_num = EXCLUDED.set_num"""),
            // Staging only: inventory_parts is folded into set_part_quantities below.
            new Table("inventory_parts",
                    List.of("inventory_id", "part_num", "color_id", "quantity", "is_spare", "img_url"), null));

    private final DataSource dataSource;
    private final JdbcClient jdbc;
    private final CsvSource csv;
    private final TransactionTemplate tx;

    CatalogImporter(DataSource dataSource, JdbcClient jdbc, CsvSource csv, TransactionTemplate tx) {
        this.dataSource = dataSource;
        this.jdbc = jdbc;
        this.csv = csv;
        this.tx = tx;
    }

    /** Runs the whole import and returns the number of rows loaded per table. */
    Map<String, Long> run() {
        Map<String, Long> counts = tx.execute(status -> {
            try {
                return importAll();
            } catch (IOException | SQLException e) {
                throw new IllegalStateException(e.getMessage(), e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Import interrupted", e);
            }
        });
        // Fresh statistics keep the ranking prefilter on index plans after a bulk load.
        jdbc.sql("ANALYZE set_part_quantities").update();
        jdbc.sql("ANALYZE set_stats").update();
        return counts;
    }

    private Map<String, Long> importAll() throws IOException, SQLException, InterruptedException {
        Connection connection = DataSourceUtils.getConnection(dataSource);
        try {
            Map<String, Long> counts = new LinkedHashMap<>();
            for (Table table : TABLES) {
                long started = System.nanoTime();
                long rows = stage(connection, table);
                if (table.upsert() != null) {
                    jdbc.sql(table.upsert()).update();
                    counts.put(table.name(), rows);
                } else {
                    counts.put("inventory_parts", rows);
                }
                log.info("Imported {} ({} rows, {} ms)", table.name(), rows, (System.nanoTime() - started) / 1_000_000);
            }
            counts.putAll(rebuildDerivedTables());
            return counts;
        } finally {
            DataSourceUtils.releaseConnection(connection, dataSource);
        }
    }

    private long stage(Connection connection, Table table) throws IOException, SQLException, InterruptedException {
        String staging = "stg_" + table.name();
        try (InputStream raw = csv.open(table.name());
             BufferedInputStream in = new BufferedInputStream(raw, 1 << 16)) {
            List<String> header = Arrays.asList(readHeader(in).split(","));
            for (String column : header) {
                if (!IDENTIFIER.matcher(column).matches()) {
                    throw new IllegalStateException(table.name() + ".csv.gz has an unexpected header column '" + column + "'");
                }
            }
            for (String required : table.required()) {
                if (!header.contains(required)) {
                    throw new IllegalStateException(
                            table.name() + ".csv.gz is missing column '" + required + "' (layout changed?)");
                }
            }
            String columns = String.join(", ", header);
            try (Statement st = connection.createStatement()) {
                st.execute("CREATE TEMP TABLE " + staging + " ("
                        + String.join(" text, ", header) + " text) ON COMMIT DROP");
            }
            return connection.unwrap(PGConnection.class).getCopyAPI()
                    .copyIn("COPY " + staging + " (" + columns + ") FROM STDIN WITH (FORMAT csv)", in);
        }
    }

    private static String readHeader(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1 && b != '\n') {
            line.write(b);
        }
        return line.toString(StandardCharsets.UTF_8).strip();
    }

    /** Latest inventory version per set, spare parts excluded, plus per-set totals and part images. */
    private Map<String, Long> rebuildDerivedTables() {
        jdbc.sql("DELETE FROM set_part_quantities").update();
        int quantities = jdbc.sql("""
                INSERT INTO set_part_quantities (part_num, color_id, set_num, quantity, img_url)
                SELECT ip.part_num, ip.color_id::int, latest.set_num, SUM(ip.quantity::int), MAX(ip.img_url)
                FROM stg_inventory_parts ip
                JOIN (SELECT DISTINCT ON (set_num) id, set_num
                      FROM inventories ORDER BY set_num, version DESC) latest
                  ON latest.id = ip.inventory_id::int
                WHERE NOT ip.is_spare::boolean
                GROUP BY ip.part_num, ip.color_id::int, latest.set_num
                HAVING SUM(ip.quantity::int) > 0
                """).update();

        jdbc.sql("DELETE FROM set_stats").update();
        int stats = jdbc.sql("""
                INSERT INTO set_stats (set_num, total_pieces)
                SELECT set_num, SUM(quantity) FROM set_part_quantities GROUP BY set_num
                """).update();

        // parts.csv carries no image; borrow the one from the color the part appears in most.
        jdbc.sql("""
                UPDATE parts p SET img_url = best.img_url
                FROM (SELECT DISTINCT ON (part_num) part_num, img_url
                      FROM set_part_quantities WHERE img_url IS NOT NULL
                      ORDER BY part_num, quantity DESC) best
                WHERE p.part_num = best.part_num
                """).update();
        return Map.of("set_part_quantities", (long) quantities, "set_stats", (long) stats);
    }
}
