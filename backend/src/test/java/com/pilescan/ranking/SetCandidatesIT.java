package com.pilescan.ranking;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.hasToString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
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

/**
 * Fixture sets: 100-1 = 3001/Red x2, 3002/Red x2, 3003/Blue x4 (8 pieces);
 * 200-1 = 3001/Blue x4, 3002/Red x1, 3004/Blue x2 (7); 300-1 = 3001/Red x4, 3002/Red x2, 3003/Blue x4,
 * 3004/Blue x2, 3005/Black x10 (22).
 */
class SetCandidatesIT extends AbstractIntegrationTest {

    private String scanId;

    @BeforeEach
    void createEmptyFailedScan() throws Exception {
        loadCatalog();
        WIREMOCK.stubFor(post(urlEqualTo("/v1/recognize")).willReturn(aResponse().withStatus(503)));
        String body = mvc.perform(multipart("/api/scans")
                        .file(new MockMultipartFile("image", "a.png", "image/png", TestImages.png(30, 30))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        scanId = JsonPath.read(body, "$.id");
    }

    private void addPieces(String part, int color, int times) throws Exception {
        for (int i = 0; i < times; i++) {
            mvc.perform(post("/api/scans/{s}/detections", scanId).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"partNum\":\"%s\",\"colorId\":%d}".formatted(part, color))).andExpect(status().isCreated());
        }
    }

    private void addExactlySetOneHundred() throws Exception {
        addPieces("3001", 4, 2);
        addPieces("3002", 4, 2);
        addPieces("3003", 1, 4);
    }

    @Test
    void ranksSetsByF1OfCoverageAndCompleteness() throws Exception {
        addExactlySetOneHundred();

        mvc.perform(get("/api/scans/{s}/set-candidates", scanId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.strategy").value("coverage"))
                .andExpect(jsonPath("$.pilePieces").value(8))
                .andExpect(jsonPath("$.candidates.length()").value(3))
                .andExpect(jsonPath("$.candidates[0].rank").value(1))
                .andExpect(jsonPath("$.candidates[0].set.setNum").value("100-1"))
                .andExpect(jsonPath("$.candidates[0].set.name").value("Red House"))
                .andExpect(jsonPath("$.candidates[0].set.themeName").value("City"))
                .andExpect(jsonPath("$.candidates[0].set.numParts").value(8))
                .andExpect(jsonPath("$.candidates[0].matchPercent").value(100.0))
                .andExpect(jsonPath("$.candidates[0].pileCoverage").value(1.0))
                .andExpect(jsonPath("$.candidates[0].setCompleteness").value(1.0))
                .andExpect(jsonPath("$.candidates[0].matchedPieces").value(8))
                .andExpect(jsonPath("$.candidates[0].missingPieces").value(0))
                .andExpect(jsonPath("$.candidates[0].missingParts.length()").value(0))
                // 300-1: coverage 8/8, completeness 8/22, F1 = 2*8/(8+22)
                .andExpect(jsonPath("$.candidates[1].set.setNum").value("300-1"))
                .andExpect(jsonPath("$.candidates[1].matchPercent").value(closeTo(53.3333333, 1e-6)))
                .andExpect(jsonPath("$.candidates[1].pileCoverage").value(1.0))
                .andExpect(jsonPath("$.candidates[1].setCompleteness").value(hasToString(startsWith("0.363636363636"))))
                .andExpect(jsonPath("$.candidates[1].missingPieces").value(14))
                .andExpect(jsonPath("$.candidates[1].missingParts[0].part.partNum").value("3005"))
                .andExpect(jsonPath("$.candidates[1].missingParts[0].color.name").value("Black"))
                .andExpect(jsonPath("$.candidates[1].missingParts[0].quantityNeeded").value(10))
                .andExpect(jsonPath("$.candidates[1].missingParts[0].quantityHave").value(0))
                
                // 200-1: only 3002/Red x1 matches
                .andExpect(jsonPath("$.candidates[2].set.setNum").value("200-1"))
                .andExpect(jsonPath("$.candidates[2].matchedPieces").value(1));
    }

    @Test
    void honoursLimitAndMissingLimit() throws Exception {
        addExactlySetOneHundred();

        mvc.perform(get("/api/scans/{s}/set-candidates", scanId).param("limit", "2").param("missingLimit", "1"))
                .andExpect(jsonPath("$.candidates.length()").value(2))
                .andExpect(jsonPath("$.candidates[1].missingParts.length()").value(1))
                .andExpect(jsonPath("$.candidates[1].missingPieces").value(14));
        mvc.perform(get("/api/scans/{s}/set-candidates", scanId).param("missingLimit", "0"))
                .andExpect(jsonPath("$.candidates[1].missingParts.length()").value(0));
        mvc.perform(get("/api/scans/{s}/set-candidates", scanId).param("limit", "21")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/scans/{s}/set-candidates", scanId).param("limit", "0")).andExpect(status().isBadRequest());
    }

    @Test
    void pileIsAggregatedPerPartAndColorAndIgnoresUnidentifiedPieces() throws Exception {
        addPieces("3004", 1, 2);
        mvc.perform(get("/api/scans/{s}/set-candidates", scanId))
                .andExpect(jsonPath("$.pilePieces").value(2))
                .andExpect(jsonPath("$.candidates[0].set.setNum").value("200-1"))
                .andExpect(jsonPath("$.candidates[0].pileCoverage").value(1.0));
    }

    @Test
    void emptyPileGivesEmptyCandidates() throws Exception {
        mvc.perform(get("/api/scans/{s}/set-candidates", scanId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pilePieces").value(0))
                .andExpect(jsonPath("$.candidates.length()").value(0));
    }

    @Test
    void rarityWeightedIsNotImplementedAndUnknownStrategyIsRejected() throws Exception {
        mvc.perform(get("/api/scans/{s}/set-candidates", scanId).param("strategy", "rarity-weighted"))
                .andExpect(status().isNotImplemented())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(501));
        mvc.perform(get("/api/scans/{s}/set-candidates", scanId).param("strategy", "magic"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/scans/{s}/set-candidates", "11111111-1111-1111-1111-111111111111"))
                .andExpect(status().isNotFound());
    }
}
