package com.pilescan.inference;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param url     base URL of the inference service
 * @param timeout read timeout of {@code POST /v1/recognize}; generous because the classifier calls an
 *                external service per crop
 */
@ConfigurationProperties("pilescan.inference")
public record InferenceProperties(String url, Duration timeout) {
}
