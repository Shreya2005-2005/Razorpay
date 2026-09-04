"""finalize_payment's audit trail metadata: the compliance summary (Feature
3, frontend) reads signature_verified/payments_api_verified directly from
here rather than inferring them from message text, so this locks in that
both are set correctly for a real captured payment."""

from core.audit_trail import audit_trail
from core.payments import finalize_payment


class _FakePaymentAPI:
    def __init__(self, fetch_response: dict, capture_response: dict | None = None):
        self._fetch_response = fetch_response
        self._capture_response = capture_response or fetch_response

    def fetch(self, payment_id: str) -> dict:
        return self._fetch_response

    def capture(self, payment_id: str, amount: int) -> dict:
        return self._capture_response


class _FakeUtility:
    def verify_payment_signature(self, params: dict) -> None:
        pass  # A present signature is assumed valid unless the test overrides this.


class _FakeClient:
    def __init__(self, payment_api: _FakePaymentAPI, utility=None):
        self.payment = payment_api
        self.utility = utility or _FakeUtility()


def _captured_event() -> dict:
    events = [e for e in audit_trail.history() if "captured" in e.message]
    assert len(events) == 1
    return events[0].metadata


def test_captured_payment_with_signature_marks_both_verified(monkeypatch):
    fake_client = _FakeClient(
        _FakePaymentAPI({"status": "authorized", "amount": 100000}, {"status": "captured"})
    )
    monkeypatch.setattr("core.payments._client", lambda: fake_client)

    result = finalize_payment(order_id="order_1", payment_id="pay_1", signature="a-real-signature")

    assert result.success is True
    meta = _captured_event()
    assert meta["signature_verified"] is True
    assert meta["payments_api_verified"] is True


def test_captured_payment_without_signature_marks_signature_unverified(monkeypatch):
    # The browser's payment.failed handler never sends a signature (Razorpay
    # doesn't issue one for a failed attempt) — but a captured status can
    # still arrive via /callback without one in principle, so this path
    # must not claim a signature check that never happened.
    fake_client = _FakeClient(_FakePaymentAPI({"status": "captured", "amount": 50000}))
    monkeypatch.setattr("core.payments._client", lambda: fake_client)

    result = finalize_payment(order_id="order_2", payment_id="pay_2", signature=None)

    assert result.success is True
    meta = _captured_event()
    assert meta["signature_verified"] is False
    assert meta["payments_api_verified"] is True
