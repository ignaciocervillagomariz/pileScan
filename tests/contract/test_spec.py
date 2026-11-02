from openapi_spec_validator import validate
from openapi_spec_validator.readers import read_from_filename

from conftest import ROOT


def test_openapi_spec_is_valid() -> None:
    spec, _ = read_from_filename(str(ROOT / "docs/api/openapi.yaml"))
    validate(spec)


def test_every_operation_has_unique_operation_id() -> None:
    spec, _ = read_from_filename(str(ROOT / "docs/api/openapi.yaml"))
    ids = [op["operationId"] for item in spec["paths"].values() for m, op in item.items() if m in {"get", "post", "patch", "delete", "put"}]
    assert len(ids) == len(set(ids)) and len(ids) >= 12
