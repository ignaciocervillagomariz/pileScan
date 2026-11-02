# ADR 0006: Set ranking behind a `SetRankingStrategy` interface

- Status: Accepted
- Date: 2026-11-02

## Context
"Which sets do these pieces come from?" has no single correct scoring. A pile can be a full set,
a partial set or a mix. Common parts (1x2 bricks in black) appear in thousands of sets and drown
out the informative ones. We want a transparent baseline now and room to experiment.

## Decision
The backend ranks through a `SetRankingStrategy` interface, selected per request
(`?strategy=`).
- **`CoverageRankingStrategy` (baseline, implemented):** an SQL prefilter keeps sets sharing at
  least one (part, color) with the pile, using the latest inventory version and no spares. Then
  it scores multiset overlap: `matched = Σ min(pile, set)`, and reports `pileCoverage =
  matched/|pile|` ("pile pieces found in set") and `setCompleteness = matched/|set|`. The
  combined `matchPercent` is documented in `backend/README.md`.
- **`RarityWeightedRankingStrategy` (documented stub, HTTP 501):** TF-IDF-style weighting where
  rare part+color combinations count more. It is reserved for the human owner to implement.

## Alternatives
- **Hard-coded single formula:** simpler, but experiments would require code surgery.
- **Learned ranking:** no labeled pile→set data yet.
- **Jaccard on part sets only (ignoring color/quantity):** weak signal and many ties.

## Consequences
- The two metrics are shown separately, so users understand *why* a set ranks high (e.g. "all
  your pieces are in it" vs. "you have most of it").
- New strategies plug in without API changes. The API already exposes the `strategy` enum.
- The baseline is biased toward large sets with common parts. That is the gap the rarity
  strategy addresses.
