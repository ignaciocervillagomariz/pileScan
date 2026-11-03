from collections import Counter

from pilescan_eval.metrics import lat_stats, multiset_match, pr, top3_match


def test_multiset_match():
    pred = Counter({"a": 3, "b": 1})
    true = Counter({"a": 2, "c": 5})
    assert multiset_match(pred, true) == 2
    assert pr(2, 4, 7) == (0.5, 2 / 7)
    assert pr(0, 0, 0) == (None, None)


def test_top3_recovers_non_top1():
    true = Counter({"a": 1, "b": 1})
    m = top3_match([["x", "b", "y"], ["a", "q", "r"]], ["x", "a"], true)
    assert m == 2


def test_top3_does_not_overcount():
    true = Counter({"a": 1})
    assert top3_match([["a"], ["a"]], ["a", "a"], true) == 1


def test_latency_percentiles_only_with_n5():
    assert "p50" not in lat_stats([1, 2, 3])
    s = lat_stats([1, 2, 3, 4, 5])
    assert s["p50"] == 3 and s["n"] == 5
