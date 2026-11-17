package com.pilescan.scan;

import static com.github.tomakehurst.wiremock.client.WireMock.aMultipart;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.pilescan.AbstractIntegrationTest;
import com.pilescan.ScanTestSupport;
import com.pilescan.TestImages;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

class ScanFlowIT extends AbstractIntegrationTest {

    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.jdbc.core.simple.JdbcClient jdbc;

    @BeforeEach
    void catalog() {
        loadCatalog();
        jdbc.sql("DELETE FROM unmapped_part_ids").update();
    }

    private void stubInference(int width, int height) {
        WIREMOCK.stubFor(post(urlPathEqualTo("/v1/recognize")).willReturn(aResponse()
                .withHeader("Content-Type", "application/json")
                .withBody(ScanTestSupport.recognizeResponse(width, height))));
    }

    private void stubRebrickable() {
        WIREMOCK.stubFor(com.github.tomakehurst.wiremock.client.WireMock.get(urlPathEqualTo("/api/v3/lego/parts/"))
                .withQueryParam("bricklink_id", equalTo("3626b"))
                .withHeader("Authorization", equalTo("key test-key"))
                .willReturn(aResponse().withHeader("Content-Type", "application/json")
                        .withBody("{\"count\":1,\"results\":[{\"part_num\":\"3626cpb0001\",\"name\":\"x\"}]}")));
        WIREMOCK.stubFor(com.github.tomakehurst.wiremock.client.WireMock.get(urlPathEqualTo("/api/v3/lego/parts/"))
                .withQueryParam("bricklink_id", equalTo("zz-unknown"))
                .willReturn(aResponse().withHeader("Content-Type", "application/json")
                        .withBody("{\"count\":0,\"results\":[]}")));
    }

    private MockMultipartFile image(String name, byte[] bytes, String type) {
        return new MockMultipartFile("image", name, type, bytes);
    }

    @Test
    void createsScanMapsPartsAndPersistsDetections() throws Exception {
        stubInference(40, 20);
        stubRebrickable();

        MvcResult created = mvc.perform(multipart("/api/scans").file(image("a.jpg", TestImages.jpeg(40, 20), "image/jpeg")))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/scans/[0-9a-f-]{36}")))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.errorMessage").value(nullValue()))
                .andExpect(jsonPath("$.pipeline").value("opencv-lab-v1/stub-v1/kmeans-lab-ciede2000-v1"))
                .andExpect(jsonPath("$.image.width").value(40))
                .andExpect(jsonPath("$.image.height").value(20))
                .andExpect(jsonPath("$.createdAt", matchesPattern(".*(Z|[+-]\\d\\d:\\d\\d)$")))
                .andExpect(jsonPath("$.detections.length()").value(4))
                // 0: direct mapping, top candidate and top color, confidence = 0.9 * 0.8 * 0.7
                .andExpect(jsonPath("$.detections[0].part.partNum").value("3001"))
                .andExpect(jsonPath("$.detections[0].part.name").value("Brick 2 x 4"))
                .andExpect(jsonPath("$.detections[0].color.rgb").value("#C91A09"))
                .andExpect(jsonPath("$.detections[0].confidence").value(0.504))
                .andExpect(jsonPath("$.detections[0].mappingStatus").value("MAPPED"))
                .andExpect(jsonPath("$.detections[0].source").value("DETECTED"))
                .andExpect(jsonPath("$.detections[0].corrected").value(false))
                .andExpect(jsonPath("$.detections[0].bbox.width").value(30))
                .andExpect(jsonPath("$.detections[0].measuredRgb").value("#C4201B"))
                .andExpect(jsonPath("$.detections[0].partCandidates.length()").value(2))
                .andExpect(jsonPath("$.detections[0].colorCandidates[1].color.name").value("Blue"))
                // 1: mapped through the Rebrickable API
                .andExpect(jsonPath("$.detections[1].part.partNum").value("3626cpb0001"))
                .andExpect(jsonPath("$.detections[1].partCandidates[0].rawPartId").value("3626b"))
                .andExpect(jsonPath("$.detections[1].partCandidates[0].partNum").value("3626cpb0001"))
                // 2: unmappable id; 3: no candidates
                .andExpect(jsonPath("$.detections[2].part").value(nullValue()))
                .andExpect(jsonPath("$.detections[2].mappingStatus").value("UNMAPPED"))
                .andExpect(jsonPath("$.detections[2].partCandidates[0].partNum").value(nullValue()))
                .andExpect(jsonPath("$.detections[3].mappingStatus").value("NONE"))
                .andExpect(jsonPath("$.detections[0].classificationStatus").value("OK"))
                .andExpect(jsonPath("$.detections[1].classificationStatus").value(nullValue()))
                .andExpect(jsonPath("$.detections[3].classificationStatus").value("NO_MATCH"))
                .andExpect(jsonPath("$.inferenceTimingsMs.preprocess").value(2.0))
                .andExpect(jsonPath("$.inferenceTimingsMs.total").value(3.0))
                .andExpect(jsonPath("$.debugImageUrl").value(nullValue()))
                .andExpect(jsonPath("$.summary.totalPieces").value(4))
                .andExpect(jsonPath("$.summary.distinctParts").value(2))
                .andExpect(jsonPath("$.summary.unidentifiedPieces").value(2))
                .andExpect(jsonPath("$.warnings", hasItem("classifier degraded")))
                .andReturn();

        String id = com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id");
        WIREMOCK.verify(postRequestedFor(urlPathEqualTo("/v1/recognize"))
                .withRequestBodyPart(aMultipart().withName("image").build()));

        // Candidates must be stored as real JSON arrays, not as JSON-encoded strings.
        assertThat(jdbc.sql("SELECT DISTINCT jsonb_typeof(part_candidates) FROM detections WHERE scan_id = :id")
                .param("id", java.util.UUID.fromString(id)).query(String.class).list()).containsExactly("array");

        mvc.perform(get("/api/scans/{id}", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.detections.length()").value(4))
                .andExpect(jsonPath("$.summary.groups[0].count").value(2));
        mvc.perform(get("/api/scans/{id}/detections", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4));
        mvc.perform(get("/api/scans/{id}/image", id)).andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG));

        mvc.perform(get("/api/admin/unmapped-part-ids")).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.rawPartId=='zz-unknown')].idSystem", contains("bricklink")))
                .andExpect(jsonPath("$[?(@.rawPartId=='zz-unknown')].occurrences", contains(1)));
    }

    @Test
    void requestsDebugOverlayAndServesItWhenInferenceReturnsOne() throws Exception {
        byte[] overlay = TestImages.jpeg(40, 20);
        WIREMOCK.stubFor(post(urlPathEqualTo("/v1/recognize")).willReturn(aResponse()
                .withHeader("Content-Type", "application/json")
                .withBody(ScanTestSupport.recognizeResponse(40, 20).replace("\"debug_image\": null",
                        "\"debug_image\": \"" + java.util.Base64.getEncoder().encodeToString(overlay) + "\""))));
        stubRebrickable();

        MvcResult created = mvc.perform(multipart("/api/scans").file(image("a.jpg", TestImages.jpeg(40, 20), "image/jpeg")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.debugImageUrl", matchesPattern("/api/scans/[0-9a-f-]{36}/debug-image")))
                .andReturn();
        String id = com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id");

        WIREMOCK.verify(postRequestedFor(urlPathEqualTo("/v1/recognize")).withQueryParam("debug", equalTo("true")));
        MvcResult served = mvc.perform(get("/api/scans/{id}/debug-image", id)).andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG)).andReturn();
        assertThat(served.getResponse().getContentAsByteArray()).isEqualTo(overlay);
    }

    @Test
    void debugImageIs404WhenInferenceReturnedNone() throws Exception {
        stubInference(40, 20);
        stubRebrickable();
        MvcResult created = mvc.perform(multipart("/api/scans").file(image("a.jpg", TestImages.jpeg(40, 20), "image/jpeg")))
                .andExpect(status().isCreated()).andReturn();
        String id = com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id");
        mvc.perform(get("/api/scans/{id}/debug-image", id)).andExpect(status().isNotFound());
    }

    /** Regression for the 403 on http://127.0.0.1:4200: the API must not depend on the browser origin. */
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {
            "http://127.0.0.1:4200", "http://localhost:4200", "http://192.0.2.50:4200",
            "https://my-host.tail1234.ts.net", "https://random.trycloudflare.com"})
    void acceptsPostsWhateverTheBrowserOrigin(String origin) throws Exception {
        stubInference(40, 20);
        stubRebrickable();
        mvc.perform(multipart("/api/scans").file(image("a.jpg", TestImages.jpeg(40, 20), "image/jpeg"))
                        .header("Origin", origin).header("Host", "127.0.0.1"))
                .andExpect(status().isCreated());
    }

    @Test
    void acceptsPostsThroughProxyWithForwardedHeaders() throws Exception {
        stubInference(40, 20);
        stubRebrickable();
        mvc.perform(multipart("/api/scans").file(image("a.jpg", TestImages.jpeg(40, 20), "image/jpeg"))
                        .header("Origin", "https://my-host.tail1234.ts.net")
                        .header("Host", "my-host.tail1234.ts.net")
                        .header("X-Forwarded-Proto", "https").header("X-Forwarded-Host", "my-host.tail1234.ts.net")
                        .header("X-Forwarded-Port", "443"))
                .andExpect(status().isCreated());
    }

    @Test
    void exifRotatedPhotoIsStoredUprightAndSentUprightToInference() throws Exception {
        stubInference(20, 40);
        stubRebrickable();

        MvcResult result = mvc.perform(multipart("/api/scans")
                        .file(image("rotated.jpg", TestImages.jpegWithOrientation(40, 20, 6), "image/jpeg")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.image.width").value(20))
                .andExpect(jsonPath("$.image.height").value(40))
                .andReturn();

        String id = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id");
        byte[] stored = mvc.perform(get("/api/scans/{id}/image", id)).andReturn().getResponse().getContentAsByteArray();
        BufferedImage storedImage = ImageIO.read(new ByteArrayInputStream(stored));
        assertThat(storedImage.getWidth()).isEqualTo(20);
        assertThat(storedImage.getHeight()).isEqualTo(40);

        var sent = WIREMOCK.findAll(postRequestedFor(urlPathEqualTo("/v1/recognize"))).getFirst()
                .getPart("image").getBody().asBytes();
        BufferedImage sentImage = ImageIO.read(new ByteArrayInputStream(sent));
        assertThat(sentImage.getWidth()).isEqualTo(20);
        assertThat(sentImage.getHeight()).isEqualTo(40);
    }

    @Test
    void inferenceFailureYieldsFailedScanWithStatus201() throws Exception {
        WIREMOCK.stubFor(post(urlPathEqualTo("/v1/recognize")).willReturn(aResponse().withStatus(503)
                .withHeader("Content-Type", "application/json").withBody("{\"detail\":\"detector down\"}")));

        mvc.perform(multipart("/api/scans").file(image("a.png", TestImages.png(30, 30), "image/png")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.errorMessage", org.hamcrest.Matchers.containsString("503")))
                .andExpect(jsonPath("$.detections.length()").value(0))
                .andExpect(jsonPath("$.summary.totalPieces").value(0))
                .andExpect(jsonPath("$.image.width").value(30));
    }

    @Test
    void unreachableInferenceAlsoYieldsFailedScan() throws Exception {
        WIREMOCK.stubFor(post(urlPathEqualTo("/v1/recognize")).willReturn(
                aResponse().withFault(com.github.tomakehurst.wiremock.http.Fault.CONNECTION_RESET_BY_PEER)));

        mvc.perform(multipart("/api/scans").file(image("a.png", TestImages.png(30, 30), "image/png")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("FAILED"));
    }

    @Test
    void transientConnectionFailureIsRetriedOnce() throws Exception {
        WIREMOCK.stubFor(post(urlPathEqualTo("/v1/recognize")).inScenario("flaky").whenScenarioStateIs("Started")
                .willReturn(aResponse().withFault(com.github.tomakehurst.wiremock.http.Fault.CONNECTION_RESET_BY_PEER))
                .willSetStateTo("recovered"));
        WIREMOCK.stubFor(post(urlPathEqualTo("/v1/recognize")).inScenario("flaky").whenScenarioStateIs("recovered")
                .willReturn(aResponse().withHeader("Content-Type", "application/json")
                        .withBody(ScanTestSupport.recognizeResponse(30, 30))));
        stubRebrickable();

        mvc.perform(multipart("/api/scans").file(image("a.png", TestImages.png(30, 30), "image/png")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void rejectsInvalidUploads() throws Exception {
        mvc.perform(multipart("/api/scans").file(image("a.txt", "not an image".getBytes(), "text/plain")))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400));
        mvc.perform(multipart("/api/scans").file(image("a.jpg", new byte[0], "image/jpeg")))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/scans")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/scans/{id}", "11111111-1111-1111-1111-111111111111"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/scans/{id}", "not-a-uuid")).andExpect(status().isBadRequest());
    }

    @Test
    void rejectsOversizedUploadWith413() throws Exception {
        byte[] huge = new byte[16 * 1024 * 1024];
        huge[0] = (byte) 0xFF;
        huge[1] = (byte) 0xD8;
        mvc.perform(multipart("/api/scans").file(image("huge.jpg", huge, "image/jpeg")))
                .andExpect(status().isContentTooLarge())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
    }
}
