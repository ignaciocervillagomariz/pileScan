import httpx
import pytest

from pilescan_inference.classifiers.brickognize import (
    USER_AGENT,
    BrickognizeClassifier,
    parse_retry_after,
)
from pilescan_inference.classifiers.cache import DiskCache
from pilescan_inference.domain import ClassifierError, Crop
from tests.conftest import bbox

CROP = Crop(jpeg=b"fake-jpeg-bytes", bbox=bbox())


def item(part_id, score, name="Brick"):
    return {
        "id": part_id,
        "name": name,
        "img_url": f"https://img.example/{part_id}.webp",
        "external_sites": [],
        "category": "Brick",
        "type": "part",
        "score": score,
    }


def ok_body(*items):
    return {"listing_id": "res-1", "bounding_box": {}, "items": list(items)}


class Recorder:
    """MockTransport handler that replays queued responses and records requests."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def make(handler, tmp_path, retries=3):
    sleeps: list[float] = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://brickognize.test",
        headers={"User-Agent": USER_AGENT},
    )
    classifier = BrickognizeClassifier(
        client, DiskCache(tmp_path, "t"), max_concurrency=2, max_retries=retries, sleep=fake_sleep
    )
    return classifier, sleeps


async def test_success_returns_top_three_sorted_as_bricklink_ids(tmp_path):
    body = ok_body(item("3002", 0.1), item("3001", 0.8), item("2456", 0.05), item("3003", 0.02))
    handler = Recorder(httpx.Response(200, json=body))
    classifier, _ = make(handler, tmp_path)

    result = await classifier.classify(CROP)

    assert [c.part_id for c in result] == ["3001", "3002", "2456"]
    assert result[0].id_system == "bricklink"
    assert result[0].image_url == "https://img.example/3001.webp"
    request = handler.requests[0]
    assert request.url.path == "/predict/parts/"
    assert request.headers["user-agent"] == USER_AGENT
    assert b'name="query_image"' in request.content


async def test_retries_429_honoring_retry_after(tmp_path):
    handler = Recorder(
        httpx.Response(429, headers={"Retry-After": "3"}),
        httpx.Response(200, json=ok_body(item("3001", 0.9))),
    )
    classifier, sleeps = make(handler, tmp_path)

    result = await classifier.classify(CROP)

    assert result[0].part_id == "3001"
    assert len(handler.requests) == 2
    assert sleeps == [3.0]


async def test_retries_5xx_with_bounded_jittered_backoff(tmp_path):
    handler = Recorder(
        httpx.Response(503),
        httpx.Response(502),
        httpx.Response(200, json=ok_body(item("3001", 0.9))),
    )
    classifier, sleeps = make(handler, tmp_path)

    await classifier.classify(CROP)

    assert len(sleeps) == 2
    assert 0 <= sleeps[0] <= 1.0
    assert 0 <= sleeps[1] <= 2.0


async def test_timeout_is_retried_then_succeeds(tmp_path):
    handler = Recorder(
        httpx.ReadTimeout("slow"), httpx.Response(200, json=ok_body(item("3001", 0.9)))
    )
    classifier, sleeps = make(handler, tmp_path)

    assert (await classifier.classify(CROP))[0].part_id == "3001"
    assert len(sleeps) == 1


async def test_gives_up_after_max_retries(tmp_path):
    handler = Recorder(*[httpx.Response(503)] * 3)
    classifier, sleeps = make(handler, tmp_path, retries=2)

    with pytest.raises(ClassifierError):
        await classifier.classify(CROP)

    assert len(handler.requests) == 3
    assert len(sleeps) == 2


async def test_client_error_is_not_retried(tmp_path):
    handler = Recorder(httpx.Response(422, json={"detail": []}))
    classifier, sleeps = make(handler, tmp_path)

    with pytest.raises(ClassifierError):
        await classifier.classify(CROP)

    assert len(handler.requests) == 1
    assert sleeps == []


async def test_malformed_body_raises_classifier_error(tmp_path):
    classifier, _ = make(Recorder(httpx.Response(200, json={"unexpected": True})), tmp_path)

    with pytest.raises(ClassifierError):
        await classifier.classify(CROP)


async def test_second_call_with_same_crop_is_served_from_disk_cache(tmp_path):
    handler = Recorder(httpx.Response(200, json=ok_body(item("3001", 0.9))))
    classifier, _ = make(handler, tmp_path)
    first = await classifier.classify(CROP)

    fresh, _ = make(Recorder(), tmp_path)  # a new instance: the cache is on disk
    second = await fresh.classify(CROP)

    assert second == first
    assert len(handler.requests) == 1


async def test_failures_are_not_cached(tmp_path):
    classifier, _ = make(Recorder(*[httpx.Response(500)] * 4), tmp_path)
    with pytest.raises(ClassifierError):
        await classifier.classify(CROP)

    handler = Recorder(httpx.Response(200, json=ok_body(item("3001", 0.9))))
    retry, _ = make(handler, tmp_path)
    assert (await retry.classify(CROP))[0].part_id == "3001"


async def test_unwritable_cache_does_not_break_classification(tmp_path):
    blocker = tmp_path / "file"
    blocker.write_text("x")  # cache root is a file, so mkdir fails
    handler = Recorder(httpx.Response(200, json=ok_body(item("3001", 0.9))))
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://brickognize.test"
    )
    classifier = BrickognizeClassifier(client, DiskCache(blocker, "t"))

    assert (await classifier.classify(CROP))[0].part_id == "3001"


def test_parse_retry_after_variants():
    assert parse_retry_after("5") == 5.0
    assert parse_retry_after(None) is None
    assert parse_retry_after("garbage") is None
    http_date = "Wed, 21 Oct 2015 07:28:10 GMT"
    assert parse_retry_after(http_date, now=lambda: 1445412490 - 7) == pytest.approx(7, abs=1)
