# ADR 0003: Swappable vision pipeline (Detector / PartClassifier / ColorEstimator)

- Status: Accepted
- Date: 2026-11-02

## Context
v1 uses a classical detector and a free third-party classifier. The roadmap replaces both with
our own models trained on synthetic data. Those replacements must not ripple into the backend,
the frontend or the contract.

## Decision
The inference service composes three interfaces: `Detector` (image → regions + masks),
`PartClassifier` (crop → top-k parts with an ID system) and `ColorEstimator` (pixels + mask →
top-k Rebrickable colors + measured RGB). Implementations are chosen by env vars (`DETECTOR`,
`PART_CLASSIFIER`, `COLOR_ESTIMATOR`) through a registry. Each response reports the versioned
component names (`pipeline`), and the backend stores them per scan.

## Alternatives
- **One end-to-end model** (detector that also predicts part and color): fewest calls, but it
  needs training data we don't have yet and can't be upgraded piece by piece.
- **Hard-wired v1 code:** faster to write, but every upgrade would mean a rewrite.

## Consequences
- YOLO or a custom classifier becomes a new class + config value. A/B comparisons become
  possible because scans record the pipeline.
- `id_system` is part of the contract, so classifiers in other ID namespaces (BrickLink,
  Rebrickable, LDraw) plug in without changes. The backend owns the mapping.
- A small abstraction cost in the v1 code.
