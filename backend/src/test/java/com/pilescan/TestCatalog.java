package com.pilescan;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.GZIPOutputStream;

/** Gzips the plain-text fixture CSVs from {@code src/test/resources/catalog} into a temp directory. */
public final class TestCatalog {

    private static final List<String> TABLES = List.of(
            "colors", "part_categories", "themes", "parts", "sets", "inventories", "inventory_parts");

    private TestCatalog() {
    }

    public static URI prepare() {
        try {
            Path dir = Files.createTempDirectory("pilescan-catalog");
            for (String table : TABLES) {
                try (InputStream in = TestCatalog.class.getResourceAsStream("/catalog/" + table + ".csv");
                     OutputStream out = new GZIPOutputStream(Files.newOutputStream(dir.resolve(table + ".csv.gz")))) {
                    in.transferTo(out);
                }
            }
            return dir.toUri();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
