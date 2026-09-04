"""Route-level tests for the endpoints not already exercised by
test_session_integration.py — policy, catalog, and the failure injector."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    from main import app

    return TestClient(app)


@pytest.fixture
def demo_catalog_file() -> str:
    # Reuses the real demo catalog shipped in backend/data/ rather than a
    # fixture, since these are plain read-only GETs against it.
    return "catalog_demo_1.csv"


def test_get_policy_returns_configured_policy(client):
    response = client.get("/api/policy")
    assert response.status_code == 200
    body = response.json()
    assert "max_spend_per_order" in body
    assert "blocked_categories" in body


def test_check_order_route_for_real_catalog_product(client, demo_catalog_file):
    catalog = client.get(f"/api/catalog/{demo_catalog_file}").json()
    assert catalog, "demo catalog should not be empty"
    product = catalog[0]

    response = client.post(
        "/api/policy/check-order",
        json={
            "catalog_file": demo_catalog_file,
            "product_id": product["product_id"],
            "quantity": 1,
            "orders_this_session": 0,
        },
    )
    assert response.status_code == 200
    assert "allowed" in response.json()


def test_check_order_route_unknown_product_is_404(client, demo_catalog_file):
    response = client.post(
        "/api/policy/check-order",
        json={
            "catalog_file": demo_catalog_file,
            "product_id": "does-not-exist",
            "quantity": 1,
            "orders_this_session": 0,
        },
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_failure_injector_arm_disarm_roundtrip(client):
    arm_response = client.post(
        "/api/failure-injector/arm", json={"product_id": "sku-1", "mode": "stock_out"}
    )
    assert arm_response.status_code == 200
    assert arm_response.json()["armed"] == {"sku-1": "stock_out"}

    armed_response = client.get("/api/failure-injector/armed")
    assert armed_response.json() == {"sku-1": "stock_out"}

    disarm_response = client.post("/api/failure-injector/disarm", params={"product_id": "sku-1"})
    assert disarm_response.status_code == 200
    assert disarm_response.json()["armed"] == {}


def test_health_and_root_endpoints(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/").status_code == 200


def test_audit_events_empty_list_by_default(client):
    response = client.get("/api/audit/events")
    assert response.status_code == 200
    assert response.json() == []


def test_manual_audit_event_emit(client):
    response = client.post(
        "/api/audit/events",
        json={"actor": "system", "event_type": "decision", "message": "test event"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["actor"] == "system"
    assert body["message"] == "test event"

    events = client.get("/api/audit/events").json()
    assert len(events) == 1
