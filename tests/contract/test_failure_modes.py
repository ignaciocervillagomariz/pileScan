"""Failure modes. These restart containers: run with `npm run test:nonfunctional` against a running stack."""
import subprocess
import time
from pathlib import Path

import pytest
import requests

from conftest import ROOT, wait_for
from helpers import call

pytestmark = pytest.mark.nonfunctional
COMPOSE = ["docker", "compose", "-f", str(ROOT / "docker-compose.yml"), "-f", str(ROOT / "tests/compose.e2e.yml")]
HERE = Path(__file__).resolve().parent


def compose(*args: str, files: tuple[str, ...] = ()) -> None:
    cmd = COMPOSE + [x for f in files for x in ("-f", f)] + list(args)
    subprocess.run(cmd, check=True, cwd=ROOT, capture_output=True)


def test_inference_down_yields_failed_scan(openapi, backend_url, inference_url, fixtures_dir, services_up) -> None:
    compose("stop", "inference")
    try:
        with open(fixtures_dir / "pile-small.jpg", "rb") as f:
            scan = call(openapi, "POST", f"{backend_url}/api/scans", 201, files={"image": ("p.jpg", f, "image/jpeg")}).json()
        assert scan["status"] == "FAILED" and scan["errorMessage"]
        assert scan["detections"] == []
        manual = call(openapi, "POST", f"{backend_url}/api/scans/{scan['id']}/detections", 201, json={"partNum": "3001", "colorId": 4})
        assert manual.json()["source"] == "MANUAL", "user can still fill a FAILED scan manually"
    finally:
        compose("start", "inference")
        wait_for(f"{inference_url}/health", 120)


def test_brickognize_down_yields_empty_candidates_and_warning(openapi, backend_url, inference_url, fixtures_dir, services_up) -> None:
    override = str(ROOT / "tests/nonfunctional/compose.brickognize-down.yml")
    compose("up", "-d", "--no-deps", "inference", files=(override,))
    try:
        wait_for(f"{inference_url}/health", 120)
        with open(fixtures_dir / "pile-small.jpg", "rb") as f:
            scan = call(openapi, "POST", f"{backend_url}/api/scans", 201, files={"image": ("p.jpg", f, "image/jpeg")}).json()
        assert scan["status"] == "COMPLETED", "classifier outage must not fail the scan"
        assert scan["detections"], "detections still returned"
        assert all(d["partCandidates"] == [] for d in scan["detections"])
        assert scan["warnings"]
    finally:
        compose("up", "-d", "--no-deps", "inference")
        time.sleep(2)
        wait_for(f"{inference_url}/health", 120)
