package com.pilescan;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;

/** Builds small test images, including JPEGs carrying an EXIF orientation tag. */
public final class TestImages {

    private TestImages() {
    }

    /** A white image with a red 10x10 block in the top-left corner. */
    public static BufferedImage marked(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width, height);
        g.setColor(Color.RED);
        g.fillRect(0, 0, 10, 10);
        g.dispose();
        return image;
    }

    public static byte[] png(int width, int height) {
        return encode(marked(width, height), "png");
    }

    public static byte[] jpeg(int width, int height) {
        return encode(marked(width, height), "jpg");
    }

    /** A JPEG whose EXIF orientation tag (0x0112) is set to {@code orientation}. */
    public static byte[] jpegWithOrientation(int width, int height, int orientation) {
        byte[] jpeg = jpeg(width, height);
        byte[] app1 = {
                (byte) 0xFF, (byte) 0xE1, 0x00, 0x22,                    // APP1, length 34
                'E', 'x', 'i', 'f', 0, 0,
                'M', 'M', 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,             // big-endian TIFF header, IFD0 at 8
                0x00, 0x01,                                               // one entry
                0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,           // Orientation, SHORT, count 1
                0x00, (byte) orientation, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00                                    // no next IFD
        };
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2);
        out.write(app1, 0, app1.length);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    private static byte[] encode(BufferedImage image, String format) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, format, out);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return out.toByteArray();
    }
}
