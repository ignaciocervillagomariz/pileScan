"""Run photos through inference and the public API and store raw outputs on disk."""
from __future__ import annotations

import base64
import json
import mimetypes
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .common import OUT_DIR, REAL_DIR, SYNTH_DIR, list_images, safe_name
from .prep import prep_jpeg

TIMEOUT = httpx.Timeout(600.0, connect=10.0)


def _ms(t0: float) -> float:
    return round((time.perf_counter() - t0) * 1000, 1)


def _mime(path: Path) -> str:
    return {".avif": "image/avif", ".heic": "image/heic", ".webp": "image/webp"}.get(
        path.suffix.lower(), mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    )


def _git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def _post_inference(client: httpx.Client, url: str, name: str, data: bytes, mime: str, d: Path, stem: str):
    t0 = time.perf_counter()
    try:
        r = client.post(
            f"{url}/v1/recognize",
            params={"debug": "true"},
            files={"image": (name if not name.startswith("-") else "img" + name, data, mime)},
        )
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}", "wall_ms": _ms(t0)}
    wall = _ms(t0)
    if r.status_code != 200:
        return {"ok": False, "status": r.status_code, "error": r.text[:500], "wall_ms": wall}
    body = r.json()
    dbg = body.pop("debug_image", None)
    if dbg:
        (d / f"{stem}.debug.jpg").write_bytes(base64.b64decode(dbg))
    (d / f"{stem}.json").write_text(json.dumps(body))
    return {"ok": True, "status": 200, "wall_ms": wall}


def _post_api(client: httpx.Client, url: str, jpeg: bytes, d: Path):
    out: dict = {}
    t0 = time.perf_counter()
    try:
        r = client.post(f"{url}/api/scans", files={"image": ("scan.jpg", jpeg, "image/jpeg")})
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}", "post_ms": _ms(t0)}
    out["post_ms"] = _ms(t0)
    out["status"] = r.status_code
    if r.status_code != 201:
        out.update(ok=False, error=r.text[:500])
        return out
    scan = r.json()
    (d / "api_scan.json").write_text(json.dumps(scan))
    out["ok"] = True
    out["scan_id"] = scan["id"]
    out["scan_status"] = scan.get("status")
    t0 = time.perf_counter()
    try:
        c = client.get(f"{url}/api/scans/{scan['id']}/set-candidates", params={"limit": 20, "missingLimit": 0})
        out["candidates_ms"] = _ms(t0)
        out["candidates_status"] = c.status_code
        if c.status_code == 200:
            (d / "api_candidates.json").write_text(json.dumps(c.json()))
    except httpx.HTTPError as e:
        out["candidates_error"] = f"{type(e).__name__}: {e}"
    if scan.get("debugImageUrl"):
        try:
            g = client.get(f"{url}{scan['debugImageUrl']}")
            if g.status_code == 200:
                (d / "api_debug.jpg").write_bytes(g.content)
        except httpx.HTTPError:
            pass
    return out


def wait_catalog(client: httpx.Client, api: str, timeout_s: int = 900) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            r = client.get(f"{api}/api/admin/catalog-import")
            if r.status_code == 200 and r.json().get("state") == "SUCCEEDED":
                return
        except httpx.HTTPError:
            pass
        time.sleep(5)
    raise SystemExit("catalog import did not reach SUCCEEDED")


def run(label: str, inference_url: str | None, api_url: str | None, sets: list[str], only: list[str] | None, note: str, sha: str | None = None):
    root = OUT_DIR / label
    root.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=TIMEOUT) as client:
        meta = {
            "label": label,
            "created": datetime.now(timezone.utc).isoformat(),
            "git_sha": sha or _git_sha(),
            "inference_url": inference_url,
            "api_url": api_url,
            "note": note,
        }
        if inference_url:
            meta["inference_health"] = client.get(f"{inference_url}/health").json()
        if api_url:
            wait_catalog(client, api_url)
        (root / "run.json").write_text(json.dumps(meta, indent=2))
        print(f"[{label}] {meta.get('inference_health')}")
        for set_name in sets:
            folder = REAL_DIR if set_name == "real" else SYNTH_DIR
            for p in list_images(folder):
                if only and p.name not in only:
                    continue
                d = root / set_name / safe_name(p.name)
                d.mkdir(parents=True, exist_ok=True)
                rec: dict = {"image": p.name, "set": set_name}
                jpeg, orig, sent = prep_jpeg(p)
                rec["oriented_size"] = list(orig)
                rec["sent_size"] = list(sent)
                if inference_url:
                    res = _post_inference(client, inference_url, p.name, p.read_bytes(), _mime(p), d, "inference")
                    rec["inference"] = res
                    if not res["ok"]:  # e.g. v1 does not decode AVIF: retry with the prepped JPEG
                        res2 = _post_inference(client, inference_url, "scan.jpg", jpeg, "image/jpeg", d, "inference_jpeg")
                        rec["inference_jpeg"] = res2
                if api_url:
                    rec["api"] = _post_api(client, api_url, jpeg, d)
                (d / "meta.json").write_text(json.dumps(rec, indent=1))
                inf = rec.get("inference", {})
                print(f"  {set_name}/{p.name}: inf={'ok' if inf.get('ok') else inf.get('error', '-')[:60]} "
                      f"api={rec.get('api', {}).get('status', '-')}")
