# PileScan backend

Spring Boot 4.1 / Java 21 service behind the PileScan PWA. It stores scan photos, calls the
inference service, maps the detected part IDs to Rebrickable, keeps the user's corrections and
ranks the official sets a pile most likely comes from.

- Public API: [`docs/api/openapi.yaml`](../docs/api/openapi.yaml). Live Swagger UI at `/swagger-ui.html`,
  generated spec at `/v3/api-docs` (operation IDs match the contract, verified by diffing the two).
- Internal API it calls: [`docs/api/inference-contract.md`](../docs/api/inference-contract.md).
- Errors are RFC 9457 `application/problem+json`.

## Run

Everything together (from the repo root): `cp .env.example .env && docker compose up --build`.
The catalog downloads and imports on first start (about 20 seconds on a laptop, 1.5M inventory rows).
Until it finishes, `GET /api/scans/{id}/set-candidates` answers `503`; check `GET /api/admin/catalog-import`.

Backend alone, against any PostgreSQL 17:

```bash
docker run -d --name pg -p 5432:5432 -e POSTGRES_DB=pilescan -e POSTGRES_USER=pilescan \
  -e POSTGRES_PASSWORD=pilescan postgres:17-alpine
CATALOG_IMPORT_ON_STARTUP=true INFERENCE_URL=http://localhost:8000 ./mvnw spring-boot:run
```

### Tests

`./mvnw verify` runs everything. Unit tests (`*Test`, surefire) need nothing; integration tests (`*IT`,
failsafe) start PostgreSQL 17 with Testcontainers (Docker required) and WireMock for the inference and
Rebrickable APIs. The fixture catalog lives in `src/test/resources/catalog`.

### Small catalog for fast start-up

`CATALOG_BASE_URL` accepts a `file:` URL to a directory of `<table>.csv.gz` files:

```bash
mkdir -p /tmp/mini-catalog
for f in src/test/resources/catalog/*.csv; do gzip -c "$f" > /tmp/mini-catalog/$(basename "$f").gz; done
CATALOG_BASE_URL=file:///tmp/mini-catalog CATALOG_IMPORT_ON_STARTUP=true ./mvnw spring-boot:run
```

The fixture has 3 sets (`100-1`, `200-1`, `300-1`), 6 parts and 5 colors. In Docker, mount the directory
into the container and use its container path.

## Configuration (environment)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | `localhost` `5432` `pilescan` `pilescan` `pilescan` | PostgreSQL |
| `INFERENCE_URL` | `http://localhost:8000` | Inference service base URL |
| `INFERENCE_TIMEOUT_SECONDS` | `120` | Read timeout of `POST /v1/recognize` |
| `REBRICKABLE_API_KEY` | empty | Enables BrickLink/LDraw to Rebrickable lookups; without it unknown IDs stay unmapped |
| `REBRICKABLE_API_URL` | `https://rebrickable.com` | API host (override for tests) |
| `REBRICKABLE_MIN_INTERVAL_MS` | `1100` | Minimum spacing of Rebrickable API calls (limit is about 1 request/s) |
| `CATALOG_IMPORT_ON_STARTUP` | `false` (compose: `true`) | Import at boot if the catalog is missing or stale |
| `CATALOG_BASE_URL` | `https://cdn.rebrickable.com/media/downloads` | Directory of the `.csv.gz` files (`file:` allowed) |
| `CATALOG_CACHE_DIR` | `./data/catalog` (image: `/data/catalog`) | Download cache, revalidated with ETag |
| `CATALOG_MAX_AGE_DAYS` | `30` | A catalog older than this counts as stale |
| `SCAN_STORAGE_DIR` | `./data/scans` (image: `/data/scans`) | Where scan images are stored |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:4200` | Comma-separated origins |

## Layout

Package `com.pilescan`, one package per feature. Controllers are thin, logic lives in services,
persistence uses Spring's `JdbcClient` with Flyway migrations (`src/main/resources/db/migration`).

| Package | Responsibility |
| --- | --- |
| `scan` | upload, EXIF orientation, image storage, scan assembly (`RecognitionMapper` turns an inference response into detections) |
| `detection` | detections, corrections (add, patch, soft delete) |
| `inference` | HTTP client for `POST /v1/recognize` (snake_case contract) |
| `partmapping` | classifier ID to Rebrickable `part_num`, Rebrickable API client, unmapped tracking |
| `importer` | catalog import job, status, startup trigger |
| `catalog` | read access to parts and colors |
| `ranking` | `SetRankingStrategy`, `CoverageRankingStrategy`, `RarityWeightedRankingStrategy` (stub) |
| `common` | problem-details error handling, CORS |

## Decisions

### Plain JDBC instead of JPA
The catalog is bulk SQL (`COPY`, upserts, a 1.3M-row derived table) and the ranking is one aggregate
query; scans and detections are flat rows with two JSON columns. An ORM adds nothing here, and
`JdbcClient` keeps the SQL visible.

### Catalog import
Rebrickable publishes gzipped CSVs. Each file is streamed with PostgreSQL `COPY` into a temporary
all-text staging table named from the file header, then upserted with typed `INSERT ... ON CONFLICT`.
The whole import is one transaction: readers see the old catalog until the new one is complete, and a
failed run changes nothing. Staging by header name tolerates extra columns and reports a missing one clearly.

`inventory_parts` (1.5M rows) is never stored as such. During the import it is folded into
`set_part_quantities(part_num, color_id, set_num, quantity, img_url)`: latest inventory version per
set, spare parts excluded, 1.3M rows. Its primary key `(part_num, color_id, set_num)` is exactly the
access path of the ranking prefilter. `set_stats` holds each set's piece total and `parts.img_url`
borrows an image from the inventory (parts.csv has none). Downloads are cached and revalidated with
`ETag`/`Last-Modified`. Re-running is idempotent. Imports are single-flight; `POST` while running is a no-op.
Minifigure parts are not included (the CSV `inventory_minifigs` is not imported), so a set's piece total counts only loose parts.

### Part ID mapping
1. The same ID exists in `parts`: mapped directly (the common case, no network).
2. Cached answer in `part_id_mapping`, negative ones included. `NOT_FOUND` is rechecked after 7 days,
   `ERROR` after 1 hour.
3. Rebrickable API `GET /api/v3/lego/parts/?bricklink_id=<id>` (or `ldraw_id`) with `Authorization: key <KEY>`;
   calls are serialized, spaced by `REBRICKABLE_MIN_INTERVAL_MS`, and a `429` is retried once after `Retry-After`.
   Results are cached, and only part_nums that exist in the local catalog count as mapped.
4. Otherwise the ID is recorded in `unmapped_part_ids` (occurrences, last seen, last error), served at
   `GET /api/admin/unmapped-part-ids`. Without an API key step 3 is skipped and nothing is cached, so adding a key later just works.

A detection's current part is the best-scored candidate that could be mapped; `mappingStatus` is
`MAPPED`, `UNMAPPED` (candidates exist, none mapped) or `NONE` (classifier returned nothing).
`confidence = detection_score x part_score x color_score` using the chosen candidates, 1.0 once the user corrects or adds a piece.

### Set ranking: matchPercent
For pile `P` and a set inventory `S` (quantities per part+color; latest inventory version, no spare parts):

```
matched         = sum_k min(P[k], S[k])
pileCoverage    = matched / |P|            "how much of my pile is in this set"
setCompleteness = matched / |S|            "how much of this set I have"
matchPercent    = 100 * F1 = 100 * 2 * cov * comp / (cov + comp) = 100 * 2 * matched / (|P| + |S|)
```

Coverage alone ranks a 5000-piece set containing everything first; completeness alone ranks a
10-piece set first. F1, their harmonic mean, is high only when both are. It simplifies to the
Sørensen-Dice coefficient, which is why the SQL prefilter can order candidates by it directly: the
shortlist (200 sets sharing at least one part+color with the pile) already holds the exact top sets
and Java only needs the shortlist to compute the metrics. Ties: higher completeness, then newer year.
`missingParts` are the lines where `S[k] > P[k]`, largest shortfall first, capped by `missingLimit`;
`missingPieces = |S| - matched`. `MissingPart.part.imageUrl` prefers the image of that exact color.

`strategy=rarity-weighted` is a documented stub (`RarityWeightedRankingStrategy`) answering `501`; the
TF-IDF design is in its Javadoc and is reserved for the project owner.

### Scan images
The upload is validated by content (JPEG, PNG, WebP; 15 MB; 100 megapixels), the EXIF orientation is
baked into the pixels (JPEG is only re-encoded when it is not already upright), and that same
corrected image is stored and sent to inference, so boxes, stored image and UI share one coordinate
space. WebP is stored unchanged and its EXIF rotation is not applied (the JDK cannot decode WebP).
