package com.pilescan.partmapping;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Cached answer of the ID mapping, including negative ones (status NOT_FOUND or ERROR). */
@Entity
@Table(name = "part_id_mapping")
class PartIdMappingEntity {

    @EmbeddedId
    private PartIdKey key;

    private String partNum;
    private String status;
    private String detail;
    private OffsetDateTime checkedAt;

    protected PartIdMappingEntity() {
    }

    PartIdKey getKey() {
        return key;
    }

    String getPartNum() {
        return partNum;
    }

    String getStatus() {
        return status;
    }

    String getDetail() {
        return detail;
    }

    OffsetDateTime getCheckedAt() {
        return checkedAt;
    }
}
