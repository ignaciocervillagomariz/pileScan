# ADR 0007: Set ranking score (F1), catalog import and persistence split

- Status: Accepted
- Date: 2026-11-02
- Refines: [ADR 0006](0006-set-ranking-strategy.md)

## Context
PileScan ranks official sets for a pile of identified pieces (part+color quantities). Ranking on
**pile coverage** (`matched/|pile|`) alone favours huge sets that contain everything. Ranking on
**set completeness** (`matched/|set|`) alone favours tiny sets. The Rebrickable catalog has about
1.5M inventory lines, and it must load idempotently and quickly without readers ever seeing a
half-imported catalog.

## Decision
- **Score:** `matchPercent = 100 × F1(pileCoverage, setCompleteness) = 100 × 2·matched / (|pile| + |set|)`,
  where `matched = Σ min(pileQty, setQty)` over (part, color). It uses the latest inventory
  version per set and excludes spare parts. Ties break on higher completeness, then the newer
  year.
- **Shortlist:** F1 equals the Sørensen–Dice coefficient, so SQL can order candidates by it
  exactly. The 200-set shortlist cannot drop a set that belongs in the top N, which ordering by
  raw `matched` could do with small, fully contained sets. Java only post-processes the
  shortlist: tie-breaks and missing parts.
- **Missing parts:** the (part, color) lines where `setQty > pileQty`, largest shortfall first,
  capped by `missingLimit`.
- **Import:** stream each gzipped CSV with PostgreSQL `COPY` into a temp staging table, then
  upsert with `ON CONFLICT`. `inventory_parts` is folded into a derived `set_part_quantities`
  table keyed by (part_num, color_id, set_num), which is the ranking access path, plus
  `set_stats`. Everything runs in one transaction, so readers keep the old catalog until the
  new one is complete and a failed run changes nothing. Downloads are cached and revalidated
  by ETag. A full import takes about 15 s locally.
- **Persistence split by workload:**
  - **Spring Data JPA** (Hibernate, `ddl-auto=validate`, Flyway owns the schema) models the
    transactional `Scan` aggregate with its `Detection`s and the part-ID mapping cache.
  - **JdbcClient + COPY** handle the catalog import, catalog reads and the ranking aggregate,
    where bulk set-based SQL beats an ORM.
  - Entities stay package-private to their feature, and repositories expose immutable
    records.
  - Counters that concurrent requests update (unmapped-ID occurrences, the mapping cache) are
    atomic native upserts, not read-modify-write entity updates.

## Alternatives
- Coverage-only or completeness-only scores: they produce degenerate rankings (see Context).
- Arithmetic mean: a huge set with perfect coverage still scores above 50.
- Rarity/TF-IDF weighted score: kept as `RarityWeightedRankingStrategy`, a stub that returns
  501 and is reserved for the human owner.
- JPA for everything, including row-by-row catalog inserts: minutes instead of seconds, and awkward set-based ranking SQL.
- JDBC for everything: works, but hand-maps the scan aggregate that JPA models naturally.
- A materialized view: it needs a full refresh anyway and brings no transactional-swap benefit.

## Consequences
- Rankings are explainable. The UI shows both metrics, and the score is the harmonic mean
  between them.
- Scores are unweighted, so common bricks inflate matches. The rarity strategy is the planned
  fix.
- The raw `inventory_parts` table is not kept, only its latest-version, non-spare aggregate.
  Minifigure inventories (`inventory_minifigs`) are not imported, so set totals exclude
  minifig parts.
