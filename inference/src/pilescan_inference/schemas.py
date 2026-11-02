"""Pydantic models mirroring docs/api/inference-response.schema.json exactly.

A drift test (tests/test_schema_contract.py) compares these models with the JSON schema.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1.0.0"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ImageSize(_Strict):
    width: int = Field(ge=1)
    height: int = Field(ge=1)


class BBox(_Strict):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(ge=1)
    height: int = Field(ge=1)


class RGB(_Strict):
    r: int = Field(ge=0, le=255)
    g: int = Field(ge=0, le=255)
    b: int = Field(ge=0, le=255)


class PartCandidate(_Strict):
    part_id: str = Field(min_length=1)
    id_system: Literal["bricklink", "rebrickable", "ldraw"]
    name: str
    score: float = Field(ge=0, le=1)
    image_url: str | None = None


class ColorCandidate(_Strict):
    rebrickable_color_id: int = Field(ge=-1)
    name: str
    score: float = Field(ge=0, le=1)
    delta_e: float = Field(ge=0)


class Detection(_Strict):
    index: int = Field(ge=0)
    bbox: BBox
    detection_score: float = Field(ge=0, le=1)
    part_candidates: list[PartCandidate] = Field(max_length=3)
    color_candidates: list[ColorCandidate] = Field(min_length=1, max_length=3)
    measured_rgb: RGB


class PipelineInfo(_Strict):
    detector: str
    part_classifier: str
    color_estimator: str


class Timings(_Strict):
    detect: float = Field(ge=0)
    classify: float = Field(ge=0)
    color: float = Field(ge=0)
    total: float = Field(ge=0)


class RecognizeResponse(_Strict):
    contract_version: Literal["1.0.0"]
    image: ImageSize
    detections: list[Detection]
    pipeline: PipelineInfo
    timings_ms: Timings
    warnings: list[str]
    debug_image: str | None


class HealthResponse(_Strict):
    status: Literal["ok"] = "ok"
    pipeline: PipelineInfo
