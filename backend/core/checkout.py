import os
import time

from core import failure_injector
from core.audit_trail import audit_trail
from core.payments import create_order
from core.policy_guard import check_order
from models.schemas import Product


def initiate_checkout(
    product: Product,
    quantity: int,
    orders_this_session: int,
    unit_price_inr: float | None = None,
) -> dict:
    """Policy-check the order, then either create a real Razorpay Order (the
    normal path — payment is completed separately, see routes/payment.py) or,
    if a payment_decline failure is armed for this product, fail immediately
    the same way a real card decline would, without touching Razorpay."""
    policy_result = check_order(
        product=product,
        quantity=quantity,
        orders_this_session=orders_this_session,
        unit_price_inr=unit_price_inr,
    )
    if not policy_result.allowed:
        return {"status": "blocked_by_policy", "success": False, "reason": policy_result.reason}

    effective_price = unit_price_inr if unit_price_inr is not None else product.price_inr
    amount_inr = round(effective_price * quantity, 2)

    if failure_injector.get_armed_mode(product.product_id) == "payment_decline":
        audit_trail.emit(
            actor="razorpay",
            event_type="payment_call",
            message=f"Initiated payment for {product.product_id} x{quantity} (₹{amount_inr:.2f})",
            metadata={"product_id": product.product_id, "amount_inr": amount_inr},
        )
        audit_trail.emit(
            actor="razorpay",
            event_type="failure",
            message=f"Payment declined for {product.product_id}: card declined by issuing bank",
            metadata={"product_id": product.product_id, "amount_inr": amount_inr},
        )
        return {
            "status": "failed",
            "success": False,
            "reason": "Payment declined by the card issuer",
        }

    receipt = f"receipt_{product.product_id}_{int(time.time())}"
    order = create_order(product_id=product.product_id, amount_inr=amount_inr, receipt=receipt)
    base_url = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")

    return {
        "status": "awaiting_payment",
        "order_id": order["id"],
        "amount_inr": amount_inr,
        "checkout_url": f"{base_url}/api/payment/pay/{order['id']}",
        "status_url": f"{base_url}/api/payment/status/{order['id']}",
    }
