package com.pilescan.scan;

import com.pilescan.common.ApiException;
import com.pilescan.detection.Detection;
import com.pilescan.detection.DetectionAssembler;
import com.pilescan.detection.DetectionEntity;
import com.pilescan.detection.DetectionRepository;
import com.pilescan.inference.InferenceClient;
import com.pilescan.inference.InferenceException;
import com.pilescan.inference.RecognizeResponse;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ScanService {

    private static final Logger log = LoggerFactory.getLogger(ScanService.class);

    private final ScanImageProcessor imageProcessor;
    private final ScanImageStore imageStore;
    private final ScanRepository scans;
    private final DetectionRepository detections;
    private final DetectionAssembler assembler;
    private final InferenceClient inference;
    private final RecognitionMapper recognitionMapper;
    private final TransactionTemplate tx;
    private final Clock clock;

    ScanService(ScanImageProcessor imageProcessor, ScanImageStore imageStore, ScanRepository scans,
                DetectionRepository detections, DetectionAssembler assembler, InferenceClient inference,
                RecognitionMapper recognitionMapper, TransactionTemplate tx, Clock clock) {
        this.imageProcessor = imageProcessor;
        this.imageStore = imageStore;
        this.scans = scans;
        this.detections = detections;
        this.assembler = assembler;
        this.inference = inference;
        this.recognitionMapper = recognitionMapper;
        this.tx = tx;
        this.clock = clock;
    }

    /**
     * Stores the image and runs recognition synchronously. An inference failure is not an error of
     * this call: the scan is returned with status FAILED so the client can add pieces by hand.
     */
    public Scan create(byte[] upload) {
        ProcessedImage image = imageProcessor.process(upload);
        UUID id = UUID.randomUUID();
        String file = imageStore.save(id, image);
        scans.save(new ScanEntity(id, OffsetDateTime.now(clock), file, image.contentType(), image.width(),
                image.height()));
        recognize(id, image);
        return get(id);
    }

    private void recognize(UUID id, ProcessedImage image) {
        try {
            RecognizeResponse response = inference.recognize(image.bytes(), image.contentType());
            RecognitionMapper.Result mapped = recognitionMapper.map(id, response, OffsetDateTime.now(clock));
            List<String> warnings = mapped.warnings();
            if (response.image().width() != image.width() || response.image().height() != image.height()) {
                warnings = new java.util.ArrayList<>(warnings);
                warnings.add("Inference analysed a %dx%d image but the stored image is %dx%d; boxes may be offset."
                        .formatted(response.image().width(), response.image().height(), image.width(), image.height()));
            }
            List<String> finalWarnings = warnings;
            tx.executeWithoutResult(status -> {
                mapped.detections().forEach(detections::insert);
                scans.getReferenceById(id).complete(response.pipeline().label(), finalWarnings);
            });
        } catch (InferenceException e) {
            log.warn("Inference failed for scan {}: {}", id, e.getMessage());
            fail(id, e.getMessage());
        } catch (RuntimeException e) {
            log.error("Processing failed for scan {}", id, e);
            fail(id, "Processing the recognition result failed: " + e.getMessage());
        }
    }

    private void fail(UUID id, String message) {
        tx.executeWithoutResult(status -> scans.getReferenceById(id).fail(message));
    }

    /** Runs in a transaction because the detections of the aggregate are loaded lazily. */
    public Scan get(UUID id) {
        return tx.execute(status -> load(id));
    }

    private Scan load(UUID id) {
        ScanEntity scan = scans.findById(id).orElseThrow(() -> ApiException.notFound("Scan " + id + " not found."));
        List<Detection> active = assembler.assemble(
                scan.getDetections().stream().map(DetectionEntity::toRecord).toList());
        return new Scan(scan.getId(), scan.getStatus(), scan.getCreatedAt(),
                new Scan.Image("/api/scans/" + id + "/image", scan.getImageWidth(), scan.getImageHeight()),
                active, ScanSummary.of(active), scan.getWarnings(), scan.getErrorMessage(), scan.getPipeline());
    }

    /** Stored image as a resource together with its content type. */
    public record StoredImage(Resource resource, String contentType) { }

    public StoredImage image(UUID id) {
        ScanEntity scan = scans.findById(id).orElseThrow(() -> ApiException.notFound("Scan " + id + " not found."));
        Resource resource = imageStore.resource(scan.getImageFile());
        if (!resource.exists()) {
            throw ApiException.notFound("Image of scan " + id + " is no longer available.");
        }
        return new StoredImage(resource, scan.getImageContentType());
    }
}
