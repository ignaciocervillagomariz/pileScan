import os
import time
from pathlib import Path

import pytest
import requests
from jsonschema import Draft202012Validator
from openapi_core import OpenAPI

ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "tests" / "fixtures" / "generated"
BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8080")
INFERENCE = os.environ.get("INFERENCE_URL", "http://localhost:8000")


@pytest.fixture(scope="session")
def openapi() -> OpenAPI:
    return OpenAPI.from_file_path(str(ROOT / "docs/api/openapi.yaml"))


@pytest.fixture(scope="session")
def inference_validator() -> Draft202012Validator:
    import json

    schema = json.loads((ROOT / "docs/api/inference-response.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


@pytest.fixture(scope="session")
def backend_url() -> str:
    return BACKEND


@pytest.fixture(scope="session")
def inference_url() -> str:
    return INFERENCE


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    if not GENERATED.exists():
        pytest.exit("fixtures missing: run `npm run fixtures` in /tests", returncode=2)
    return GENERATED


def wait_for(url: str, timeout: float = 120) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if requests.get(url, timeout=3).ok:
                return
        except requests.RequestException:
            pass
        time.sleep(2)
    pytest.fail(f"{url} not healthy after {timeout}s")


@pytest.fixture(scope="session")
def inference_up(inference_url: str) -> None:
    wait_for(f"{inference_url}/health", 30)


@pytest.fixture(scope="session")
def services_up(backend_url: str, inference_url: str) -> None:
    wait_for(f"{inference_url}/health", 30)
    wait_for(f"{backend_url}/actuator/health", 30)


@pytest.fixture(scope="session")
def catalog_ready(backend_url: str, services_up: None) -> None:
    """Ranking returns 503 until the first catalog import has succeeded."""
    deadline = time.time() + float(os.environ.get("CATALOG_WAIT_S", "1800"))
    state = None
    while time.time() < deadline:
        state = requests.get(f"{backend_url}/api/admin/catalog-import", timeout=10).json().get("state")
        if state == "SUCCEEDED":
            return
        if state == "FAILED":
            pytest.fail("catalog import FAILED")
        time.sleep(5)
    pytest.fail(f"catalog import still {state}")
