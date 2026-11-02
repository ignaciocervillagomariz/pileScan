package com.pilescan.importer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.pilescan.AbstractIntegrationTest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

class CatalogImportIT extends AbstractIntegrationTest {

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ImportStatusRepository statusRepository;

    @Test
    void importsFixtureAndKeepsOnlyLatestNonSpareInventory() {
        loadCatalog();

        // Set 100-1 has v1 (3001 red x99) and v2: only v2 counts, and its spare 3005 is dropped.
        List<Map<String, Object>> house = jdbc.sql(
                "SELECT part_num, color_id, quantity FROM set_part_quantities WHERE set_num = '100-1' ORDER BY part_num")
                .query().listOfRows();
        assertThat(house).extracting(r -> r.get("part_num") + "/" + r.get("color_id") + "/" + r.get("quantity"))
                .containsExactly("3001/4/2", "3002/4/2", "3003/1/4");

        assertThat(jdbc.sql("SELECT total_pieces FROM set_stats WHERE set_num = '300-1'").query(Integer.class).single())
                .isEqualTo(22);
        assertThat(jdbc.sql("SELECT img_url FROM parts WHERE part_num = '3003'").query(String.class).single())
                .isEqualTo("https://example.test/parts/3003-1.jpg");
    }

    @Test
    void reimportIsIdempotent() {
        loadCatalog();
        long before = jdbc.sql("SELECT count(*) FROM set_part_quantities").query(Long.class).single();
        loadCatalog();
        assertThat(jdbc.sql("SELECT count(*) FROM set_part_quantities").query(Long.class).single()).isEqualTo(before);
        assertThat(jdbc.sql("SELECT count(*) FROM parts").query(Long.class).single()).isEqualTo(6);
        assertThat(jdbc.sql("SELECT count(*) FROM inventories").query(Long.class).single()).isEqualTo(4);
    }

    @Test
    void stalenessFollowsLastSuccessfulImport() {
        loadCatalog();
        assertThat(statusRepository.isStale(java.time.Duration.ofDays(30))).isFalse();
        assertThat(statusRepository.isStale(java.time.Duration.ZERO)).isTrue();
        assertThat(statusRepository.isCatalogAvailable()).isTrue();
    }

    @Test
    void statusEndpointsReportResult() throws Exception {
        mvc.perform(post("/api/admin/catalog-import")).andExpect(status().isAccepted());
        loadCatalog();
        mvc.perform(get("/api/admin/catalog-import"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("SUCCEEDED"))
                .andExpect(jsonPath("$.counts.sets").value(3))
                .andExpect(jsonPath("$.counts.set_part_quantities").value(11));
    }

    @Test
    void catalogEndpointsServeImportedData() throws Exception {
        loadCatalog();
        mvc.perform(get("/api/parts").param("q", "3001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].partNum").value("3001"))
                .andExpect(jsonPath("$[0].categoryName").value("Bricks"));
        mvc.perform(get("/api/parts").param("q", "brick 1 x"))
                .andExpect(jsonPath("$[0].partNum").value("3004"));
        mvc.perform(get("/api/parts").param("q", "%")).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/parts/3626cpb0001")).andExpect(jsonPath("$.name").value("Minifig Head Smile"));
        mvc.perform(get("/api/parts/nope")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
        mvc.perform(get("/api/parts")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/parts").param("q", "3").param("limit", "51")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/colors"))
                .andExpect(jsonPath("$[0].name").value("Black"))
                .andExpect(jsonPath("$[?(@.id==4)].rgb").value("#C91A09"))
                .andExpect(jsonPath("$[?(@.id==4)].isTrans").value(false));
    }
}
