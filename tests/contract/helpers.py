import requests
from openapi_core import OpenAPI
from openapi_core.contrib.requests import RequestsOpenAPIRequest, RequestsOpenAPIResponse


def call(openapi: OpenAPI, method: str, url: str, expect_status: int | tuple[int, ...], valid_request: bool = True, **kwargs) -> requests.Response:
    """Send a request and validate request and response against openapi.yaml.

    Negative tests pass valid_request=False: the request is intentionally invalid, only the response is checked."""
    session = requests.Session()
    prepared = session.prepare_request(requests.Request(method, url, **kwargs))
    response = session.send(prepared, timeout=kwargs.get("timeout", 180))
    allowed = (expect_status,) if isinstance(expect_status, int) else expect_status
    assert response.status_code in allowed, f"{method} {url} -> {response.status_code}: {response.text[:500]}"
    if valid_request:
        openapi.validate_request(RequestsOpenAPIRequest(prepared))
    openapi.validate_response(RequestsOpenAPIRequest(prepared), RequestsOpenAPIResponse(response))
    return response


def assert_problem(response: requests.Response, status: int) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/problem+json"), response.headers["content-type"]
    body = response.json()
    assert body.get("status") == status and body.get("title")
