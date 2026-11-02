package com.pilescan.importer;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Starts catalog imports in the background, at most one at a time. */
@Service
public class CatalogImportService {

    private static final Logger log = LoggerFactory.getLogger(CatalogImportService.class);

    private final CatalogImporter importer;
    private final ImportStatusRepository statusRepository;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "catalog-import");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicBoolean running = new AtomicBoolean();

    CatalogImportService(CatalogImporter importer, ImportStatusRepository statusRepository) {
        this.importer = importer;
        this.statusRepository = statusRepository;
    }

    /** Starts an import unless one is already running; either way returns the current status. */
    public ImportStatus start() {
        if (running.compareAndSet(false, true)) {
            statusRepository.markRunning();
            executor.submit(this::runImport);
        }
        return statusRepository.current();
    }

    public ImportStatus status() {
        return statusRepository.current();
    }

    private void runImport() {
        try {
            Map<String, Long> counts = importer.run();
            statusRepository.markSucceeded(counts);
            log.info("Catalog import succeeded: {}", counts);
        } catch (RuntimeException e) {
            log.error("Catalog import failed", e);
            statusRepository.markFailed(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        } finally {
            running.set(false);
        }
    }
}
