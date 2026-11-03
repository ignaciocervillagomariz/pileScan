# Real-photo ground truth

The photos in this folder are third-party web images. They are git-ignored; never commit them.
The three CSVs are tracked and are filled in by the owner. The eval (`/eval`) reads them.
Do not invent labels: leave a cell empty when you are not sure.

## counts.csv (required)

`image,total_pieces,ood`

- `image`: exact file name (one row per file, already pre-filled). One name starts with `-`.
  Keep it as is.
- `total_pieces`: how many pieces you can see in the photo. Empty means "not labelled yet" and the
  image is skipped for count metrics.
- `ood`: put `1` for images that are out of distribution (not a pile photo). They are excluded
  from the metrics but still listed in the report. Pre-set: `lego-brand-banner.png` (a banner).

## ground-truth.csv (optional, per photo)

`image,part_num,color,quantity`

One row per (part, color) in a photo. Only label a photo completely (every piece), otherwise
precision/recall are meaningless; photos with no rows are skipped for part metrics.

- `part_num`: Rebrickable part number (for example `3001`, `3020`, `3068b`). Look it up at
  rebrickable.com/parts.
- `color`: color name exactly as returned by `GET /api/colors` (Rebrickable names, for example
  `Red`, `Light Bluish Gray`, `Dark Bluish Gray`).
- `quantity`: how many of that part in that color.
- Lines starting with `#` are comments.
- If the sum of quantities differs from `total_pieces`, the eval warns.

## sets.csv (optional)

`image,set_num`

Only for a photo of ONE complete, known set. `set_num` is the Rebrickable set number including the
version suffix, for example `10698-1`.

## What counts as a piece

One physical element: a 2x4 brick is one piece, a minifigure torso, legs and head are three
pieces, a tile is one. Count pieces that are mostly visible, including partly overlapping ones if you
can tell what they are. Do not count pieces that are fully hidden under others, boxes, baseplates
the pieces sit on, or printed pictures of bricks.

## Out-of-distribution and special images

- `lego-brand-banner.png`: a banner, not a pile (`ood=1`).
- Tiny thumbnails (`s-l225.jpg`, `images-5.jpeg`, `il_570xN...`): realistic but low resolution, they
  stay in the metrics and are flagged in the report.
- Listing photos (`il_*`, `s-l*`, `images-*`): sellers' photos with clean backgrounds; they stay in
  the metrics.
- Set-box or assembled-model photos, if any: mark `ood=1`.
- Several files are AVIF/WebP; the eval decodes them (the backend only accepts JPEG/PNG/WebP, so the eval
  converts to JPEG like the frontend does).
