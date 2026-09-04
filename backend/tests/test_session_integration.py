"""End-to-end test of a full buyer-agent session through the real FastAPI
route: catalog translation -> policy guard -> negotiation -> checkout ->
audit trail. The only things faked are the two external services (Groq and
Razorpay) — everything else runs for real."""

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


class _FakeToolCall:
    def __init__(self, call_id: str, name: str, arguments: dict):
        self.id = call_id
        self.function = SimpleNamespace(name=name, arguments=json.dumps(arguments))


class _FakeMessage:
    def __init__(self, content: str | None = None, tool_calls: list[_FakeToolCall] | None = None):
        self.content = content
        self.tool_calls = tool_calls

    def model_dump(self, exclude_none: bool = False) -> dict:
        data = {"role": "assistant", "content": self.content, "tool_calls": self.tool_calls}
        return {k: v for k, v in data.items() if not exclude_none or v is not None}


class _FakeGroqClient:
    """Replays a fixed script of assistant turns, ignoring the actual
    request payload — good enough since we're testing the buyer agent's
    tool-dispatch loop, not Groq's model behavior."""

    def __init__(self, script: list[_FakeMessage]):
        self._script = iter(script)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        message = next(self._script)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class _FakeRazorpayOrderAPI:
    def create(self, payload: dict) -> dict:
        return {
            "id": "order_test_123",
            "amount": payload["amount"],
            "currency": payload["currency"],
        }


class _FakeRazorpayClient:
    def __init__(self):
        self.order = _FakeRazorpayOrderAPI()


@pytest.fixture
def catalog_file(tmp_path, monkeypatch):
    monkeypatch.setattr("core.catalog_translator.DATA_DIR", tmp_path)
    (tmp_path / "session_catalog.csv").write_text(
        "product_id,name,price_inr,stock,category,description,return_policy,max_qty_per_order\n"
        "sku-1,Wireless Mouse,900,10,electronics,A wireless mouse,30,5\n",
        encoding="utf-8",
    )
    return "session_catalog.csv"


@pytest.fixture
def app_client():
    from main import app

    return TestClient(app)


def test_full_session_flow_search_negotiate_checkout(app_client, catalog_file, monkeypatch):
    # Merchant's floor for this product, per config/merchant_policy.yaml
    # (10% max discount, +5% electronics promo, 75% cost floor): 900 * 0.95 = 855.
    negotiated_price = 855.0

    script = [
        _FakeMessage(tool_calls=[_FakeToolCall("call_1", "search_catalog", {"query": "mouse"})]),
        _FakeMessage(
            tool_calls=[
                _FakeToolCall(
                    "call_2",
                    "negotiate_with_merchant",
                    {"product_id": "sku-1", "offer_inr": negotiated_price, "quantity": 1},
                )
            ]
        ),
        _FakeMessage(
            tool_calls=[
                _FakeToolCall(
                    "call_3",
                    "checkout",
                    {"product_id": "sku-1", "quantity": 1, "unit_price_inr": negotiated_price},
                )
            ]
        ),
        _FakeMessage(
            content="I bought the Wireless Mouse for ₹855 and checkout is awaiting payment."
        ),
    ]

    monkeypatch.setattr("agents.buyer_agent.Groq", lambda api_key: _FakeGroqClient(script))
    monkeypatch.setattr("core.payments._client", lambda: _FakeRazorpayClient())

    response = app_client.post(
        "/api/session/start",
        json={"goal": "Buy a wireless mouse", "budget_inr": 1000, "catalog_file": catalog_file},
    )

    assert response.status_code == 200
    body = response.json()
    assert "855" in body["final_message"] or "mouse" in body["final_message"].lower()

    events = app_client.get("/api/audit/events").json()
    event_types = [e["event_type"] for e in events]
    assert "decision" in event_types
    assert "negotiation_turn" in event_types
    assert "guardrail_check" in event_types
    assert "payment_call" in event_types

    # All events from this single session should carry the same session_id.
    session_ids = {e["session_id"] for e in events if e["session_id"]}
    assert len(session_ids) == 1


def test_session_blocked_by_policy_reports_reason_without_calling_razorpay(
    app_client, catalog_file, monkeypatch
):
    script = [
        _FakeMessage(
            tool_calls=[
                _FakeToolCall(
                    "call_1",
                    "checkout",
                    # 1200 > policy.yaml's requires_human_approval_above (1000) but
                    # under max_spend_per_order (1500) — isolates the approval-gate reason.
                    {"product_id": "sku-1", "quantity": 1, "unit_price_inr": 1200},
                )
            ]
        ),
        _FakeMessage(content="Checkout was blocked because ₹1200 requires human approval."),
    ]

    monkeypatch.setattr("agents.buyer_agent.Groq", lambda api_key: _FakeGroqClient(script))

    def _unexpected_client_call():
        raise AssertionError(
            "Razorpay client should never be constructed for a policy-blocked order"
        )

    monkeypatch.setattr("core.payments._client", lambda: _unexpected_client_call())

    response = app_client.post(
        "/api/session/start",
        json={
            "goal": "Buy a wireless mouse at list price",
            "budget_inr": 1000,
            "catalog_file": catalog_file,
        },
    )

    assert response.status_code == 200
    events = app_client.get("/api/audit/events").json()
    guardrail_events = [e for e in events if e["event_type"] == "guardrail_check"]
    assert guardrail_events
    assert guardrail_events[0]["metadata"]["allowed"] is False


def test_unknown_catalog_file_returns_standard_error_envelope(app_client):
    response = app_client.post(
        "/api/session/start",
        json={"goal": "Buy anything", "budget_inr": 100, "catalog_file": "does_not_exist.csv"},
    )

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "bad_request"
    assert "not found" in body["error"]["message"].lower()
