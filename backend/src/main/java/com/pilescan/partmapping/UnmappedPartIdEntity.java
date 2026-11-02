package com.pilescan.partmapping;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** A classifier ID that could not be mapped, with how often it was seen. */
@Entity
@Table(name = "unmapped_part_ids")
class UnmappedPartIdEntity {

    @EmbeddedId
    private PartIdKey key;

    private int occurrences;
    private OffsetDateTime lastSeenAt;
    private String lastError;

    protected UnmappedPartIdEntity() {
    }

    UnmappedPartId toApi() {
        return new UnmappedPartId(key.rawId(), key.idSystem(), occurrences, lastSeenAt, lastError);
    }
}
