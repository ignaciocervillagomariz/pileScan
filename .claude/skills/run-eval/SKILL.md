---
name: run-eval
description: Run the PileScan accuracy eval on the real photos and compare against a previous run. Use after any detector, classifier or color change, or to produce baseline numbers.
argument-hint: "[label] [compare-to-label]"
---

# Run the eval

Arguments: label `$0`, compare against `$1` (optional). Full docs: `eval/README.md`.

1. **Labels exist?** Count rows with a value in `total_pieces` in `fixtures/real/counts.csv`.
   If none, stop: tell the human that accuracy needs their labels and point them to
   `fixtures/real/README.md`. Never invent labels.
2. **Stack:** the services must run with the configuration you want to measure. Check which
   classifier is active with `curl -s http://localhost:8000/health`. Announce that you're
   using the shared stack.
3. **Classifier budget:** with `PART_CLASSIFIER=brickognize`, only run a full set when
   `ground-truth.csv` has part labels; otherwise run with `stub` (counts only).
4. **Run** (sequential, writes to the git-ignored `eval/out/$0/`):
   ```bash
   cd eval && uv sync
   uv run pilescan-eval run --label $0 \
     --inference-url http://localhost:8000 --api-url http://localhost:4200 \
     --sha $(git rev-parse --short HEAD) --note "<classifier and config>"
   ```
5. **Report** (no network; recomputed from the cache):
   ```bash
   uv run pilescan-eval report $1 $0
   ```
6. **Explain** the numbers: count MAE and % exact, part/color precision and recall where
   labelled, set top-1/top-5, latency. Name the 2–3 worst images and why.
7. If you own `docs/eval/` (qa), update `docs/eval/baseline.md`; otherwise send the table to
   `qa`.
