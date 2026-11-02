package com.pilescan.scan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.pilescan.TestImages;
import com.pilescan.common.ApiException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ScanImageProcessorTest {

    private final ScanImageProcessor processor = new ScanImageProcessor();

    /** Where the red block of a 40x20 image ends up for each EXIF orientation: expected size and corner. */
    @ParameterizedTest
    @CsvSource({
            "1, 40, 20, 0, 0",
            "2, 40, 20, 39, 0",
            "3, 40, 20, 39, 19",
            "4, 40, 20, 0, 19",
            "5, 20, 40, 0, 0",
            "6, 20, 40, 19, 0",
            "7, 20, 40, 19, 39",
            "8, 20, 40, 0, 39"})
    void orientationMovesTheMarkedCornerWhereExifSays(int orientation, int width, int height, int redX, int redY) {
        BufferedImage out = ScanImageProcessor.applyOrientation(TestImages.marked(40, 20), orientation);

        assertThat(out.getWidth()).isEqualTo(width);
        assertThat(out.getHeight()).isEqualTo(height);
        assertThat(out.getRGB(redX, redY) & 0xFFFFFF).isEqualTo(0xFF0000);
    }

    @Test
    void jpegWithExifRotationIsStoredUpright() throws Exception {
        ProcessedImage image = processor.process(TestImages.jpegWithOrientation(40, 20, 6));

        assertThat(image.contentType()).isEqualTo("image/jpeg");
        assertThat(image.width()).isEqualTo(20);
        assertThat(image.height()).isEqualTo(40);
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(image.bytes()));
        assertThat(decoded.getWidth()).isEqualTo(20);
        int pixel = decoded.getRGB(19, 0);
        assertThat((pixel >> 16) & 0xFF).isGreaterThan(200);
        assertThat(pixel & 0xFF).isLessThan(80);
    }

    @Test
    void uprightJpegIsKeptByteForByte() {
        byte[] jpeg = TestImages.jpeg(40, 20);

        ProcessedImage image = processor.process(jpeg);

        assertThat(image.bytes()).isEqualTo(jpeg);
        assertThat(image.width()).isEqualTo(40);
    }

    @Test
    void pngIsAccepted() {
        ProcessedImage image = processor.process(TestImages.png(30, 10));

        assertThat(image.contentType()).isEqualTo("image/png");
        assertThat(image.width()).isEqualTo(30);
        assertThat(image.height()).isEqualTo(10);
    }

    @Test
    void webpSizeIsReadFromHeader() {
        // Minimal lossy header: RIFF....WEBPVP8 ........ then the 0x9d012a start code, 800x600 at offset 26.
        byte[] webp = new byte[40];
        System.arraycopy("RIFF".getBytes(), 0, webp, 0, 4);
        System.arraycopy("WEBPVP8 ".getBytes(), 0, webp, 8, 8);
        webp[26] = (byte) (800 & 0xFF);
        webp[27] = (byte) (800 >> 8);
        webp[28] = (byte) (600 & 0xFF);
        webp[29] = (byte) (600 >> 8);

        ProcessedImage image = processor.process(webp);

        assertThat(image.contentType()).isEqualTo("image/webp");
        assertThat(image.width()).isEqualTo(800);
        assertThat(image.height()).isEqualTo(600);
    }

    @Test
    void rejectsNonImages() {
        assertThatThrownBy(() -> processor.process("hello world, definitely not an image".getBytes()))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> processor.process(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0, 1, 2}))
                .isInstanceOf(ApiException.class);
    }
}
