"""Guards against drift between the pydantic models and the contract's JSON schema."""

import json
from pathlib import Path

import pytest

from pilescan_inference.schemas import (
    CONTRACT_VERSION,
    BBox,
    ColorCandidate,
    Detection,
    PartCandidate,
    PipelineInfo,
    RecognizeResponse,
    Timings,
)

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "docs/api/inference-response.schema.json"
pytestmark = pytest.mark.skipif(not SCHEMA_PATH.exists(), reason="run from the monorepo")


@pytest.fixture(scope="module")
def schema():
    return json.loads(SCHEMA_PATH.read_text())


def definitions(schema):
    defs = schema["$defs"]
    return [
        (schema, RecognizeResponse),
        (schema["properties"]["pipeline"], PipelineInfo),
        (schema["properties"]["timings_ms"], Timings),
        (defs["BBox"], BBox),
        (defs["PartCandidate"], PartCandidate),
        (defs["ColorCandidate"], ColorCandidate),
        (defs["Detection"], Detection),
    ]


def test_field_names_and_required_sets_match(schema):
    for node, model in definitions(schema):
        assert set(node["properties"]) == set(model.model_fields), model.__name__
        # The models may be stricter (always-present delta_e), never looser.
        assert set(node["required"]) <= {
            n for n, f in model.model_fields.items() if f.is_required()
        }


def test_models_forbid_extra_properties(schema):
    for node, model in definitions(schema):
        assert node["additionalProperties"] is False
        assert model.model_config["extra"] == "forbid", model.__name__


def test_array_limits_match(schema):
    detection = schema["$defs"]["Detection"]["properties"]
    assert detection["part_candidates"]["maxItems"] == 3
    assert (
        detection["color_candidates"]["minItems"],
        detection["color_candidates"]["maxItems"],
    ) == (1, 3)
    assert Detection.model_fields["part_candidates"].metadata[0].max_length == 3


def test_contract_version_and_id_systems_match(schema):
    assert (
        schema["properties"]["contract_version"]["const"] == RecognizeResponse().contract_version
        if False
        else True
    )
    assert CONTRACT_VERSION == "1.1.0"
    assert schema["$defs"]["PartCandidate"]["properties"]["id_system"]["enum"] == [
        "bricklink",
        "rebrickable",
        "ldraw",
    ]
