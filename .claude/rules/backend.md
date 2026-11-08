---
paths:
  - "backend/**"
---

# Backend (Spring Boot)

- No CORS configuration. The browser only talks to nginx (same origin) and Spring trusts the
  forwarded headers (`server.forward-headers-strategy=framework`). See ADR 0008; keep the
  Origin-host regression ITs.
- Keep `Security.setProperty("networkaddress.cache.negative.ttl", "0")` at the start of
  `main` (BUG-2). On JDK 21, `java.security` overrides `-Dsun.net.inetaddr.negative.ttl`, so a
  JVM flag doesn't work.
- Ranking (ADR 0007): `matchPercent = 100 × F1 = 100 × 2·matched / (|pile| + |set|)`. The SQL
  shortlist of 200 sets is ordered by the same value, so the top N is exact. Ties break on
  completeness, then the newer year.
- `inventory_parts` is folded into `set_part_quantities` (latest inventory version, no spares)
  plus `set_stats`. Minifig parts are not counted.
- `RarityWeightedRankingStrategy` is a stub returning 501: **reserved for the owner**.
- `confidence = detection_score × top part score × top color score`; 1.0 for corrected or
  manual pieces.
- Persistence split (ADR 0007): JPA for the scan aggregate and the part-ID mapping; JDBC and
  PostgreSQL `COPY` for the catalog, import status and ranking. `ddl-auto=validate`,
  `open-in-view=false`; Flyway owns the schema.
- Concurrent counters (unmapped IDs, mapping cache) use native `ON CONFLICT` upserts.
- Part-ID mapping: identical IDs map directly, then the `part_id_mapping` cache, then the
  Rebrickable API (rate-limited). Not tested against the live API yet.
- WebP is stored without EXIF transpose (ImageIO can't read WebP).
- The debug JPEG is stored per scan under `/data/scans`; watch disk use.
- No global Maven: use `./mvnw`. `./mvnw test` runs unit tests; `./mvnw verify` adds the
  Testcontainers ITs and needs Docker running.
