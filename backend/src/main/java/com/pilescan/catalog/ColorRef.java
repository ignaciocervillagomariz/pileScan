package com.pilescan.catalog;

/** Compact color reference; {@code rgb} is formatted as {@code #RRGGBB}. */
public record ColorRef(int id, String name, String rgb) {
}
