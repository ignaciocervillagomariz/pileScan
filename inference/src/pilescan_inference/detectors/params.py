"""Tunable parameters of the classical detector, read from `DETECTOR_*` environment variables."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DetectorParams(BaseSettings):
    """All defaults are provisional: tuned on ~13 web photos plus synthetic scenes (ADR 0009)."""

    model_config = SettingsConfigDict(env_prefix="DETECTOR_", extra="ignore", frozen=True)

    # Normalization: images are processed at this long side (downscale or upscale).
    long_side: int = Field(default=1280, ge=200, le=4096)
    min_long_side: int = Field(default=640, ge=100, le=4096)

    # Background model.
    border_fraction: float = Field(default=0.04, gt=0, le=0.2)
    bg_sigma_fraction: float = Field(default=0.06, gt=0, le=0.5)
    bg_iterations: int = Field(default=8, ge=1, le=20)
    clahe: bool = False

    # Distance and shadow handling.
    l_weight_darker: float = Field(default=0.35, ge=0, le=2)
    l_weight_lighter: float = Field(default=0.8, ge=0, le=2)
    shadow_chroma_max: float = Field(default=6.0, ge=0)
    shadow_l_max: float = Field(default=30.0, ge=0)

    # Threshold: clip(0.5 * Otsu, max(threshold_min, noise_k * background_noise), threshold_max).
    threshold_min: float = Field(default=6.0, gt=0)
    threshold_max: float = Field(default=9.0, gt=0)
    # dE under which a pixel may join the background model: clip(noise_k * ring noise, min, max).
    bg_limit_min: float = Field(default=5.0, gt=0)
    bg_limit: float = Field(default=15.0, gt=0)
    noise_k: float = Field(default=4.0, ge=0)

    # Morphology kernels as a fraction of the processed long side.
    open_fraction: float = Field(default=1 / 400, ge=0)
    close_fraction: float = Field(default=1 / 300, ge=0)

    # Contour filters as a fraction of the processed image area.
    min_area_fraction: float = Field(default=0.00015, ge=0)
    max_area_fraction: float = Field(default=0.35, gt=0, le=1)
    min_solidity: float = Field(default=0.35, ge=0, le=1)

    # Splitting of merged blobs: high-contrast cores (distance > seed_factor * threshold, eroded)
    # act as markers; the distance-transform watershed handles oversized/low-solidity leftovers.
    seed_split: bool = True
    seed_factor: float = Field(default=2.5, gt=1)
    seed_erode_fraction: float = Field(default=1 / 250, ge=0)

    watershed: bool = True
    watershed_solidity: float = Field(default=0.95, gt=0, le=1)
    watershed_peak_fraction: float = Field(default=0.6, gt=0, lt=1)

    # Out-of-distribution guard: foreground fraction above which nothing is returned.
    fg_max_fraction: float = Field(default=0.8, gt=0, le=1)
