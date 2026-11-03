package com.pilescan.inference;

import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.json.JsonMapper;

/** Calls {@code POST /v1/recognize} of the inference service (docs/api/inference-contract.md). */
@Component
public class InferenceClient {

    private static final Logger log = LoggerFactory.getLogger(InferenceClient.class);
    private static final String SUPPORTED_MAJOR = "1.";
    private static final int MAX_ATTEMPTS = 2;
    private static final Duration RETRY_DELAY = Duration.ofSeconds(1);

    private final RestClient client;
    private final JsonMapper snakeCase = JsonMapper.builder()
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    InferenceClient(InferenceProperties props) {
        // HTTP/1.1 only: the JDK client would otherwise try an h2c upgrade, which uvicorn does not support.
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(Duration.ofSeconds(10)).build());
        factory.setReadTimeout(props.timeout());
        this.client = RestClient.builder().baseUrl(props.url()).requestFactory(factory).build();
    }

    /**
     * @param image       orientation-corrected image bytes, so bounding boxes match the stored image
     * @param contentType MIME type of {@code image}
     * @throws InferenceException on timeouts, HTTP errors and contract violations
     */
    public RecognizeResponse recognize(byte[] image, String contentType) {
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.parseMediaType(contentType));
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("image", new HttpEntity<>(new ByteArrayResource(image) {
            @Override
            public String getFilename() {
                return "scan";
            }
        }, partHeaders));

        String raw = post(body);

        RecognizeResponse response;
        try {
            response = snakeCase.readValue(raw, RecognizeResponse.class);
        } catch (RuntimeException e) {
            throw new InferenceException("Inference service returned an unreadable response", e);
        }
        if (response.contractVersion() == null || !response.contractVersion().startsWith(SUPPORTED_MAJOR)
                || response.image() == null || response.detections() == null) {
            throw new InferenceException("Inference service speaks an unsupported contract version: "
                    + response.contractVersion());
        }
        return response;
    }

    /**
     * Recognition is idempotent, so a transport failure (stale keep-alive connection or old container
     * address after the inference service was redeployed) is retried once on a fresh connection.
     * A read timeout is not retried: the service accepted the request and is just slow.
     */
    private String post(MultiValueMap<String, Object> body) {
        for (int attempt = 1; ; attempt++) {
            try {
                return client.post().uri("/v1/recognize?debug=true")
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(body)
                        .retrieve()
                        .body(String.class);
            } catch (RestClientResponseException e) {
                throw new InferenceException("Inference service returned HTTP " + e.getStatusCode().value()
                        + ": " + abbreviate(e.getResponseBodyAsString()), e);
            } catch (ResourceAccessException e) {
                if (attempt >= MAX_ATTEMPTS || isReadTimeout(e)) {
                    throw new InferenceException("Inference service unavailable: " + describe(e), e);
                }
                log.warn("Inference request failed ({}), retrying on a fresh connection", describe(e));
                pause(RETRY_DELAY);
            } catch (RestClientException e) {
                throw new InferenceException("Inference service unavailable: " + describe(e), e);
            }
        }
    }

    /** The JDK client often reports a null message; the root cause class (e.g. UnknownHostException) says why. */
    private static String describe(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage() != null ? root.getMessage() : e.getMessage();
        return root.getClass().getSimpleName() + (message == null ? "" : ": " + message);
    }

    private static boolean isReadTimeout(ResourceAccessException e) {
        return e.getCause() instanceof HttpTimeoutException && !(e.getCause() instanceof HttpConnectTimeoutException);
    }

    private static void pause(Duration duration) {
        try {
            Thread.sleep(duration);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private static String abbreviate(String text) {
        return text.length() > 300 ? text.substring(0, 300) + "..." : text;
    }
}
