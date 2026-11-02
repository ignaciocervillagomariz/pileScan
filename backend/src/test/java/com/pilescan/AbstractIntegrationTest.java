package com.pilescan;

import com.pilescan.importer.CatalogImportService;
import com.pilescan.importer.ImportStatus;
import java.net.URI;
import java.time.Duration;
import org.awaitility.Awaitility;
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

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("pilescan.catalog.base-url", CATALOG_DIR::toString);
        registry.add("pilescan.catalog.import-on-startup", () -> "false");
        registry.add("pilescan.scan.storage-dir", () -> CATALOG_DIR.getPath() + "scans");
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    private CatalogImportService importService;


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
