package com.pilescan;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.pilescan.importer.CatalogImportService;
import com.pilescan.importer.ImportStatus;
import java.net.URI;
import java.time.Duration;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Boots the whole app against a Testcontainers PostgreSQL loaded with the small fixture catalog. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
public abstract class AbstractIntegrationTest {

    private static final URI CATALOG_DIR = TestCatalog.prepare();

    /** Stands in for both the inference service and the Rebrickable API. */
    protected static final WireMockServer WIREMOCK = new WireMockServer(WireMockConfiguration.options().dynamicPort());

    static {
        WIREMOCK.start();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("pilescan.catalog.base-url", CATALOG_DIR::toString);
        registry.add("pilescan.catalog.import-on-startup", () -> "false");
        registry.add("pilescan.scan.storage-dir", () -> CATALOG_DIR.getPath() + "scans");
        registry.add("pilescan.inference.url", WIREMOCK::baseUrl);
        registry.add("pilescan.rebrickable.api-url", WIREMOCK::baseUrl);
        registry.add("pilescan.rebrickable.api-key", () -> "test-key");
        registry.add("pilescan.rebrickable.min-interval", () -> "0ms");
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    private CatalogImportService importService;

    @BeforeEach
    void resetStubs() {
        WIREMOCK.resetAll();
    }

    /** Imports the fixture catalog (idempotent) and waits for it. */
    protected void loadCatalog() {
        importService.start();
        Awaitility.await().atMost(Duration.ofSeconds(60)).until(
                () -> importService.status().state() != ImportStatus.State.RUNNING);
        if (importService.status().state() != ImportStatus.State.SUCCEEDED) {
            throw new AssertionError("Catalog import failed: " + importService.status().message());
        }
    }
}
