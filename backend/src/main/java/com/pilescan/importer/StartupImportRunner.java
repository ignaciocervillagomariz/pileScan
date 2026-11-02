package com.pilescan.importer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Recovers a half-finished import state and, if enabled, imports a missing or stale catalog at boot. */
@Component
class StartupImportRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupImportRunner.class);

    private final CatalogProperties props;
    private final ImportStatusRepository statusRepository;
    private final CatalogImportService service;

    StartupImportRunner(CatalogProperties props, ImportStatusRepository statusRepository,
                        CatalogImportService service) {
        this.props = props;
        this.statusRepository = statusRepository;
        this.service = service;
    }

    @Override
    public void run(ApplicationArguments args) {
        statusRepository.failInterrupted();
        if (props.importOnStartup() && statusRepository.isStale(props.maxAge())) {
            log.info("Catalog missing or stale, starting import");
            service.start();
        }
    }
}
