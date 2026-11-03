"""Structured JSON-line logging for pipeline stages. Never logs image data."""

import json
import logging
import time
from typing import Any

_logger = logging.getLogger("pilescan_inference.pipeline")


def log_stage(stage: str, started: float | None = None, **fields: Any) -> None:
    """Emit one JSON line: {"event": "pipeline_stage", "stage": ..., "ms": ..., **fields}.

    Only scalars and short strings are expected in `fields` (counts, sizes, timings, names).
    """
    record: dict[str, Any] = {"event": "pipeline_stage", "stage": stage}
    if started is not None:
        record["ms"] = round((time.perf_counter() - started) * 1000, 1)
    record.update(fields)
    _logger.info(json.dumps(record, separators=(",", ":"), default=str))
