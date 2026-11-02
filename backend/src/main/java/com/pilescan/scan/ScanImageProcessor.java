package com.pilescan.scan;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.pilescan.common.ApiException;
import java.awt.Graphics2D;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.stereotype.Component;

/**
 * Validates an upload and bakes the EXIF orientation into the pixels, so the stored image, the image
 * the inference service sees and the bounding boxes all share one coordinate space.
 *
 * <p>JPEG and PNG are decoded with ImageIO. A JPEG is only re-encoded when its orientation is not
 * "normal". WebP cannot be decoded by the JDK: it is validated by header, its size is read from the
 * header and it is stored unchanged, so a WebP carrying an EXIF rotation is not corrected.
 */
@Component
class ScanImageProcessor {

    private static final long MAX_PIXELS = 100_000_000L;
    private static final float JPEG_QUALITY = 0.92f;

    ProcessedImage process(byte[] bytes) {
        if (isJpeg(bytes)) {
            return processJpeg(bytes);
        }
        if (isPng(bytes)) {
            return processDecoded(bytes, "image/png", "png");
        }
        if (isWebp(bytes)) {
            int[] size = WebpHeader.size(bytes).orElseThrow(
                    () -> ApiException.badRequest("The WebP image is corrupt or unsupported."));
            checkPixels(size[0], size[1]);
            return new ProcessedImage(bytes, "image/webp", "webp", size[0], size[1]);
        }
        throw ApiException.badRequest("Unsupported image type: upload a JPEG, PNG or WebP file.");
    }

    private ProcessedImage processJpeg(byte[] bytes) {
        int orientation = readOrientation(bytes);
        if (orientation == 1) {
            return processDecoded(bytes, "image/jpeg", "jpg");
        }
        BufferedImage rotated = applyOrientation(decode(bytes), orientation);
        return new ProcessedImage(encodeJpeg(rotated), "image/jpeg", "jpg", rotated.getWidth(), rotated.getHeight());
    }

    private ProcessedImage processDecoded(byte[] bytes, String contentType, String extension) {
        BufferedImage image = decode(bytes);
        return new ProcessedImage(bytes, contentType, extension, image.getWidth(), image.getHeight());
    }

    private BufferedImage decode(byte[] bytes) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw ApiException.badRequest("The image could not be decoded.");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                checkPixels(reader.getWidth(0), reader.getHeight(0));
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException api) {
                throw api;
            }
            throw ApiException.badRequest("The image could not be decoded.");
        }
    }

    private static void checkPixels(int width, int height) {
        if ((long) width * height > MAX_PIXELS) {
            throw ApiException.badRequest("The image is too large (max 100 megapixels).");
        }
    }

    private static int readOrientation(byte[] bytes) {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(bytes));
            ExifIFD0Directory exif = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (exif != null && exif.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) {
                int value = exif.getInt(ExifIFD0Directory.TAG_ORIENTATION);
                return value >= 1 && value <= 8 ? value : 1;
            }
        } catch (Exception e) {
            // Unreadable metadata is not an error: treat the image as upright.
        }
        return 1;
    }

    /** Applies EXIF orientation 1..8 (see the EXIF spec, tag 0x0112) and returns an upright RGB image. */
    static BufferedImage applyOrientation(BufferedImage src, int orientation) {
        int w = src.getWidth();
        int h = src.getHeight();
        AffineTransform t = switch (orientation) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, h);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, h, w);
            case 8 -> new AffineTransform(0, -1, 1, 0, 0, w);
            default -> new AffineTransform();
        };
        boolean swap = orientation >= 5;
        BufferedImage out = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.drawImage(src, t, null);
        g.dispose();
        return out;
    }

    private static byte[] encodeJpeg(BufferedImage image) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(JPEG_QUALITY);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (MemoryCacheImageOutputStream stream = new MemoryCacheImageOutputStream(out)) {
            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException("Could not encode JPEG", e);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    private static boolean isJpeg(byte[] b) {
        return b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    private static boolean isPng(byte[] b) {
        return b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
    }

    private static boolean isWebp(byte[] b) {
        return b.length > 30 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
    }
}
