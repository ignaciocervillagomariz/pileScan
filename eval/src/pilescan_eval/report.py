"""Markdown report from saved raw outputs (side-by-side for several labels)."""
from __future__ import annotations

import json

from .common import OUT_DIR
from .metrics import compute, load_ground_truth


def f(x, spec=".2f"):
    return "–" if x is None else format(x, spec)


def _pr(m):
    return "–" if not m else f"{f(m['precision'])} / {f(m['recall'])}"


def _lat(s):
    if not s or not s.get("n"):
        return "–"
    t = f"{s['mean']:.0f}"
    if "p50" in s:
        t += f" ({s['p50']:.0f} / {s['p90']:.0f})"
    return t


def report(labels: list[str]) -> str:
    gt = load_ground_truth()
    res = {l: compute(l, gt) for l in labels}
    for l, r in res.items():
        (OUT_DIR / l / "metrics.json").write_text(json.dumps({"run": r["run"], "summary": r["summary"], "rows": r["rows"]}, indent=1, default=str))
    out: list[str] = []
    out.append("## Runs\n")
    out.append("| label | git | inference pipeline | note |\n|---|---|---|---|")
    for l, r in res.items():
        p = (r["run"].get("inference_health") or {}).get("pipeline", {})
        pl = ", ".join(f"{k}={v}" for k, v in p.items())
        out.append(f"| {l} | {r['run']['git_sha']} | {pl} | {r['run'].get('note','')} |")
    for set_name, title in (("real", "Real photos"), ("synthetic", "Synthetic fixtures (sanity set)")):
        out.append(f"\n## {title}: summary\n")
        out.append("| metric | " + " | ".join(labels) + " |\n|---|" + "---|" * len(labels))

        def line(name, fn):
            out.append(f"| {name} | " + " | ".join(fn(res[l]["summary"][set_name]) for l in labels) + " |")

        line("images (OOD excluded)", lambda s: f"{s['n_images']} ({s['n_ood']} OOD)")
        line("count n labelled", lambda s: str(s["count_inference"].get("n", 0)))
        line("count MAE (inference)", lambda s: f(s["count_inference"].get("mae")))
        line("count bias (pred - true)", lambda s: f(s["count_inference"].get("bias"), "+.2f"))
        line("exact count %", lambda s: f(s["count_inference"].get("exact_pct"), ".0f"))
        line("within ±1 %", lambda s: f(s["count_inference"].get("within1_pct"), ".0f"))
        line("count MAE (API)", lambda s: f(s["count_api"].get("mae")))
        line("images with 0 detections", lambda s: str(s["zero_detections"]))
        line("failed requests", lambda s: str(s["errors"]))
        if set_name == "real":
            line("part P / R (top-1)", lambda s: _pr(s.get("part")))
            line("part R (top-3)", lambda s: f((s.get("part_top3") or {}).get("recall")))
            line("color P / R", lambda s: _pr(s.get("color")))
            line("part+color P / R", lambda s: _pr(s.get("partcolor")))
            line("part metrics: n images", lambda s: str((s.get("part") or {}).get("n_images", 0)))
            line("set top-1 / top-5 % (n)", lambda s: "–" if not s.get("sets") else f"{s['sets']['top1']:.0f} / {s['sets']['top5']:.0f} ({s['sets']['n']})")
        out.append("")
        out.append("Latency in ms: mean (p50 / p90; percentiles only when n>=5).\n")
        out.append("| stage | " + " | ".join(labels) + " |\n|---|" + "---|" * len(labels))
        for k, nm in (("preprocess", "inference preprocess"), ("detect", "inference detect"), ("classify", "inference classify"),
                      ("color", "inference color"), ("total", "inference total"), ("inference_wall", "inference HTTP wall"),
                      ("api_post", "API POST /api/scans"), ("set_candidates", "GET set-candidates")):
            out.append(f"| {nm} | " + " | ".join(_lat(res[l]["summary"][set_name]["latency"][k]) for l in labels) + " |")

    out.append("\n## Per image\n")
    out.append("`true` = counts.csv / manifest; per label: inference count / API count. `*` = OOD (excluded), `j` = inference run on the re-encoded JPEG.\n")
    names = []
    for r in res.values():
        for row in r["rows"]:
            k = (row["set"], row["image"])
            if k not in names:
                names.append(k)
    out.append("| set | image | size | true | " + " | ".join(labels) + " |\n|---|---|---|---|" + "---|" * len(labels))
    for k in names:
        cells, true, size, ood = [], None, "", False
        for l in labels:
            row = next((x for x in res[l]["rows"] if (x["set"], x["image"]) == k), None)
            if not row:
                cells.append("–")
                continue
            true = row["true_count"] if row["true_count"] is not None else true
            size = "x".join(map(str, row["oriented_size"] or []))
            ood = ood or row["ood"]
            ic = "err" if row["inf_count"] is None else str(row["inf_count"]) + ("j" if row["inf_via_jpeg"] else "")
            ac = "" if row["api_count"] is None and row["api_error"] is None else ("/err" if row["api_count"] is None else f"/{row['api_count']}")
            cells.append(ic + ac)
        out.append(f"| {k[0]} | {k[1]}{'*' if ood else ''} | {size} | {true if true is not None else '?'} | " + " | ".join(cells) + " |")
    return "\n".join(out) + "\n"
