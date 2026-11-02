# ADR 0005: Separate shape (part) recognition from color estimation

- Status: Accepted
- Date: 2026-11-02

## Context
A set inventory line is (part, color, quantity). Part classifiers such as Brickognize identify
the mould. Color depends on lighting and white balance, and the part × color space (~60k
parts × ~250 colors) is far too sparse to learn jointly.

## Decision
Classify the part from the crop's shape, and estimate color independently: k-means in LAB over
the piece mask, ignoring background and specular highlights, then the nearest Rebrickable solid
color by CIEDE2000, returned as the top-3 with the measured RGB.

## Alternatives
- **Joint part+color classifier:** combinatorial label space and data hunger.
- **Mean RGB + Euclidean distance:** simple, but it is skewed by highlights and shadows and is
  perceptually poor (similar greys and tans get confused).
- **Rely on the classifier's color output:** not every classifier provides one, and it would
  couple both concerns to one vendor.

## Consequences
- Each half can improve or be replaced on its own (e.g. a color-calibration card later).
- Transparent and metallic colors are out of v1 scope (solid palette only), which is a known
  limitation.
- The UI offers top-3 color swatches, because near-duplicate colors (Dark Bluish Grey vs.
  Black under dim light) are the most common correction.
