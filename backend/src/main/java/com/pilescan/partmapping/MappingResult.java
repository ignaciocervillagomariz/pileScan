package com.pilescan.partmapping;

/** Outcome of mapping one detector part ID; {@code partNum} is null unless MAPPED. */
public record MappingResult(String partNum, Status status) {

    public enum Status { MAPPED, UNMAPPED }

    static MappingResult mapped(String partNum) {
        return new MappingResult(partNum, Status.MAPPED);
    }

    static MappingResult unmapped() {
        return new MappingResult(null, Status.UNMAPPED);
    }
}
