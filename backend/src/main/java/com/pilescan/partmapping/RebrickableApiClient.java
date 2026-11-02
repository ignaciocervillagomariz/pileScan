package com.pilescan.partmapping;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Minimal client for {@code GET /api/v3/lego/parts/?bricklink_id=...} (or {@code ldraw_id}),
 * authenticated with {@code Authorization: key <KEY>}. Calls are serialized and spaced by
 * {@code minInterval}; a 429 is retried once after the delay the API asks for.
 */
@Component
class RebrickableApiClient implements RebrickablePartLookup {

    private static final Logger log = LoggerFactory.getLogger(RebrickableApiClient.class);
    private static final Duration MAX_THROTTLE_WAIT = Duration.ofSeconds(30);

    private final RebrickableProperties props;
    private final JsonMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private long lastCallNanos = 0;
    private boolean hasCalled = false;

    RebrickableApiClient(RebrickableProperties props, JsonMapper json) {
        this.props = props;
        this.json = json;
    }

    @Override
    public boolean isConfigured() {
        return props.hasKey();
    }

    @Override
    public synchronized List<String> findPartNums(String idSystem, String rawId) throws LookupException {
        String param = switch (idSystem) {
            case "bricklink" -> "bricklink_id";
            case "ldraw" -> "ldraw_id";
            default -> throw new LookupException("ID system '" + idSystem + "' is not searchable");
        };
        URI uri = URI.create(props.apiUrl() + "/api/v3/lego/parts/?" + param + "="
                + URLEncoder.encode(rawId, StandardCharsets.UTF_8) + "&page_size=5");
        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("Authorization", "key " + props.apiKey())
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(20)).GET().build();
        try {
            HttpResponse<String> response = send(request);
            if (response.statusCode() == 429) {
                Duration wait = retryAfter(response);
                if (wait.compareTo(MAX_THROTTLE_WAIT) > 0) {
                    throw new LookupException("Rebrickable throttled the request for " + wait.toSeconds() + "s");
                }
                log.warn("Rebrickable throttled, retrying in {}s", wait.toSeconds());
                Thread.sleep(wait.toMillis());
                response = send(request);
            }
            return parse(response);
        } catch (IOException e) {
            throw new LookupException("Rebrickable request failed: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LookupException("Interrupted while calling Rebrickable", e);
        }
    }

    private HttpResponse<String> send(HttpRequest request) throws IOException, InterruptedException {
        long waitMs = hasCalled
                ? props.minInterval().toMillis() - (System.nanoTime() - lastCallNanos) / 1_000_000 : 0;
        if (waitMs > 0) {
            Thread.sleep(waitMs);
        }
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofString());
        } finally {
            lastCallNanos = System.nanoTime();
            hasCalled = true;
        }
    }

    private List<String> parse(HttpResponse<String> response) throws LookupException {
        int status = response.statusCode();
        if (status == 401 || status == 403) {
            throw new LookupException("Rebrickable rejected the API key (HTTP " + status + ")");
        }
        if (status != 200) {
            throw new LookupException("Rebrickable returned HTTP " + status);
        }
        List<String> partNums = new ArrayList<>();
        JsonNode results = json.readTree(response.body()).path("results");
        results.forEach(node -> partNums.add(node.path("part_num").asString()));
        return partNums;
    }

    private static Duration retryAfter(HttpResponse<?> response) {
        return response.headers().firstValue("Retry-After")
                .map(value -> {
                    try {
                        return Duration.ofSeconds(Long.parseLong(value.strip()));
                    } catch (NumberFormatException e) {
                        return Duration.ofSeconds(2);
                    }
                })
                .orElse(Duration.ofSeconds(2));
    }
}
