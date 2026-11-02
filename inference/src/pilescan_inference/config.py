"""Runtime configuration, read from environment variables (see docker-compose.yml)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    detector: str = "opencv"
    part_classifier: str = "brickognize"
    color_estimator: str = "kmeans_lab"

    brickognize_url: str = "https://api.brickognize.com"
    brickognize_max_concurrency: int = Field(default=2, ge=1, le=16)
    brickognize_max_retries: int = Field(default=3, ge=0, le=8)
    brickognize_timeout_s: float = Field(default=30.0, gt=0)
    cache_dir: Path = Path("./.cache")

    max_image_bytes: int = 15 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
