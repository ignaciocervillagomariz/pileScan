# ADR 0009: Detector preprocessing and background model (`opencv-lab-v2`)

- Status: Accepted (defaults provisional)
- Date: 2026-11-03
- Supersedes the detector details of ADR 0004 (the classical, training-free approach stays).

## Context
With real photos the app detected zero pieces. `opencv-lab-v1` had only been tested on
synthetic scenes. Evidence from running the 13 photos in `fixtures/real/` (third-party web
images, git-ignored) through v1, with intermediate artifacts saved to `inference/debug/`:

- Decoding was not the cause. Pillow 13 decodes JPEG, PNG, WebP and AVIF in the current
  environment; all 13 files decoded. HEIC was the only gap (now `pillow-heif`).
- The Otsu threshold, halved and clamped to [5, 8] dE, always sat at the 8 dE ceiling. On
  backgrounds that are not plain (wood, carpet, paper, soft shadows) 36 to 79 % of the image
  passed it (e.g. s-l400-2: 79 %, images-4: 53 %, are-these: 54 %).
- The closing kernel (side/100, 8 px at 800 px) then bridged the pieces and their shadows, so
  `RETR_EXTERNAL` returned one huge blob (area 0.38 to 0.79 of the image). The max-area filter
  (0.25) dropped it: zero detections for colourful-lego-bricks, s-l400-2 and the banner.
- The detections that did appear were mostly merged piles (1 of about 10 bricks, 2 of about 40
  pieces on images-4).
- Shadows were only handled by a lightness weight of 0.8, too weak for soft shadows on white.
- The 3 % border plane could not follow wood grain or vignetting, and tiny thumbnails
  (194x225) were not upscaled, so kernels and area limits were meaningless.

## Decision
Keep a classical detector but change what it assumes (`opencv-lab-v2`):

1. Normalize: decode (Pillow, plus `pillow-heif` if present), EXIF transpose, RGB, process at a
   fixed long side (1280, downscale; upscale to at least 640), boxes and masks scaled back to
   input pixels. Area thresholds, kernels and the border ring are relative to the image.
   Alpha: transparent pixels are composited onto white (not black, which is what a naive
   RGBA to RGB conversion gives), matching the frontend's flatten. `lego-brand-banner.png` is
   RGBA: v1 gave 0 detections on the raw file and 3 after a black flatten.
2. Background: a smooth field in LAB grown from the border ring by normalized convolution over
   pixels that stay within a few noise levels of the model (limit `clip(4 x ring noise, 5, 15)`
   dE), so gradients and vignetting are absorbed while pieces, including white-on-light ones,
   are not.
3. Distance with lightness down-weighted when darker (0.35), plus a shadow test (darker, same
   chroma). Threshold = Otsu/2 clamped to `[max(6, 4 x background noise), 9]`: it adapts to
   textured surfaces through the noise term only, instead of one fixed number.
4. Small morphology (close side/300). Merged blobs are split by high-contrast cores with a
   watershed (shadows and contact zones are less contrasted than pieces), then by a
   distance-transform watershed for oversized or non-convex blobs.
5. Out-of-distribution guard: foreground above 0.8 returns no detections and the warning
   `background not uniform: no pieces detected`. Wood, carpet and paper are in scope; the
   guard fired on none of the 13 photos (the black banner has 64 % foreground and is not
   rejected).
6. All parameters are `DETECTOR_*` env variables (pydantic-settings), documented in
   `inference/README.md`. The detector name is bumped so scans record the version.

Parameter sweep (one parameter at a time around the defaults, 13 photos, detection counts only
since there is no ground truth yet): `threshold_min/max` 6..14, `l_weight_darker` 0.2..0.8,
`close_fraction` 0..1/150, `noise_k` 0..6, `shadow_chroma_max` 0..10, `long_side` 800..1600,
`watershed_solidity` 0.7..0.95. Findings: close_fraction above 1/300 merges piles (counts
fall 40 to 70 %); a higher `l_weight_darker` brings shadows back and merges; `long_side` has
little effect above 1000; `noise_k` 3 to 4 is a plateau; the threshold ceiling must stay near
9 dE or white-on-light pieces vanish (an existing synthetic test pins this). Chosen values are
the middle of the plateaus, with the noise-adaptive threshold floor as the principled part.

## Alternatives
- **Keep v1 and only raise the threshold:** fixes wood but loses low-contrast pieces; a
  single number cannot serve both.
- **GrabCut or graph-based segmentation:** slow, needs initialization, same merge problem.
- **Pretrained segmenter (SAM-like) or YOLO:** better on piles but heavy on CPU or needs
  data; reserved for the training track (`training/README.md`).
- **Per-photo tuning:** rejected, with 13 photos it would only overfit.

## Consequences
- Real photos now give pieces instead of zero (per-image counts in the sprint report).
- Counts are not accuracy: dense piles still merge touching pieces and assembled models stay
  one detection; white or light-gray pieces on light backgrounds are still missed (a synthetic
  low-contrast test is an `xfail` that records this).
- Main risk to verify: over-segmentation. Dense photos give 79 (are-these), 114 (d28b) and 76
  (images-4) detections, to be compared with ground-truth counts. The `detect` log line has
  `median_area_fraction` and `blobs_split` so QA can spot fragmentation.
- Assembled builds (il_1588, a brick duck) are treated as one object by design.
- Defaults are provisional: the tuning set is tiny (13 web photos plus synthetic scenes). They
  should be revisited when real phone photos and ground-truth counts exist (QA eval harness).
- Processing costs 20 to 160 ms per photo on CPU; HEIC adds about 10 MB to the image.
- Contract 1.1.0 gains `timings_ms.preprocess` and a per-detection `classification_status`;
  classifier failures never erase detections.
