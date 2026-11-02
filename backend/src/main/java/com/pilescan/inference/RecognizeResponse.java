package com.pilescan.inference;

import java.util.List;

/**
 * The subset of the inference contract (docs/api/inference-response.schema.json, v1.x) the backend
 * consumes. Field names are snake_case on the wire; {@link InferenceClient} maps them.
 */
public record RecognizeResponse(
        String contractVersion,
        ImageSize image,
        List<DetectionResult> detections,
        Pipeline pipeline,
        List<String> warnings) {

    public record ImageSize(int width, int height) { }

    public record Pipeline(String detector, String partClassifier, String colorEstimator) {

        /** The identifier stored on the scan, e.g. {@code opencv-lab-v1/brickognize-v1/kmeans-lab-ciede2000-v1}. */
        public String label() {
            return detector + "/" + partClassifier + "/" + colorEstimator;
        }
    }

    public record BBox(int x, int y, int width, int height) { }

    public record PartCandidate(String partId, String idSystem, String name, double score, String imageUrl) { }

    public record ColorCandidate(int rebrickableColorId, String name, double score) { }

    public record Rgb(int r, int g, int b) {

        public String hex() {
            return String.format("#%02X%02X%02X", r, g, b);
        }
    }

    public record DetectionResult(
            int index,
            BBox bbox,
            double detectionScore,
            List<PartCandidate> partCandidates,
            List<ColorCandidate> colorCandidates,
            Rgb measuredRgb) { }
}
