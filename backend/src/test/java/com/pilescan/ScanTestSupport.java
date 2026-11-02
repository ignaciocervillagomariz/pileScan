package com.pilescan;

/** Canned inference responses and helpers shared by the integration tests. */
public final class ScanTestSupport {

    private ScanTestSupport() {
    }

    /** Four detections: mapped directly, mapped through the Rebrickable API, unmapped, and no candidates. */
    public static final String RECOGNIZE_RESPONSE = """
            {
              "contract_version": "1.0.0",
              "image": {"width": %d, "height": %d},
              "detections": [
                {"index": 0, "bbox": {"x": 10, "y": 20, "width": 30, "height": 40}, "detection_score": 0.9,
                 "part_candidates": [
                   {"part_id": "3001", "id_system": "bricklink", "name": "Brick 2 x 4", "score": 0.8, "image_url": null},
                   {"part_id": "3002", "id_system": "bricklink", "name": "Brick 2 x 3", "score": 0.1, "image_url": null}],
                 "color_candidates": [
                   {"rebrickable_color_id": 4, "name": "Red", "score": 0.7, "delta_e": 3.0},
                   {"rebrickable_color_id": 1, "name": "Blue", "score": 0.3, "delta_e": 9.0}],
                 "measured_rgb": {"r": 196, "g": 32, "b": 27}},
                {"index": 1, "bbox": {"x": 50, "y": 60, "width": 30, "height": 40}, "detection_score": 1.0,
                 "part_candidates": [
                   {"part_id": "3626b", "id_system": "bricklink", "name": "Minifig head", "score": 0.5, "image_url": null}],
                 "color_candidates": [{"rebrickable_color_id": 15, "name": "White", "score": 1.0}],
                 "measured_rgb": {"r": 250, "g": 250, "b": 250}},
                {"index": 2, "bbox": {"x": 90, "y": 60, "width": 20, "height": 20}, "detection_score": 0.5,
                 "part_candidates": [
                   {"part_id": "zz-unknown", "id_system": "bricklink", "name": "Mystery", "score": 0.4, "image_url": null}],
                 "color_candidates": [{"rebrickable_color_id": 4, "name": "Red", "score": 0.5}],
                 "measured_rgb": {"r": 200, "g": 30, "b": 30}},
                {"index": 3, "bbox": {"x": 0, "y": 0, "width": 5, "height": 5}, "detection_score": 0.6,
                 "part_candidates": [],
                 "color_candidates": [{"rebrickable_color_id": 4, "name": "Red", "score": 0.5}],
                 "measured_rgb": {"r": 200, "g": 30, "b": 30}}
              ],
              "pipeline": {"detector": "opencv-lab-v1", "part_classifier": "stub-v1", "color_estimator": "kmeans-lab-ciede2000-v1"},
              "timings_ms": {"detect": 1, "classify": 1, "color": 1, "total": 3},
              "warnings": ["classifier degraded"],
              "debug_image": null
            }
            """;

    public static String recognizeResponse(int width, int height) {
        return RECOGNIZE_RESPONSE.formatted(width, height);
    }
}
