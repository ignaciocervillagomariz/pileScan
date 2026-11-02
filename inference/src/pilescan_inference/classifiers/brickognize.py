"""Brickognize adapter (`brickognize-v1`).

Verified against https://api.brickognize.com/openapi.json: `POST /predict/parts/` takes a
multipart `query_image` file and returns `{listing_id, bounding_box, items[]}` where each item
has `id` (BrickLink-style part number), `name`, `img_url`, `type` and `score` in [0, 1].
"""

import asyncio
import email.utils
import logging
import random
import time
from collections.abc import Awaitable, Callable

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from pilescan_inference.classifiers.cache import DiskCache, crop_key
from pilescan_inference.domain import ClassifierError, Crop
from pilescan_inference.schemas import PartCandidate

logger = logging.getLogger(__name__)

USER_AGENT = "PileScan/0.1 (portfolio project; brick pile scanner; respectful client, low volume)"
PREDICT_PATH = "/predict/parts/"
TOP_K = 3
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
BACKOFF_BASE_S = 1.0
BACKOFF_CAP_S = 20.0
RETRY_AFTER_CAP_S = 30.0


class _Item(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    img_url: str | None = None
    score: float


class _Prediction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: list[_Item]


def parse_retry_after(value: str | None, now: Callable[[], float] = time.time) -> float | None:
    """Seconds to wait from a Retry-After header (delta-seconds or HTTP date)."""
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    parsed = email.utils.parsedate_to_datetime(value) if email.utils.parsedate_tz(value) else None
    return max(0.0, parsed.timestamp() - now()) if parsed else None


class BrickognizeClassifier:
    name = "brickognize-v1"

    def __init__(
        self,
        client: httpx.AsyncClient,
        cache: DiskCache,
        max_concurrency: int = 2,
        max_retries: int = 3,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._client = client
        self._cache = cache
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._max_retries = max_retries
        self._sleep = sleep

    @staticmethod
    def build_client(base_url: str, timeout_s: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=base_url,
            headers={"User-Agent": USER_AGENT},
            timeout=httpx.Timeout(timeout_s, connect=10.0),
        )

    async def classify(self, crop: Crop) -> list[PartCandidate]:
        key = crop_key(crop.jpeg)
        cached = await asyncio.to_thread(self._cache.get, key)
        if cached is not None:
            return cached
        candidates = await self._predict(crop.jpeg)
        await asyncio.to_thread(self._cache.put, key, candidates)
        return candidates

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _predict(self, jpeg: bytes) -> list[PartCandidate]:
        # The semaphore is held while backing off so a 429 slows the whole service down.
        async with self._semaphore:
            response = await self._post_with_retries(jpeg)
        try:
            prediction = _Prediction.model_validate_json(response.content)
        except ValidationError as exc:
            raise ClassifierError("unexpected Brickognize response shape") from exc
        ranked = sorted(prediction.items, key=lambda item: item.score, reverse=True)[:TOP_K]
        return [
            PartCandidate(
                part_id=item.id,
                id_system="bricklink",
                name=item.name,
                score=min(1.0, max(0.0, item.score)),
                image_url=item.img_url,
            )
            for item in ranked
            if item.id
        ]

    async def _post_with_retries(self, jpeg: bytes) -> httpx.Response:
        last_error = "no attempt made"
        for attempt in range(self._max_retries + 1):
            retry_after: float | None = None
            try:
                response = await self._client.post(
                    PREDICT_PATH, files={"query_image": ("crop.jpg", jpeg, "image/jpeg")}
                )
            except httpx.TimeoutException:
                last_error = "timeout"
            except httpx.TransportError as exc:
                last_error = f"transport error: {type(exc).__name__}"
            else:
                if response.status_code not in RETRYABLE_STATUS:
                    if response.is_success:
                        return response
                    raise ClassifierError(f"Brickognize returned HTTP {response.status_code}")
                last_error = f"HTTP {response.status_code}"
                retry_after = parse_retry_after(response.headers.get("Retry-After"))
            if attempt < self._max_retries:
                await self._sleep(self._delay(attempt, retry_after))
        raise ClassifierError(f"Brickognize unavailable after retries ({last_error})")

    @staticmethod
    def _delay(attempt: int, retry_after: float | None) -> float:
        if retry_after is not None:
            return min(retry_after, RETRY_AFTER_CAP_S)
        # Full jitter: uniform in [0, min(cap, base * 2^attempt)].
        return random.uniform(0, min(BACKOFF_CAP_S, BACKOFF_BASE_S * 2**attempt))
