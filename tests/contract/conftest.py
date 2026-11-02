import json
import os
import time
from pathlib import Path

import pytest
import requests
import yaml
from jsonschema import Draft202012Validator
from openapi_core import Config, OpenAPI

ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "tests" / "fixtures" / "generated"
BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8080")
INFERENCE = os.environ.get("INFERENCE_URL", "http://localhost:8000")


def load_spec() -> dict:
    return yaml.safe_load((ROOT / "docs/api/openapi.yaml").read_text())


def relax_nullable_allof(node):
    """OAS 3.0 strictly rejects null for `nullable: true` + `allOf: [$ref]` (the $ref member is not nullable).
    The relaxed copy accepts null there so the remaining response checks still run.
    The strict problem is reported separately by test_spec.py::test_nullable_is_not_combined_with_allof."""
    if isinstance(node, list):
        return [relax_nullable_allof(n) for n in node]
    if not isinstance(node, dict):
        return node
    out = {k: relax_nullable_allof(v) for k, v in node.items()}
    if out.get("nullable") is True and "allOf" in out:
        rest = {k: v for k, v in out.items() if k not in ("allOf", "nullable", "type")}
        return {**rest, "anyOf": [{"allOf": out["allOf"]}, {"nullable": True, "enum": [None]}]}
    return out


@pytest.fixture(scope="session")
def openapi() -> OpenAPI:
    config = Config(extra_media_type_deserializers={"application/problem+json": json.loads})
    return OpenAPI.from_dict(relax_nullable_allof(load_spec()), config=config)


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
