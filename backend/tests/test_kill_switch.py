"""The Stop Agent kill switch: core.kill_switch's flag semantics, the
buyer agent honoring it at its safe checkpoints (never mid-tool-call, so a
checkout in flight always finishes rather than being interrupted), and the
route that arms it."""

from types import SimpleNamespace

from core import kill_switch
from core.audit_trail import audit_trail
from models.schemas import NegotiationResult
from tests.test_session_integration import (
    _FakeGroqClient,
    _FakeMessage,
    _FakeToolCall,
    catalog_file,
)

# Re-exported so pytest discovers it as a fixture in this module too — a
# fixture defined in a sibling test file isn't visible here just by being
# in the same directory, only conftest.py fixtures are.
__all__ = ["catalog_file"]


def test_flag_starts_unset_and_roundtrips():
    assert kill_switch.is_stop_requested("session-a") is False
    kill_switch.request_stop("session-a")
    assert kill_switch.is_stop_requested("session-a") is True
    kill_switch.clear("session-a")
    assert kill_switch.is_stop_requested("session-a") is False


def test_flag_is_scoped_per_session():
    kill_switch.request_stop("session-a")
    assert kill_switch.is_stop_requested("session-a") is True
    assert kill_switch.is_stop_requested("session-b") is False
    kill_switch.clear("session-a")


def test_agent_stops_immediately_when_flagged_before_run(monkeypatch, catalog_file):
    from agents.buyer_agent import BuyerAgent

    agent = BuyerAgent(goal="Buy anything", budget_inr=1000, catalog_file=catalog_file)
    kill_switch.request_stop(agent.session_id)

    def _unexpected_groq_call(**kwargs):
        raise AssertionError("Groq should never be called once a stop is already flagged")

    agent.client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_unexpected_groq_call))
    )

    final_message = agent.run()

    assert final_message == "Stopped by user request."
    stopped_events = [e for e in audit_trail.history() if e.event_type == "stopped"]
    assert len(stopped_events) == 1
    assert stopped_events[0].actor == "buyer_agent"
    # The kill switch is cleared once the run ends, however it ends.
    assert kill_switch.is_stop_requested(agent.session_id) is False


def test_stop_requested_mid_batch_prevents_checkout(monkeypatch, catalog_file):
    """A stop that lands *between* two tool calls the model requested in the
    same turn (negotiate, then checkout) must still block the checkout —
    the whole point of checking before every dispatch, not just every turn."""
    from agents.buyer_agent import BuyerAgent

    agent = BuyerAgent(goal="Buy anything", budget_inr=1000, catalog_file=catalog_file)

    script = [
        _FakeMessage(
            tool_calls=[
                _FakeToolCall(
                    "call_1",
                    "negotiate_with_merchant",
                    {"product_id": "sku-1", "offer_inr": 900, "quantity": 1},
                ),
                _FakeToolCall(
                    "call_2",
                    "checkout",
                    {"product_id": "sku-1", "quantity": 1, "unit_price_inr": 900},
                ),
            ]
        ),
    ]
    agent.client = _FakeGroqClient(script)

    def _stop_as_side_effect(*args, **kwargs):
        # Simulates the user clicking "Stop Agent" while the first tool
        # call of this turn was resolving.
        kill_switch.request_stop(agent.session_id)
        return NegotiationResult(
            product_id="sku-1", final_price_inr=900, accepted=True, turns=1, reason="ok"
        )

    monkeypatch.setattr("agents.buyer_agent.negotiate", _stop_as_side_effect)

    def _unexpected_checkout(*args, **kwargs):
        raise AssertionError("checkout must never be dispatched after a stop was requested")

    monkeypatch.setattr("agents.buyer_agent.initiate_checkout", _unexpected_checkout)

    final_message = agent.run()

    assert final_message == "Stopped by user request."
    assert any(e.event_type == "stopped" for e in audit_trail.history())


def test_stop_route_arms_the_kill_switch():
    from fastapi.testclient import TestClient

    from main import app

    client = TestClient(app)
    response = client.post("/api/session/some-session-id/stop")
    assert response.status_code == 200
    assert response.json() == {"status": "stop_requested"}
    assert kill_switch.is_stop_requested("some-session-id") is True
    kill_switch.clear("some-session-id")
