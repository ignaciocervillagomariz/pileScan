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


def test_nullable_is_not_combined_with_allof() -> None:
    """`nullable: true` next to `allOf: [$ref]` is invalid for null under strict OAS 3.0 validators."""
    from conftest import load_spec

    offenders: list[str] = []

    def walk(node, path: str) -> None:
        if isinstance(node, dict):
            if node.get("nullable") is True and "allOf" in node:
                offenders.append(path)
            for k, v in node.items():
                walk(v, f"{path}/{k}")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}/{i}")

    walk(load_spec(), "#")
    assert not offenders, offenders
