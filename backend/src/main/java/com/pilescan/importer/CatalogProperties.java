package com.pilescan.importer;

import java.nio.file.Path;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Catalog import configuration.
 *
 * @param importOnStartup start an import at boot when the catalog is missing or stale
 * @param baseUrl         directory URL holding {@code <table>.csv.gz}; {@code file:} URLs are
 *                        supported so a small fixture catalog can be used offline
 * @param cacheDir        where downloaded files are cached (ETag revalidated)
 * @param maxAge          a successful import older than this counts as stale
 */
@ConfigurationProperties("pilescan.catalog")
public record CatalogProperties(boolean importOnStartup, String baseUrl, Path cacheDir, Duration maxAge) {
}
