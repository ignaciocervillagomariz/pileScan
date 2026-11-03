package com.pilescan.detection;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.pilescan.AbstractIntegrationTest;
import com.pilescan.TestImages;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

class DetectionCorrectionIT extends AbstractIntegrationTest {

    private static final String ONE_DETECTION = """
            {"contract_version":"1.0.0","image":{"width":30,"height":30},
             "detections":[{"index":0,"bbox":{"x":1,"y":2,"width":3,"height":4},"detection_score":0.5,
               "part_candidates":[{"part_id":"3001","id_system":"bricklink","name":"Brick 2 x 4","score":0.5}],
               "color_candidates":[{"rebrickable_color_id":4,"name":"Red","score":0.5}],
               "measured_rgb":{"r":1,"g":2,"b":3}}],
             "pipeline":{"detector":"d","part_classifier":"p","color_estimator":"c"},
             "timings_ms":{"detect":1,"classify":1,"color":1,"total":3},"warnings":[],"debug_image":null}""";

    private String scanId;
    private String detectionId;

    @BeforeEach
    void createScan() throws Exception {
        loadCatalog();
        WIREMOCK.stubFor(post(urlPathEqualTo("/v1/recognize")).willReturn(aResponse()
                .withHeader("Content-Type", "application/json").withBody(ONE_DETECTION)));
        String body = mvc.perform(multipart("/api/scans")
                        .file(new MockMultipartFile("image", "a.png", "image/png", TestImages.png(30, 30))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        scanId = JsonPath.read(body, "$.id");
        detectionId = JsonPath.read(body, "$.detections[0].id");
    }

    @Test
    void patchChangesOnlyProvidedFieldsAndMarksCorrected() throws Exception {
        mvc.perform(patch("/api/scans/{s}/detections/{d}", scanId, detectionId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"partNum\":\"3002\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.part.partNum").value("3002"))
                .andExpect(jsonPath("$.part.name").value("Brick 2 x 3"))
                .andExpect(jsonPath("$.color.id").value(4))
                .andExpect(jsonPath("$.corrected").value(true))
                .andExpect(jsonPath("$.confidence").value(1.0))
                .andExpect(jsonPath("$.mappingStatus").value("MAPPED"));

        mvc.perform(patch("/api/scans/{s}/detections/{d}", scanId, detectionId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"colorId\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.part.partNum").value("3002"))
                .andExpect(jsonPath("$.color.name").value("Blue"));
    }

    @Test
    void patchValidatesInput() throws Exception {
        mvc.perform(patch("/api/scans/{s}/detections/{d}", scanId, detectionId)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/scans/{s}/detections/{d}", scanId, detectionId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"partNum\":\"nope\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        mvc.perform(patch("/api/scans/{s}/detections/{d}", scanId, detectionId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"colorId\":99999}"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(patch("/api/scans/{s}/detections/{d}", scanId, "11111111-1111-1111-1111-111111111111")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"colorId\":1}"))
                .andExpect(status().isNotFound());
        mvc.perform(patch("/api/scans/{s}/detections/{d}", scanId, detectionId)
                        .contentType(MediaType.APPLICATION_JSON).content("not json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deleteIsSoftAndHidesTheDetectionEverywhere() throws Exception {
        mvc.perform(delete("/api/scans/{s}/detections/{d}", scanId, detectionId)).andExpect(status().isNoContent());

        mvc.perform(get("/api/scans/{s}/detections", scanId)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/scans/{s}", scanId))
                .andExpect(jsonPath("$.detections.length()").value(0))
                .andExpect(jsonPath("$.summary.totalPieces").value(0));
        mvc.perform(delete("/api/scans/{s}/detections/{d}", scanId, detectionId)).andExpect(status().isNotFound());
        mvc.perform(patch("/api/scans/{s}/detections/{d}", scanId, detectionId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"colorId\":1}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/scans/{s}/set-candidates", scanId))
                .andExpect(jsonPath("$.pilePieces").value(0))
                .andExpect(jsonPath("$.candidates.length()").value(0));
    }

    @Test
    void addsManualDetectionWithAndWithoutBox() throws Exception {
        mvc.perform(post("/api/scans/{s}/detections", scanId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partNum\":\"3005\",\"colorId\":0,\"bbox\":{\"x\":5,\"y\":6,\"width\":7,\"height\":8}}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.source").value("MANUAL"))
                .andExpect(jsonPath("$.confidence").value(1.0))
                .andExpect(jsonPath("$.bbox.height").value(8))
                .andExpect(jsonPath("$.part.name").value("Brick 1 x 1"))
                .andExpect(jsonPath("$.partCandidates.length()").value(0));
        mvc.perform(post("/api/scans/{s}/detections", scanId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partNum\":\"3005\",\"colorId\":0}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.bbox").value(nullValue()));

        mvc.perform(get("/api/scans/{s}", scanId)).andExpect(jsonPath("$.summary.totalPieces").value(3));
    }

    @Test
    void addValidatesInput() throws Exception {
        mvc.perform(post("/api/scans/{s}/detections", scanId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"colorId\":1}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/scans/{s}/detections", scanId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partNum\":\"3005\",\"colorId\":1,\"bbox\":{\"x\":-1,\"y\":0,\"width\":0,\"height\":1}}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/scans/{s}/detections", scanId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partNum\":\"nope\",\"colorId\":1}")).andExpect(status().isUnprocessableContent());
        mvc.perform(post("/api/scans/{s}/detections", "11111111-1111-1111-1111-111111111111")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"partNum\":\"3005\",\"colorId\":1}"))
                .andExpect(status().isNotFound());
    }
}
