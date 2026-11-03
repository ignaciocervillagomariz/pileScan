package com.pilescan.detection;

/** Outcome of part classification for a detected piece, mapped from the inference contract's lowercase values. */
public enum ClassificationStatus {
    OK, NO_MATCH, ERROR, SKIPPED;

    /** @return the status, or null when the value is absent or unknown to this backend version */
    public static ClassificationStatus fromInference(String value) {
        if (value == null) {
            return null;
        }
        try {
            return valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
