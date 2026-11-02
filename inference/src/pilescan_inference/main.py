"""FastAPI application: GET /health and POST /v1/recognize."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from pilescan_inference.config import Settings, get_settings
from pilescan_inference.domain import DetectorError
from pilescan_inference.imaging import ImageDecodeError
from pilescan_inference.pipeline import Pipeline
from pilescan_inference.registry import build_components
from pilescan_inference.schemas import HealthResponse, RecognizeResponse

logger = logging.getLogger("pilescan_inference")

PROBLEM_JSON = "application/problem+json"


class ApiError(Exception):
    def __init__(self, status: int, title: str, detail: str) -> None:
        self.status, self.title, self.detail = status, title, detail


def create_app(settings: Settings | None = None, pipeline: Pipeline | None = None) -> FastAPI:
    """Build the app. Tests pass a ready `pipeline`; production builds it from settings."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.pipeline = pipeline or Pipeline(*build_components(settings))
        logger.info("pipeline ready: %s", app.state.pipeline.info.model_dump())
        yield
        await app.state.pipeline.aclose()

    app = FastAPI(title="PileScan inference", version="1.0.0", lifespan=lifespan)

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _problem(exc.status, exc.title, exc.detail)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        detail = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        return _problem(422, "Invalid request parameters", detail)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _problem(exc.status_code, "HTTP error", str(exc.detail))

    @app.get("/health", response_model=HealthResponse)
    async def health(request: Request) -> HealthResponse:
        return HealthResponse(pipeline=request.app.state.pipeline.info)

    @app.post("/v1/recognize", response_model=RecognizeResponse)
    async def recognize(
        request: Request,
        image: Annotated[UploadFile | None, File()] = None,
        debug: bool = False,
        max_detections: Annotated[int, Query(ge=1, le=300)] = 150,
    ) -> RecognizeResponse:
        if image is None:
            raise ApiError(400, "Missing image", "multipart field 'image' is required")
        data = await image.read(settings.max_image_bytes + 1)
        if len(data) > settings.max_image_bytes:
            raise ApiError(
                413, "Image too large", f"image exceeds {settings.max_image_bytes} bytes"
            )
        try:
            return await request.app.state.pipeline.recognize(
                data, debug=debug, max_detections=max_detections
            )
        except ImageDecodeError as exc:
            raise ApiError(400, "Undecodable image", str(exc)) from exc
        except DetectorError as exc:
            logger.exception("detector failure")
            raise ApiError(503, "Detector unavailable", str(exc)) from exc

    return app


def _problem(status: int, title: str, detail: str) -> JSONResponse:
    return JSONResponse(
        {"type": "about:blank", "title": title, "status": status, "detail": detail},
        status_code=status,
        media_type=PROBLEM_JSON,
    )


def app_factory() -> FastAPI:
    """Entry point for `uvicorn --factory`, so import never reads env or builds components."""
    logging.basicConfig(level=logging.INFO)
    return create_app()
