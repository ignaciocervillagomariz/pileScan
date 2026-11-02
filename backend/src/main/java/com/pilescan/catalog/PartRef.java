package com.pilescan.catalog;

/** Compact part reference embedded in scan and ranking responses. */
public record PartRef(String partNum, String name, String imageUrl) {
}
