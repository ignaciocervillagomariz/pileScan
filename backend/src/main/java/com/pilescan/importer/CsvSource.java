package com.pilescan.importer;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.zip.GZIPInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Opens the gzipped Rebrickable CSV of a table, downloading it into a revalidated local cache. */
@Component
class CsvSource {

    private static final Logger log = LoggerFactory.getLogger(CsvSource.class);

    private final CatalogProperties props;
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(20))
            .build();

    CsvSource(CatalogProperties props) {
        this.props = props;
    }

    /** Returns the decompressed CSV stream of {@code <name>.csv.gz}. */
    InputStream open(String name) throws IOException, InterruptedException {
        String file = name + ".csv.gz";
        String base = props.baseUrl().endsWith("/") ? props.baseUrl() : props.baseUrl() + "/";
        URI uri = URI.create(base + file);
        Path local = "file".equals(uri.getScheme()) ? Path.of(uri) : download(uri, file);
        return new GZIPInputStream(Files.newInputStream(local), 1 << 16);
    }

    private Path download(URI uri, String file) throws IOException, InterruptedException {
        Files.createDirectories(props.cacheDir());
        Path cached = props.cacheDir().resolve(file);
        Path validator = props.cacheDir().resolve(file + ".validator");

        HttpRequest.Builder request = HttpRequest.newBuilder(uri).GET().timeout(Duration.ofMinutes(10));
        if (Files.exists(cached) && Files.exists(validator)) {
            String[] saved = Files.readString(validator).split("\n", 2);
            request.header(saved[0], saved[1].strip());
        }
        HttpResponse<InputStream> response = http.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
        try (InputStream body = response.body()) {
            if (response.statusCode() == 304) {
                log.info("{} unchanged, using cache", file);
                return cached;
            }
            if (response.statusCode() != 200) {
                throw new IOException("GET " + uri + " returned HTTP " + response.statusCode());
            }
            Path tmp = props.cacheDir().resolve(file + ".part");
            Files.copy(body, tmp, StandardCopyOption.REPLACE_EXISTING);
            Files.move(tmp, cached, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        }
        saveValidator(validator, response);
        log.info("Downloaded {}", file);
        return cached;
    }

    private static void saveValidator(Path validator, HttpResponse<?> response) throws IOException {
        String etag = response.headers().firstValue("ETag").orElse(null);
        String modified = response.headers().firstValue("Last-Modified").orElse(null);
        if (etag != null) {
            Files.writeString(validator, "If-None-Match\n" + etag, StandardCharsets.UTF_8);
        } else if (modified != null) {
            Files.writeString(validator, "If-Modified-Since\n" + modified, StandardCharsets.UTF_8);
        } else {
            Files.deleteIfExists(validator);
        }
    }
}
