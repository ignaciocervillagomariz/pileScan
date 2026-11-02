package com.pilescan.partmapping;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Mapping cache and unmapped-ID tracking, on top of two Spring Data repositories. */
@Repository
class PartMappingRepository {

    /** A cached answer; {@code partNum} is set only for MAPPED. */
    record CachedMapping(String partNum, String status, String detail, OffsetDateTime checkedAt) { }

    private final PartIdMappingJpaRepository mappings;
    private final UnmappedPartIdJpaRepository unmapped;

    PartMappingRepository(PartIdMappingJpaRepository mappings, UnmappedPartIdJpaRepository unmapped) {
        this.mappings = mappings;
        this.unmapped = unmapped;
    }

    @Transactional(readOnly = true)
    Optional<CachedMapping> find(String idSystem, String rawId) {
        return mappings.findById(new PartIdKey(idSystem, rawId))
                .map(e -> new CachedMapping(e.getPartNum(), e.getStatus(), e.getDetail(), e.getCheckedAt()));
    }

    @Transactional
    void save(String idSystem, String rawId, String partNum, String status, String detail, OffsetDateTime now) {
        mappings.upsert(idSystem, rawId, partNum, status, detail, now);
    }

    @Transactional
    void recordUnmapped(String idSystem, String rawId, String error, OffsetDateTime now) {
        unmapped.countOccurrence(idSystem, rawId, error, now);
    }

    /** An ID that now maps (new catalog, API key added) no longer belongs on the unmapped list. */
    @Transactional
    void clearUnmapped(String idSystem, String rawId) {
        unmapped.deleteById(new PartIdKey(idSystem, rawId));
    }

    @Transactional(readOnly = true)
    List<UnmappedPartId> listUnmapped() {
        return unmapped.findAllByOrderByOccurrencesDescLastSeenAtDesc().stream()
                .map(UnmappedPartIdEntity::toApi).toList();
    }
}
