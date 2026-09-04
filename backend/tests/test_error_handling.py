"""Every error path renders the same {"error": {"code", "message", "details"}}
envelope, regardless of which endpoint or exception type produced it."""

from fastapi.testclient import TestClient


def app_client() -> TestClient:
    from main import app

    return TestClient(app)


def test_404_uses_standard_error_envelope():
    client = app_client()
    response = client.get("/api/payment/status/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["details"] == {}


def test_validation_error_uses_standard_envelope_with_details():
    client = app_client()
    # Missing required fields (goal, budget_inr).
    response = client.post("/api/session/start", json={})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "errors" in body["error"]["details"]


def test_catalog_not_found_uses_standard_envelope():
    client = app_client()
    response = client.get("/api/catalog/does-not-exist.csv")
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "bad_request"
