package com.pilescan.scan;

/** An upload after validation and EXIF orientation correction. */
record ProcessedImage(byte[] bytes, String contentType, String extension, int width, int height) {
}
