"""On-disk cache of classifier results keyed by the sha256 of the encoded crop."""

import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path

from pilescan_inference.schemas import PartCandidate

logger = logging.getLogger(__name__)


def crop_key(jpeg: bytes) -> str:
    return hashlib.sha256(jpeg).hexdigest()


class DiskCache:
    """Best effort: an unreadable or unwritable cache degrades to cache misses, never errors."""

    def __init__(self, root: Path, namespace: str) -> None:
        self._root = root / namespace

    def _path(self, key: str) -> Path:
        return self._root / key[:2] / f"{key}.json"

    def get(self, key: str) -> list[PartCandidate] | None:
        try:
            raw = json.loads(self._path(key).read_text(encoding="utf-8"))
            return [PartCandidate.model_validate(item) for item in raw]
        except FileNotFoundError:
            return None
        except (OSError, ValueError):
            logger.warning("ignoring unreadable cache entry %s", key)
            return None

    def put(self, key: str, candidates: list[PartCandidate]) -> None:
        path = self._path(key)
        payload = json.dumps([c.model_dump() for c in candidates])
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            # Write-then-rename so concurrent readers never see a half-written file.
            fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(payload)
            os.replace(tmp, path)
        except OSError:
            logger.warning("could not write cache entry %s", key, exc_info=True)
