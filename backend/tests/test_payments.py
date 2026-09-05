"""finalize_payment's audit trail metadata: the compliance summary (Feature
3, frontend) reads signature_verified/payments_api_verified directly from
here rather than inferring them from message text, so this locks in that
both are set correctly for a real captured payment. Also covers
finalize_payment's loyalty wiring — see test_loyalty.py for core.loyalty's
own discount/purchase-counting logic, which this doesn't re-test."""

import razorpay

import core.payments as payments_module
from core import loyalty
from core.audit_trail import audit_trail
from core.payments import finalize_payment, get_result


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


def test_captured_payment_records_a_purchase_for_the_known_customer(monkeypatch):
    fake_client = _FakeClient(_FakePaymentAPI({"status": "captured", "amount": 100000}))
    monkeypatch.setattr("core.payments._client", lambda: fake_client)
    payments_module._order_customers["order_3"] = "cust-a"

    result = finalize_payment(order_id="order_3", payment_id="pay_3")

    assert result.success is True
    assert loyalty.purchase_count("cust-a") == 1


def test_captured_payment_without_a_known_customer_skips_purchase_recording(monkeypatch):
    fake_client = _FakeClient(_FakePaymentAPI({"status": "captured", "amount": 50000}))
    monkeypatch.setattr("core.payments._client", lambda: fake_client)
    record_calls = []
    monkeypatch.setattr(
        loyalty, "record_purchase", lambda customer_id: record_calls.append(customer_id)
    )

    result = finalize_payment(order_id="order_unknown", payment_id="pay_5")

    assert result.success is True
    assert record_calls == []


def test_authorized_payment_that_races_razorpays_auto_capture_still_settles(monkeypatch):
    # Orders are created with payment_capture=1 (see create_order), so
    # Razorpay may auto-capture before this callback's own capture call
    # runs — Razorpay then rejects that call as already-captured. This must
    # not crash the callback and leave no result recorded (see core/payments.py):
    # the fallback re-fetches the payment, which by then reports "captured".
    class _RaceCapturePaymentAPI:
        def __init__(self):
            self.fetch_calls = 0

        def fetch(self, payment_id: str) -> dict:
            self.fetch_calls += 1
            status = "authorized" if self.fetch_calls == 1 else "captured"
            return {"status": status, "amount": 75000}

        def capture(self, payment_id: str, amount: int) -> dict:
            raise razorpay.errors.BadRequestError("This payment has already been captured")

    fake_client = _FakeClient(_RaceCapturePaymentAPI())
    monkeypatch.setattr("core.payments._client", lambda: fake_client)

    result = finalize_payment(order_id="order_race", payment_id="pay_race")

    assert result.success is True
    assert result.status == "captured"
    assert get_result("order_race") is not None
