package com.pilescan.scan;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/** Stores scan images on disk (a mounted volume), one file per scan. */
@Component
class ScanImageStore {

    private final Path dir;

    ScanImageStore(@Value("${pilescan.scan.storage-dir}") Path dir) {
        this.dir = dir;
    }

    /** @return the stored file name, relative to the storage directory */
    String save(UUID scanId, ProcessedImage image) {
        String name = scanId + "." + image.extension();
        try {
            Files.createDirectories(dir);
            Files.write(dir.resolve(name), image.bytes());
            return name;
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store scan image", e);
        }
    }

    /** Stores the inference debug overlay (JPEG) next to the scan image. */
    String saveDebug(UUID scanId, byte[] jpeg) {
        String name = scanId + ".debug.jpg";
        try {
            Files.createDirectories(dir);
            Files.write(dir.resolve(name), jpeg);
            return name;
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store debug image", e);
        }
    }

    Resource resource(String name) {
        return new FileSystemResource(dir.resolve(name));
    }
}
