import os

import razorpay

from core.audit_trail import audit_trail, current_session_id
from models.schemas import PaymentResult

RAZORPAY_ERRORS = (
    razorpay.errors.BadRequestError,
    razorpay.errors.GatewayError,
    razorpay.errors.ServerError,
)

# Keyed by Razorpay order_id. Populated once the browser checkout page reports
# an outcome via /api/payment/callback; polled via /api/payment/status/{order_id}.
_pending_results: dict[str, PaymentResult] = {}

# Keyed by Razorpay order_id, captured at order creation (inside the agent
# run's session context). The callback that later reports the outcome arrives
# on its own HTTP request — a human paid in a browser — so by then there's no
# ambient session context to tag events with; this is how it's recovered.
_order_sessions: dict[str, str] = {}


def _client() -> razorpay.Client:
    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        raise RuntimeError("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured")
    return razorpay.Client(auth=(key_id, key_secret))


def create_order(product_id: str, amount_inr: float, receipt: str) -> dict:
    """Create a real Razorpay test-mode Order. Raises RAZORPAY_ERRORS on failure."""
    client = _client()
    amount_paise = int(round(amount_inr * 100))

    order = client.order.create(
        {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "payment_capture": 1,
        }
    )
    _order_sessions[order["id"]] = current_session_id()
    audit_trail.emit(
        actor="razorpay",
        event_type="payment_call",
        message=f"Created order {order['id']} for ₹{amount_inr:.2f}",
        metadata={"order_id": order["id"], "amount_inr": amount_inr, "product_id": product_id},
    )
    return order


def fetch_order(order_id: str) -> dict:
    return _client().order.fetch(order_id)


def get_result(order_id: str) -> PaymentResult | None:
    return _pending_results.get(order_id)


def finalize_payment(
    order_id: str,
    payment_id: str,
    signature: str | None = None,
) -> PaymentResult:
    """Called once the browser checkout page reports an outcome. Razorpay's
    Payments API is the source of truth for status — the client-reported
    success/failure is never trusted on its own. If a signature is present
    (Checkout.js success callback), it's verified first."""
    client = _client()
    session_id = _order_sessions.get(order_id, "")

    if signature:
        try:
            client.utility.verify_payment_signature(
                {
                    "razorpay_order_id": order_id,
                    "razorpay_payment_id": payment_id,
                    "razorpay_signature": signature,
                }
            )
        except razorpay.errors.SignatureVerificationError as exc:
            result = PaymentResult(
                success=False,
                order_id=order_id,
                payment_id=payment_id,
                status="signature_invalid",
                reason=str(exc),
            )
            audit_trail.emit(
                actor="razorpay",
                event_type="failure",
                message=f"Signature verification failed for payment {payment_id}",
                metadata={"order_id": order_id, "payment_id": payment_id},
                session_id=session_id,
            )
            _pending_results[order_id] = result
            return result

    try:
        payment = client.payment.fetch(payment_id)
    except RAZORPAY_ERRORS as exc:
        result = PaymentResult(
            success=False,
            order_id=order_id,
            payment_id=payment_id,
            status="fetch_failed",
            reason=str(exc),
        )
        audit_trail.emit(
            actor="razorpay",
            event_type="failure",
            message=f"Could not fetch payment {payment_id} for order {order_id}: {exc}",
            metadata={"order_id": order_id, "payment_id": payment_id},
            session_id=session_id,
        )
        _pending_results[order_id] = result
        return result

    status = payment.get("status", "unknown")
    amount_inr = (payment.get("amount") or 0) / 100

    if status == "authorized":
        payment = client.payment.capture(payment_id, payment["amount"])
        status = payment.get("status", status)

    if status == "captured":
        result = PaymentResult(
            success=True,
            order_id=order_id,
            payment_id=payment_id,
            amount_inr=amount_inr,
            status=status,
            reason="Payment captured successfully",
        )
        audit_trail.emit(
            actor="razorpay",
            event_type="payment_call",
            message=f"Payment {payment_id} captured for order {order_id}",
            metadata={"order_id": order_id, "payment_id": payment_id, "status": status},
            session_id=session_id,
        )
    else:
        reason = payment.get("error_description") or f"Payment ended in status '{status}'"
        result = PaymentResult(
            success=False,
            order_id=order_id,
            payment_id=payment_id,
            amount_inr=amount_inr,
            status=status,
            reason=reason,
        )
        audit_trail.emit(
            actor="razorpay",
            event_type="failure",
            message=f"Payment {payment_id} for order {order_id} did not complete: {reason}",
            metadata={"order_id": order_id, "payment_id": payment_id, "status": status},
            session_id=session_id,
        )

    _pending_results[order_id] = result
    return result
