from pilescan_eval import metrics


def _scan(dets):
    return {"status": "COMPLETED", "detections": [
        {"part": {"partNum": p} if p else None, "color": {"name": c} if c else None,
         "partCandidates": [{"partNum": x} for x in cands]} for p, c, cands in dets]}


def test_compute_end_to_end(monkeypatch):
    scan = _scan([("3001", "Red", ["3001", "3002"]), ("3020", "Blue", ["3020", "3001"]), (None, None, [])])
    item = {"image": "a.jpg", "set": "real", "oriented_size": [10, 10], "inf_via_jpeg": False,
            "inf_json": {"detections": [{}, {}, {}], "timings_ms": {"total": 5.0}, "warnings": []},
            "api_scan": scan, "api_cand": {"candidates": [{"rank": 1, "set": {"setNum": "9-1"}}, {"rank": 2, "set": {"setNum": "10-1"}}]},
            "api": {"post_ms": 10.0, "candidates_ms": 2.0}, "inference": {"wall_ms": 7.0}}
    monkeypatch.setattr(metrics, "load_label", lambda l: {"run": {}, "items": [item]})
    gt = {"counts": {"a.jpg": 4}, "ood": set(), "synthetic": {}, "sets": {"a.jpg": "10-1"},
          "parts": {"a.jpg": metrics.Counter({("3001", "Red"): 1, ("3020", "Red"): 1, ("3002", "Blue"): 2})}}
    s = metrics.compute("x", gt)["summary"]["real"]
    assert s["count_inference"]["mae"] == 1.0
    assert s["part"]["precision"] == 2 / 3 and s["part"]["recall"] == 2 / 4
    assert s["partcolor"]["recall"] == 1 / 4
    assert s["sets"]["top1"] == 0 and s["sets"]["top5"] == 100
