package com.pilescan.partmapping;

import jakarta.persistence.Embeddable;

/** A foreign part ID: which namespace it belongs to and its value. */
@Embeddable
record PartIdKey(String idSystem, String rawId) {
}
