-- Contract 1.1.0: classification outcome per detection, debug overlay and stage timings per scan.
ALTER TABLE scans
    ADD COLUMN debug_image_file      TEXT,
    ADD COLUMN inference_timings_ms  JSONB;

ALTER TABLE detections
    ADD COLUMN classification_status TEXT
        CHECK (classification_status IN ('OK', 'NO_MATCH', 'ERROR', 'SKIPPED'));
