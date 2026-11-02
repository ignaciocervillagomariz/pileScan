package com.pilescan.detection;

import com.pilescan.catalog.CatalogRepository;
import com.pilescan.common.ApiException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** User corrections of a scan: list, add a missed piece, fix part/color, remove a false positive. */
@Service
public class DetectionService {

    private final DetectionRepository repository;
    private final DetectionAssembler assembler;
    private final CatalogRepository catalog;
    private final Clock clock;

    DetectionService(DetectionRepository repository, DetectionAssembler assembler, CatalogRepository catalog,
                     Clock clock) {
        this.repository = repository;
        this.assembler = assembler;
        this.catalog = catalog;
        this.clock = clock;
    }

    public List<Detection> list(UUID scanId) {
        requireScan(scanId);
        return assembler.assemble(repository.listActive(scanId));
    }

    @Transactional
    public Detection add(UUID scanId, DetectionCreate request) {
        requireScan(scanId);
        requireValidPart(request.partNum());
        requireValidColor(request.colorId());
        DetectionRecord record = new DetectionRecord(UUID.randomUUID(), scanId, DetectionSource.MANUAL, false, 1.0,
                request.bbox(), request.partNum(), request.colorId(), null, MappingStatus.MAPPED,
                List.of(), List.of(), OffsetDateTime.now(clock));
        repository.insert(record);
        return assembler.assemble(record);
    }

    @Transactional
    public Detection update(UUID scanId, UUID detectionId, DetectionUpdate request) {
        if (request.partNum() == null && request.colorId() == null) {
            throw ApiException.badRequest("Provide partNum and/or colorId.");
        }
        requireScan(scanId);
        DetectionRecord current = repository.findActive(scanId, detectionId)
                .orElseThrow(() -> ApiException.notFound("Detection " + detectionId + " not found."));
        String partNum = request.partNum() != null ? request.partNum() : current.partNum();
        Integer colorId = request.colorId() != null ? request.colorId() : current.colorId();
        if (request.partNum() != null) {
            requireValidPart(partNum);
        }
        if (request.colorId() != null) {
            requireValidColor(colorId);
        }
        // A pending correction of only one field on an unidentified piece cannot yet form a part+color.
        if (partNum == null || colorId == null) {
            throw ApiException.unprocessable("A detection needs both a part and a color; also send the missing one.");
        }
        repository.applyCorrection(detectionId, partNum, colorId);
        return assembler.assemble(repository.findActive(scanId, detectionId).orElseThrow());
    }

    @Transactional
    public void delete(UUID scanId, UUID detectionId) {
        requireScan(scanId);
        if (!repository.softDelete(scanId, detectionId)) {
            throw ApiException.notFound("Detection " + detectionId + " not found.");
        }
    }

    private void requireScan(UUID scanId) {
        if (!repository.scanExists(scanId)) {
            throw ApiException.notFound("Scan " + scanId + " not found.");
        }
    }

    private void requireValidPart(String partNum) {
        if (!catalog.partExists(partNum)) {
            throw ApiException.unprocessable("Unknown partNum '" + partNum + "'.");
        }
    }

    private void requireValidColor(Integer colorId) {
        if (catalog.colorRefs(List.of(colorId)).isEmpty()) {
            throw ApiException.unprocessable("Unknown colorId " + colorId + ".");
        }
    }
}
