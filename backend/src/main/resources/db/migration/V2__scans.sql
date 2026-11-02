CREATE TABLE scans (
    id                 UUID PRIMARY KEY,
    status             TEXT        NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL,
    image_file         TEXT        NOT NULL,
    image_content_type TEXT        NOT NULL,
    image_width        INTEGER     NOT NULL,
    image_height       INTEGER     NOT NULL,
    pipeline           TEXT,
    error_message      TEXT,
    warnings           JSONB       NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE detections (
    id               UUID PRIMARY KEY,
    seq              BIGINT GENERATED ALWAYS AS IDENTITY,
    scan_id          UUID             NOT NULL REFERENCES scans (id) ON DELETE CASCADE,
    source           TEXT             NOT NULL,
    corrected        BOOLEAN          NOT NULL DEFAULT FALSE,
    deleted          BOOLEAN          NOT NULL DEFAULT FALSE,
    confidence       DOUBLE PRECISION NOT NULL,
    bbox_x           INTEGER,
    bbox_y           INTEGER,
    bbox_width       INTEGER,
    bbox_height      INTEGER,
    part_num         TEXT,
    color_id         INTEGER,
    measured_rgb     CHAR(7),
    mapping_status   TEXT             NOT NULL,
    part_candidates  JSONB            NOT NULL DEFAULT '[]'::jsonb,
    color_candidates JSONB            NOT NULL DEFAULT '[]'::jsonb,
    created_at       TIMESTAMPTZ      NOT NULL
);
CREATE INDEX detections_scan_active_idx ON detections (scan_id, seq) WHERE NOT deleted;

-- Cache of detector part IDs -> Rebrickable part_num, including negative answers.
CREATE TABLE part_id_mapping (
    id_system  TEXT        NOT NULL,
    raw_id     TEXT        NOT NULL,
    part_num   TEXT,
    status     TEXT        NOT NULL,   -- MAPPED | NOT_FOUND | ERROR
    detail     TEXT,
    checked_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id_system, raw_id)
);

CREATE TABLE unmapped_part_ids (
    id_system    TEXT        NOT NULL,
    raw_id       TEXT        NOT NULL,
    occurrences  INTEGER     NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    last_error   TEXT,
    PRIMARY KEY (id_system, raw_id)
);
