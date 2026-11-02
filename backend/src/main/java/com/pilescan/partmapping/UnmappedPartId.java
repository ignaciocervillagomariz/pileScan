package com.pilescan.partmapping;

import java.time.OffsetDateTime;

public record UnmappedPartId(String rawPartId, String idSystem, int occurrences, OffsetDateTime lastSeenAt,
                             String lastError) {
}
