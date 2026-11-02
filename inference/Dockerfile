# CPU-only image. Build context: ./inference
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
# Dependencies first so code changes do not invalidate the (large) dependency layer.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
# OpenCV headless still links against glib.
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 app \
    && mkdir -p /data/cache && chown app /data/cache
WORKDIR /app
COPY --from=build /app /app
ENV PATH="/app/.venv/bin:$PATH" CACHE_DIR=/data/cache PYTHONUNBUFFERED=1
USER app
EXPOSE 8000
CMD ["uvicorn", "pilescan_inference.main:app_factory", "--factory", "--host", "0.0.0.0", "--port", "8000"]
