package com.pilescan.inference;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.json.JsonMapper;

/** Calls {@code POST /v1/recognize} of the inference service (docs/api/inference-contract.md). */
@Component
public class InferenceClient {

    private static final String SUPPORTED_MAJOR = "1.";

    private final RestClient client;
    private final JsonMapper snakeCase = JsonMapper.builder()
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
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

        String raw;
        try {
            raw = client.post().uri("/v1/recognize")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException e) {
            throw new InferenceException("Inference service returned HTTP " + e.getStatusCode().value()
                    + ": " + abbreviate(e.getResponseBodyAsString()), e);
        } catch (RestClientException e) {
            throw new InferenceException("Inference service unavailable: " + e.getMessage(), e);
        }

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

    private static String abbreviate(String text) {
        return text.length() > 300 ? text.substring(0, 300) + "..." : text;
    }
}
