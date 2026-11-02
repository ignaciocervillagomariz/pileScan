package com.pilescan.partmapping;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param apiUrl      API host, overridable for tests
 * @param apiKey      empty disables API lookups (IDs not in the catalog are then reported as unmapped)
 * @param minInterval minimum delay between two API calls; Rebrickable allows about 1 request/second
 */
@ConfigurationProperties("pilescan.rebrickable")
public record RebrickableProperties(String apiUrl, String apiKey, Duration minInterval) {

    boolean hasKey() {
        return apiKey != null && !apiKey.isBlank();
    }
}
