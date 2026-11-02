package com.pilescan.partmapping;

import java.util.List;

/** Resolves a foreign part ID to Rebrickable part_nums. Seam that lets the mapper be unit tested. */
interface RebrickablePartLookup {

    boolean isConfigured();

    /**
     * @param idSystem {@code bricklink} or {@code ldraw}
     * @return the matching Rebrickable part_nums, empty if Rebrickable does not know the ID
     * @throws LookupException when the answer could not be obtained (network, throttling, auth)
     */
    List<String> findPartNums(String idSystem, String rawId) throws LookupException;

    class LookupException extends Exception {
        LookupException(String message, Throwable cause) {
            super(message, cause);
        }

        LookupException(String message) {
            super(message);
        }
    }
}
