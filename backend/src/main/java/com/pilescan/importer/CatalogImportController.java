package com.pilescan.importer;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/catalog-import")
class CatalogImportController {

    private final CatalogImportService service;

    CatalogImportController(CatalogImportService service) {
        this.service = service;
    }

    @GetMapping
    ImportStatus status() {
        return service.status();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    ImportStatus start() {
        return service.start();
    }
}
