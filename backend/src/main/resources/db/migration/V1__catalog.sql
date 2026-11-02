-- Catalog tables, filled by the Rebrickable CSV import (see com.pilescan.importer).
-- No foreign keys on purpose: the import loads tables independently and must never fail
-- on a dangling reference inside the vendor data.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE colors (
    id       INTEGER PRIMARY KEY,
    name     TEXT    NOT NULL,
    rgb      CHAR(6) NOT NULL,
    is_trans BOOLEAN NOT NULL
);

CREATE TABLE part_categories (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE parts (
    part_num      TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    part_cat_id   INTEGER,
    part_material TEXT,
    -- Rebrickable's parts.csv has no image: filled from inventory_parts.img_url after import.
    img_url       TEXT
);
CREATE INDEX parts_name_trgm_idx ON parts USING gin (lower(name) gin_trgm_ops);

CREATE TABLE themes (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    parent_id INTEGER
);

CREATE TABLE sets (
    set_num   TEXT PRIMARY KEY,
    name      TEXT    NOT NULL,
    year      INTEGER NOT NULL,
    theme_id  INTEGER,
    num_parts INTEGER NOT NULL,
    img_url   TEXT
);

CREATE TABLE inventories (
    id      INTEGER PRIMARY KEY,
    version INTEGER NOT NULL,
    set_num TEXT    NOT NULL
);
CREATE INDEX inventories_set_version_idx ON inventories (set_num, version DESC);

-- Derived: quantity per (set, part, color) for the latest inventory version of each set,
-- spare parts excluded. inventory_parts itself (1.5M rows) is only a transient staging table.
CREATE TABLE set_part_quantities (
    part_num TEXT    NOT NULL,
    color_id INTEGER NOT NULL,
    set_num  TEXT    NOT NULL,
    quantity INTEGER NOT NULL,
    img_url  TEXT,
    -- Column order serves the ranking prefilter: lookup by (part_num, color_id), then set.
    PRIMARY KEY (part_num, color_id, set_num)
);
CREATE INDEX set_part_quantities_set_idx ON set_part_quantities (set_num);

CREATE TABLE set_stats (
    set_num      TEXT PRIMARY KEY,
    total_pieces INTEGER NOT NULL
);

CREATE TABLE catalog_import_status (
    id              SMALLINT PRIMARY KEY CHECK (id = 1),
    state           TEXT NOT NULL,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    message         TEXT,
    counts          JSONB NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO catalog_import_status (id, state) VALUES (1, 'NEVER_RUN');
