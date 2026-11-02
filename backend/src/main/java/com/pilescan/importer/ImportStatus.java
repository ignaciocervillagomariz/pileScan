package com.pilescan.importer;

import java.time.OffsetDateTime;
import java.util.Map;

public record ImportStatus(State state, OffsetDateTime startedAt, OffsetDateTime finishedAt, String message,
                           Map<String, Long> counts) {

    public enum State { NEVER_RUN, RUNNING, SUCCEEDED, FAILED }
}
