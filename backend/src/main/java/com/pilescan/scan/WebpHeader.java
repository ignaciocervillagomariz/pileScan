package com.pilescan.scan;

import java.util.Optional;

/** Reads the pixel size from a WebP header (lossy VP8, lossless VP8L or extended VP8X). */
final class WebpHeader {

    private WebpHeader() {
    }

    static Optional<int[]> size(byte[] b) {
        if (b.length < 30) {
            return Optional.empty();
        }
        String chunk = new String(b, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);
        return switch (chunk) {
            case "VP8 " -> Optional.of(new int[] {u16(b, 26) & 0x3FFF, u16(b, 28) & 0x3FFF});
            case "VP8L" -> {
                long bits = (b[21] & 0xFFL) | (b[22] & 0xFFL) << 8 | (b[23] & 0xFFL) << 16 | (b[24] & 0xFFL) << 24;
                yield Optional.of(new int[] {(int) (bits & 0x3FFF) + 1, (int) ((bits >> 14) & 0x3FFF) + 1});
            }
            case "VP8X" -> Optional.of(new int[] {u24(b, 24) + 1, u24(b, 27) + 1});
            default -> Optional.empty();
        };
    }

    private static int u16(byte[] b, int offset) {
        return (b[offset] & 0xFF) | (b[offset + 1] & 0xFF) << 8;
    }

    private static int u24(byte[] b, int offset) {
        return u16(b, offset) | (b[offset + 2] & 0xFF) << 16;
    }
}
