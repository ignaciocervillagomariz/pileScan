# Baseline evaluation, sprint 2

Status: **detector comparison (v1 vs v2) only. Accuracy is not measured yet**, because the owner has not
filled `fixtures/real/counts.csv` (count error), `ground-truth.csv` (part and color precision/recall)
or `sets.csv` (set ranking). Every accuracy row below is therefore empty ("–"). The harness is ready:
once the CSVs are filled, `uv run pilescan-eval report before-stub after-stub` (in `/eval`) recomputes
everything from the cached raw outputs without re-running anything.

## What changed

| label | code | detector | part classifier | path |
|---|---|---|---|---|
| before-stub | main 9920898 | opencv-lab-v1 | stub | inference only (`:8100`, standalone container) |
| before-bkg | main 9920898 | opencv-lab-v1 | Brickognize | inference (`:8101`) + full API |
| after-stub | HEAD 1d22d43+ | opencv-lab-v2 | stub | inference (`:8000`) + full API through nginx |
| after-bkg | same | opencv-lab-v2 | Brickognize | inference + full API, **3 photos only** (see caveats) |

## Summary: what we can already say

- v1 found almost nothing on real photos (0 on three photos, one of them the OOD banner; 1 on three; 10 on the two best). v2 finds
  pieces on every pile photo (3 to 114 per photo), at lower mean latency (137 ms vs 219 ms total with the stub).
- v2 over-segments: boxes on rulers, plastic bags, printed text, shadows, and some merged boxes that cover several
  pieces. Counts above are *detections*, not accuracy. Whether v2 over- or under-counts can only be
  stated with ground truth.
- Count depends on the input encoding: the same photo gives different counts raw vs re-encoded as the
  frontend does (e.g. images-4: 76 raw, 82 via the API, s-l400-2: 43 vs 38). The API column is what users get.
- The synthetic sanity set is 5/5 exact before and after (no regression).
- With Brickognize, classify time dominates: mean 3.1 s per photo for 21 to 82 crops
  (about 270 ms for v1, which only found 2 to 5 crops). A dense photo with about 80 detections
  takes several seconds even with the cache warm.

## Summary tables

### Real photos (13 pile photos + 1 OOD banner), stub classifier

| metric | before-stub | after-stub |
|---|---|---|
| images (OOD excluded) | 14 (1 OOD) | 14 (1 OOD) |
| count n labelled | 0 | 0 |
| count MAE (inference) | – | – |
| count bias (pred - true) | – | – |
| exact count % | – | – |
| within ±1 % | – | – |
| count MAE (API) | – | – |
| images with 0 detections | 2 | 0 |
| failed requests | 0 | 0 |
| part P / R (top-1) | – | – |
| part R (top-3) | – | – |
| color P / R | – | – |
| part+color P / R | – | – |
| part metrics: n images | 0 | 0 |
| set top-1 / top-5 % (n) | – | – |

Latency in ms: mean (p50 / p90; percentiles only when n>=5).

| stage | before-stub | after-stub |
|---|---|---|
| inference preprocess | – | 28 (3 / 71) |
| inference detect | 164 (57 / 463) | 65 (60 / 88) |
| inference classify | 0 (0 / 0) | 0 (0 / 1) |
| inference color | 12 (6 / 30) | 29 (14 / 49) |
| inference total | 219 (72 / 594) | 137 (81 / 241) |
| inference HTTP wall | 234 (81 / 650) | 143 (84 / 266) |
| API POST /api/scans | – | 169 (112 / 362) |
| GET set-candidates | – | 122 (31 / 127) |

### Synthetic sanity set (5 images, exact counts from the manifest), stub classifier

| metric | before-stub | after-stub |
|---|---|---|
| images (OOD excluded) | 5 (0 OOD) | 5 (0 OOD) |
| count n labelled | 5 | 5 |
| count MAE (inference) | 0.00 | 0.00 |
| count bias (pred - true) | +0.00 | +0.00 |
| exact count % | 100 | 100 |
| within ±1 % | 100 | 100 |
| count MAE (API) | – | 0.00 |
| images with 0 detections | 0 | 0 |
| failed requests | 0 | 0 |

Latency in ms: mean (p50 / p90; percentiles only when n>=5).

| stage | before-stub | after-stub |
|---|---|---|
| inference preprocess | – | 4 (4 / 6) |
| inference detect | 50 (48 / 61) | 69 (70 / 73) |
| inference classify | 0 (0 / 0) | 0 (0 / 0) |
| inference color | 28 (15 / 58) | 9 (9 / 13) |
| inference total | 90 (69 / 133) | 86 (84 / 94) |
| inference HTTP wall | 101 (94 / 139) | 90 (87 / 99) |
| API POST /api/scans | – | 116 (111 / 131) |
| GET set-candidates | – | 24 (17 / 40) |

### Brickognize classifier, 3 photos only (s-l225 small, images-6 medium, images-4 dense)

| metric | before-bkg | after-bkg |
|---|---|---|
| images (OOD excluded) | 3 (0 OOD) | 3 (0 OOD) |
| count n labelled | 0 | 0 |
| count MAE (inference) | – | – |
| count bias (pred - true) | – | – |
| exact count % | – | – |
| within ±1 % | – | – |
| count MAE (API) | – | – |
| images with 0 detections | 0 | 0 |
| failed requests | 0 | 0 |
| part P / R (top-1) | – | – |
| part R (top-3) | – | – |
| color P / R | – | – |
| part+color P / R | – | – |
| part metrics: n images | 0 | 0 |
| set top-1 / top-5 % (n) | – | – |

Latency in ms: mean (p50 / p90; percentiles only when n>=5).

| stage | before-bkg | after-bkg |
|---|---|---|
| inference preprocess | – | 7 |
| inference detect | 23 | 84 |
| inference classify | 266 | 3148 |
| inference color | 4 | 32 |
| inference total | 296 | 3286 |
| inference HTTP wall | 300 | 3292 |
| API POST /api/scans | 344 | 3038 |
| GET set-candidates | 30 | 96 |

## Per image

`true` is `?` for all real photos until the owner labels them. `*` = out of distribution (banner, excluded from metrics).

### Per image: detections (inference on the raw file / API on the re-encoded JPEG)

`true` = counts.csv / manifest; per label: inference count / API count. `*` = OOD (excluded), `j` = inference run on the re-encoded JPEG.

| set | image | size | true | before-stub | after-stub |
|---|---|---|---|---|---|
| real | are-these-pieces-part-of-a-set-v0-jqouj4h6yzvg1.jpeg.webp | 640x853 | ? | 10 | 79/82 |
| real | colourful-lego-bricks-scattered-1024x680.jpg | 1024x680 | ? | 0 | 6/6 |
| real | d28b68d5-34f8-425c-afa4-3e36f3f8fea3.jpg.webp | 3840x3840 | ? | 9 | 114/121 |
| real | fullsizeoutput_2b56.jpeg | 4032x2758 | ? | 6 | 25/26 |
| real | il_1588xN.5584711689_6ufn.jpg.avif | 1588x1073 | ? | 1 | 1/1 |
| real | il_570xN.3625137732_hgdg.jpg.avif | 570x428 | ? | 1 | 44/42 |
| real | images-4.jpeg | 575x533 | ? | 2 | 76/82 |
| real | images-5.jpeg | 640x480 | ? | 4 | 3/3 |
| real | images-6.jpeg | 640x480 | ? | 5 | 22/21 |
| real | lego-brand-banner.png* | 1470x270 | ? | 0 | 3/3 |
| real | -original-11045-alt16.jpg-convert-1920x1280.avif | 1920x1080 | ? | 10 | 8/8 |
| real | s-l225.jpg | 194x225 | ? | 2 | 34/33 |
| real | s-l400-2.jpg | 261x400 | ? | 0 | 43/38 |
| real | s-l400.jpg | 300x400 | ? | 1 | 8/7 |
| synthetic | pile_dark_8.jpg | 1200x900 | 8 | 8 | 8/8 |
| synthetic | pile_exif_rotated_6.jpg | 900x1200 | 6 | 6 | 6/6 |
| synthetic | pile_gradient_12.jpg | 1600x1200 | 12 | 12 | 12/12 |
| synthetic | pile_light_5.jpg | 1200x900 | 5 | 5 | 5/5 |
| synthetic | pile_single_1.jpg | 900x900 | 1 | 1 | 1/1 |

## Failure examples (after-stub, boxes = detections)

Thumbnails are local only (`docs/eval/img/` is git-ignored until the image-rights check). Regenerate with
`uv run pilescan-eval annotate after-stub <file>`.

1. **False positives and a huge merged box: `s-l400-2.jpg`** (`docs/eval/img/s-l400-2.jpg.after-stub.jpg`).
   v1: 0 detections, v2: 43. The sorting mat with a ruler on the left edge yields boxes on the ruler, and one large
   box covers the whole lower-left pile of touching bricks.
2. **Packaging and text counted as pieces: `images-4.jpeg`** (`docs/eval/img/images-4.jpeg.after-stub.jpg`).
   Bricks on wood are well separated, but the plastic bag and its printed numbers at the bottom
   and a strip on the right edge produce about 10 extra boxes. Raw 76 vs 82 through the API.
3. **Touching pieces merged: `colourful-lego-bricks-scattered-1024x680.jpg`**
   (`docs/eval/img/colourful-lego-bricks-scattered-1024x680.jpg.after-stub.jpg`).
   v1: 0 detections. v2: 6 boxes for what looks like 9 bricks by eye (not ground truth): yellow, green
   and orange are merged into two large boxes.
4. **Dense pile over-segmented and under-segmented at once: `d28b68d5-...jpg.webp`** (114 detections;
   `docs/eval/img/d28b68d5-34f8-425c-afa4-3e36f3f8fea3.jpg.webp.after-stub.jpg`). Large plates are single boxes,
   but in the dense center many boxes cover fragments or clusters; tiny boxes are probably studs or shadows.
5. **Assembled model, not a pile: `il_1588xN...avif`** (1 detection, `docs/eval/img/il_1588xN.5584711689_6ufn.jpg.avif.after-stub.jpg`). One box
   for the whole model. This kind of image is out of distribution for a pile scanner.

Also: `lego-brand-banner.png` (RGBA) returned 0 detections with v1 on the raw file; v2 and the frontend flatten
transparency on white and it now yields 3 detections. It is excluded from metrics as OOD.

## Method

- Inputs: the 14 files in `fixtures/real/` (third-party web photos, git-ignored; AVIF, WebP, JPEG, PNG; several are
  tiny listing thumbnails) and the 5 synthetic piles in `fixtures/images/`.
- (a) Inference: `POST /v1/recognize?debug=true` with the raw file. (b) Public API: decode, EXIF-orient,
  downscale to 2048 px long side, JPEG q90 (what the frontend does), `POST /api/scans`, then
  `GET set-candidates?limit=20`. All requests sequential.
- Metrics (definitions in `eval/README.md`): count MAE, bias, exact %, within ±1 against counts.csv;
  part, color and part+color precision/recall by multiset matching, top-1 per detection, plus top-3 part recall;
  set ranking top-1/top-5/MRR; latency per stage (mean, p50/p90 when n >= 5).
- Stub classifier: deterministic, no network; its part and color-pair outputs say nothing about
  recognition quality. Only detection counts and latency are meaningful for stub runs. Color estimation
  is the real estimator in all runs.
- Raw outputs: `eval/out/<label>/` (git-ignored); metrics are recomputed from them.

## Caveats

- n is small (13 pile photos), so means are noisy, p50/p90 are indicative only, and differences between
  runs of a few percent mean nothing.
- Web photos (listings, forum posts), not phone photos of a real pile. Several are tiny thumbnails and
  several have studio backgrounds, so results will not transfer directly to the real use case.
- Ground truth will come from the owner by hand, so it carries the owner's judgment calls on hidden or
  ambiguous pieces.
- The Brickognize run covers 3 photos only, because v2 produces about 470 crops over the whole set and Brickognize is a
  free third-party service, and because there are no part labels yet to compute precision/recall.
  Its latency depends on network, on their service, and on the inference cache (the API call repeats crops the
  direct inference call already classified). To run the full pass once part labels exist:
  `cd eval && uv run pilescan-eval run --label after-bkg-full --inference-url http://localhost:8000 --api-url http://localhost:4200`
  with the stack on the default (Brickognize) config, then `uv run pilescan-eval report before-bkg after-bkg-full`.
  (`--only` restricts to named files; omitted = all photos.)
- before-stub has no API path, so there is no API baseline with the stub classifier.
- The before API run used the pre-change backend; the after run uses the sprint 2 backend and frontend preprocessing is mimicked, not executed, by the eval.
