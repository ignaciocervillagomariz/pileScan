"""Metric definitions. Pure functions over saved raw outputs; no network."""
from __future__ import annotations

import csv
import json
import statistics
from collections import Counter
from pathlib import Path

from .common import OUT_DIR, REAL_DIR, SYNTH_DIR, safe_name


# ---------------------------------------------------------------- ground truth

def _rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    return list(csv.DictReader(lines))


def load_ground_truth() -> dict:
    counts: dict[str, int] = {}
    ood: set[str] = set()
    for r in _rows(REAL_DIR / "counts.csv"):
        if (r.get("ood") or "").strip() in ("1", "true", "yes"):
            ood.add(r["image"])
        v = (r.get("total_pieces") or "").strip()
        if v:
            counts[r["image"]] = int(v)
    parts: dict[str, Counter] = {}
    for r in _rows(REAL_DIR / "ground-truth.csv"):
        key = (r["part_num"].strip(), r["color"].strip())
        parts.setdefault(r["image"], Counter())[key] += int(r["quantity"])
    sets = {r["image"]: r["set_num"].strip() for r in _rows(REAL_DIR / "sets.csv") if r.get("set_num", "").strip()}
    manifest = json.loads((SYNTH_DIR / "manifest.json").read_text())
    synth = {k: v["piece_count"] for k, v in manifest.items()}
    return {"counts": counts, "ood": ood, "parts": parts, "sets": sets, "synthetic": synth}


# ---------------------------------------------------------------- matching

def multiset_match(pred: Counter, true: Counter) -> int:
    return sum(min(n, true.get(k, 0)) for k, n in pred.items())


def top3_match(dets: list[list], pred1: list, true: Counter) -> int:
    """Part recall with top-3 candidates.

    Pass 1 consumes true quantities with the top-1 predictions (exact multiset match).
    Pass 2: each detection that did not match in pass 1 may consume a remaining true
    quantity with any of its top-3 candidates (greedy, first candidate first).
    Returns the number of matched true pieces.
    """
    remaining = Counter(true)
    unmatched = []
    m = 0
    for top1, cands in zip(pred1, dets):
        if top1 is not None and remaining.get(top1, 0) > 0:
            remaining[top1] -= 1
            m += 1
        else:
            unmatched.append(cands)
    for cands in unmatched:
        for c in cands:
            if c is not None and remaining.get(c, 0) > 0:
                remaining[c] -= 1
                m += 1
                break
    return m


def pr(match: int, pred: int, true: int) -> tuple[float | None, float | None]:
    return (match / pred if pred else None, match / true if true else None)


def pct(values: list[float], q: float) -> float:
    s = sorted(values)
    k = (len(s) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def lat_stats(values: list[float]) -> dict:
    v = [x for x in values if x is not None]
    if not v:
        return {"n": 0}
    out = {"n": len(v), "mean": statistics.fmean(v)}
    if len(v) >= 5:
        out["p50"] = pct(v, 0.5)
        out["p90"] = pct(v, 0.9)
    return out


# ---------------------------------------------------------------- loading

def load_label(label: str) -> dict:
    root = OUT_DIR / label
    run = json.loads((root / "run.json").read_text())
    items = []
    for set_name in ("real", "synthetic"):
        for meta_path in sorted((root / set_name).glob("*/meta.json")) if (root / set_name).exists() else []:
            d = meta_path.parent
            rec = json.loads(meta_path.read_text())
            rec["dir"] = str(d)

            def load(name):
                p = d / name
                return json.loads(p.read_text()) if p.exists() else None

            rec["inf_json"] = load("inference.json") or load("inference_jpeg.json")
            rec["inf_via_jpeg"] = load("inference.json") is None and rec["inf_json"] is not None
            rec["api_scan"] = load("api_scan.json")
            rec["api_cand"] = load("api_candidates.json")
            items.append(rec)
    return {"run": run, "items": items}


# ---------------------------------------------------------------- compute

def _api_keys(scan: dict):
    """Per detection: (top1 part, top1 color name, top3 parts, partNum list)."""
    out = []
    for d in scan["detections"]:
        part = (d.get("part") or {}).get("partNum")
        color = (d.get("color") or {}).get("name")
        top3 = [c.get("partNum") for c in d.get("partCandidates", [])[:3]]
        out.append((part, color, top3))
    return out


def _inf_color(inf: dict):
    return [(d["color_candidates"][0]["name"] if d["color_candidates"] else None) for d in inf["detections"]]


def compute(label: str, gt: dict) -> dict:
    data = load_label(label)
    rows = []
    for rec in data["items"]:
        name, set_name = rec["image"], rec["set"]
        inf, scan, cand = rec["inf_json"], rec["api_scan"], rec["api_cand"]
        row = {
            "image": name, "set": set_name,
            "ood": name in gt["ood"] and set_name == "real",
            "oriented_size": rec.get("oriented_size"),
            "inf_via_jpeg": rec["inf_via_jpeg"],
            "inf_error": None if inf else (rec.get("inference") or {}).get("error"),
            "api_error": None if scan else (rec.get("api") or {}).get("error"),
            "inf_count": len(inf["detections"]) if inf else None,
            "api_count": len(scan["detections"]) if scan else None,
            "api_status": scan["status"] if scan else None,
            "warnings": (inf or {}).get("warnings", []),
        }
        true = gt["synthetic"].get(name) if set_name == "synthetic" else gt["counts"].get(name)
        row["true_count"] = true
        # latency
        t = (inf or {}).get("timings_ms", {})
        row["lat"] = {k: t.get(k) for k in ("preprocess", "detect", "classify", "color", "total")}
        row["lat"]["inference_wall"] = ((rec.get("inference_jpeg") if rec["inf_via_jpeg"] else rec.get("inference")) or {}).get("wall_ms")
        a = rec.get("api") or {}
        row["lat"]["api_post"] = a.get("post_ms") if scan else None
        row["lat"]["set_candidates"] = a.get("candidates_ms") if cand else None
        # parts / colors (real set only)
        row["part"] = None
        if set_name == "real" and name in gt["parts"] and not row["ood"]:
            truth = gt["parts"][name]
            tparts = Counter()
            tcolors = Counter()
            for (p, c), q in truth.items():
                tparts[p] += q
                tcolors[c] += q
            r = {"n_true": sum(truth.values())}
            if scan:
                keys = _api_keys(scan)
                p1 = Counter(k[0] for k in keys if k[0])
                c1 = Counter(k[1] for k in keys if k[1])
                pc = Counter((k[0], k[1]) for k in keys if k[0] and k[1])
                r["n_pred"] = len(keys)
                r["part_match"] = multiset_match(p1, tparts)
                r["color_match"] = multiset_match(c1, tcolors)
                r["partcolor_match"] = multiset_match(pc, truth)
                r["part3_match"] = top3_match([k[2] for k in keys], [k[0] for k in keys], tparts)
            elif inf:
                cols = Counter(c for c in _inf_color(inf) if c)
                r["n_pred"] = len(inf["detections"])
                r["color_match"] = multiset_match(cols, tcolors)
            row["part"] = r
        # set ranking
        row["set_rank"] = None
        if set_name == "real" and name in gt["sets"] and not row["ood"]:
            want = gt["sets"][name]
            rank = None
            if cand:
                for c in cand["candidates"]:
                    if c["set"]["setNum"] == want:
                        rank = c["rank"]
                        break
            row["set_rank"] = rank if rank else 0  # 0 = not in top 20 / no candidates
            row["set_expected"] = want
        rows.append(row)
    return {"run": data["run"], "rows": rows, "summary": summarize(rows)}


def _count_metrics(rows: list[dict], key: str) -> dict:
    use = [r for r in rows if r["true_count"] is not None and r[key] is not None and not r["ood"]]
    if not use:
        return {"n": 0}
    err = [r[key] - r["true_count"] for r in use]
    return {
        "n": len(use),
        "mae": statistics.fmean(abs(e) for e in err),
        "bias": statistics.fmean(err),
        "exact_pct": 100 * sum(1 for e in err if e == 0) / len(err),
        "within1_pct": 100 * sum(1 for e in err if abs(e) <= 1) / len(err),
    }


def summarize(rows: list[dict]) -> dict:
    out: dict = {}
    for set_name in ("real", "synthetic"):
        rs = [r for r in rows if r["set"] == set_name]
        s: dict = {"n_images": len(rs), "n_ood": sum(r["ood"] for r in rs)}
        s["count_inference"] = _count_metrics(rs, "inf_count")
        s["count_api"] = _count_metrics(rs, "api_count")
        s["zero_detections"] = sum(1 for r in rs if r["inf_count"] == 0 and not r["ood"])
        s["errors"] = sum(1 for r in rs if (r["inf_error"] and r["inf_count"] is None) or (r["api_error"] and r["api_count"] is None))
        ps = [r["part"] for r in rs if r["part"]]
        if ps:
            def agg(k):
                ps_k = [p for p in ps if k in p]
                if not ps_k:
                    return None
                m = sum(p[k] for p in ps_k)
                pred = sum(p["n_pred"] for p in ps_k)
                tr = sum(p["n_true"] for p in ps_k)
                P, R = pr(m, pred, tr)
                return {"precision": P, "recall": R, "n_images": len(ps_k), "pred": pred, "true": tr}
            s["part"] = agg("part_match")
            s["color"] = agg("color_match")
            s["partcolor"] = agg("partcolor_match")
            s["part_top3"] = agg("part3_match")
        sr = [r["set_rank"] for r in rs if r["set_rank"] is not None]
        if sr:
            s["sets"] = {
                "n": len(sr),
                "top1": 100 * sum(1 for x in sr if x == 1) / len(sr),
                "top5": 100 * sum(1 for x in sr if 1 <= x <= 5) / len(sr),
                "mrr": statistics.fmean(1 / x if x else 0 for x in sr),
            }
        lat = {}
        for k in ("preprocess", "detect", "classify", "color", "total", "inference_wall", "api_post", "set_candidates"):
            lat[k] = lat_stats([r["lat"].get(k) for r in rs])
        s["latency"] = lat
        out[set_name] = s
    return out
