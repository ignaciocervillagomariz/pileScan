package com.pilescan.importer;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "admin")
@RestController
@RequestMapping("/api/admin/catalog-import")
class CatalogImportController {

    private final CatalogImportService service;

    CatalogImportController(CatalogImportService service) {
        this.service = service;
    }

    @Operation(operationId = "getCatalogImportStatus", summary = "Status of the last catalog import.")
    @GetMapping
    ImportStatus status() {
        return service.status();
    }

    @Operation(operationId = "startCatalogImport", summary = "Start the idempotent Rebrickable CSV import. No-op if already running.")
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    ImportStatus start() {
        return service.start();
    }
}
