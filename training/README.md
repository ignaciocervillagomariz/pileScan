# Training (planned, owned by the human maintainer)

Nothing here is implemented. The MVP uses a classical OpenCV detector and the Brickognize API
(see `docs/decisions/0003` and `0004`). This document describes the intended pipeline for
replacing those two components with models trained on synthetic data, so the work can start
without redesigning the service.

## Goal
- A **detector** that finds individual pieces, including touching ones, in cluttered real photos
  (the main weakness of `opencv-lab-v1`).
- A **part classifier** that does not depend on an external service and can be tuned to the
  parts and viewpoints this app sees.
- Color stays with the existing estimator. Part shape and color are separate problems
  (`docs/decisions/0005`), so labels carry both but models are trained separately.

## 1. Synthetic data
Real labeled photos of piles are expensive, so generate renders with free labels.

- **Part geometry**: LDraw library (`ldraw.org`). Part IDs map to Rebrickable through the part
  relations in the Rebrickable catalog. Choose a part list by frequency in official sets.
- **Rendering**: Blender (headless, `blender -b -P`) with an LDraw importer such as
  ImportLDraw (check the current Blender version compatibility first). Use Cycles on GPU or
  EEVEE for speed.
- **Scene**: a surface, N pieces (10 to 150) dropped with the Blender rigid-body simulation so
  poses are physically plausible, including touching and partly stacked pieces, then a camera
  looking down at 0 to 40 degrees.
- **Domain randomization**
  - backgrounds: plain colors, wood, fabric, paper, printed textures (PBR materials, HDRIs)
  - lighting: HDRI environment, 1 to 3 area lights, intensity, color temperature, hard to soft
    shadows
  - camera: position, focal length, tilt, noise, motion blur, JPEG compression, phone-like
    white balance shifts
  - materials: ABS gloss/roughness range, specular highlights, plausible Rebrickable colors
    (solid only for v1)
  - clutter: unrelated objects, dust, duplicate parts, pieces cut by the frame
- **Automatic labels** per render: instance masks (object index pass), tight bounding boxes
  derived from masks, LDraw part id, Rebrickable color id, visibility fraction (drop labels
  with less than about 25% visible). Export COCO and YOLO formats plus a manifest with the
  generator seed, so every image is reproducible.
- **Splits**: split by scene seed and by background/HDRI so the validation set does not share
  textures with training. Keep some parts entirely held out for an open-set check.

## 2. Models
- **Detector**: a YOLO-family instance or box detector (for example Ultralytics YOLO, mind its
  AGPL license for a public portfolio, or an Apache-licensed alternative such as RT-DETR
  implementations), single class "piece", trained on synthetic data at the target input size
  (about 960 px, because pieces are small in phone photos). Segmentation head preferred, since
  the color estimator wants a mask.
- **Part classifier**: crop classifier or metric-learning embedding (backbone such as a small
  ConvNeXt/EfficientNet, ArcFace-style loss, nearest neighbor over per-part reference
  embeddings). The embedding variant lets new parts be added without retraining. Train on
  crops taken from the same renders with random padding and jitter, so they match what the
  detector produces at inference.

## 3. Real-photo fine-tuning
Synthetic-to-real gap is the main risk.
- Photograph 100 to 300 real piles (several tables, lights, phones), annotate with a tool such
  as CVAT or Label Studio (boxes, optionally masks, part and color per box). Pre-label with the
  current pipeline to speed this up, then correct.
- Fine-tune both models on a mix of synthetic and real data (start with about 50/50, lower the
  learning rate, freeze early layers), keeping a real-only held-out test set that is never
  trained on.
- Log mistakes users correct in the app (the backend stores corrections) as a source of hard
  examples, only with the user's consent.

## 4. Evaluation
- **Detector**: mAP@0.5 and mAP@[.5:.95], recall at fixed precision, count error per image
  (the quantity the app actually needs), split by clutter level, touching vs isolated, and
  background type. Compare against `opencv-lab-v1` and report on the same real test set.
- **Part classifier**: top-1 and top-3 accuracy (the UI shows 3 candidates), per-part confusion
  matrix with attention on near-identical parts (plate 1x2 vs tile 1x2), calibration (ECE),
  and the same metrics against Brickognize on identical crops.
- **End to end**: set-ranking quality in the backend (is the true set in the top 5 for a pile
  from a known set), plus latency per image on CPU, since the service runs without a GPU.

## 5. Plugging into the service
The inference service never imports training code. Training exports artifacts (ONNX preferred,
which keeps the runtime CPU-only and light with `onnxruntime`), and thin adapters live in
`/inference`:

- `Detector` (`inference/src/pilescan_inference/domain.py`): `detect(image_bgr) -> list[RawDetection]`
  with bbox in original pixels, a score and a boolean mask of bbox size. A YOLO adapter loads
  the ONNX file, letterboxes, runs NMS and maps boxes back.
- `PartClassifier`: `async classify(crop) -> list[PartCandidate]` (top 3, `id_system` set to
  `ldraw` or `rebrickable` depending on the label space, which the contract already allows).
- Register each adapter in `inference/src/pilescan_inference/registry.py` under a new name and
  select it with `DETECTOR=yolo` or `PART_CLASSIFIER=custom`. The response contract does not
  change. The versioned `name` string recorded with every scan makes A/B comparison and
  rollback straightforward.

## Suggested layout when work starts
```
training/
  render/      Blender scripts, part lists, randomization configs
  datasets/    export (COCO/YOLO), split manifests (data itself stays out of git)
  detector/    training and export scripts
  classifier/  training and export scripts
  eval/        metrics, real test set definition
```
Datasets and weights are large: keep them out of git (DVC or a bucket) and record the dataset
version and seed with each trained model.
