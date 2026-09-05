"""Bridge between a policy-checked order and a real Razorpay Order — the
one place checkout can either be blocked, simulated as declined, or handed
off to a real payment."""

import os
import time

from core import failure_injector, loyalty, upsell
from core.audit_trail import audit_trail, current_session_id
from core.payments import create_order
from core.policy_guard import check_order, load_policy
from models.schemas import CheckoutStartResult, PolicyConfig, Product, UpsellOutcome


def _upsell_eligibility(
    candidate: Product, current_amount_inr: float, budget_inr: float, policy: PolicyConfig
) -> tuple[bool, float]:
    """Whether adding `candidate` to the order is allowed — checked against
    the same policy caps/categories the primary order was subject to, so an
    upsell can never bypass a guardrail the base order itself had to pass.
    Returns (eligible, combined_amount_inr)."""
    combined_inr = round(current_amount_inr + candidate.price_inr, 2)
    if candidate.category in policy.blocked_categories:
        return False, combined_inr
    if policy.allowed_categories and candidate.category not in policy.allowed_categories:
        return False, combined_inr
    if combined_inr > policy.max_spend_per_order:
        return False, combined_inr
    if combined_inr > policy.requires_human_approval_above:
        return False, combined_inr
    if combined_inr > budget_inr:
        return False, combined_inr
    return True, combined_inr


def _offer_upsell(
    product: Product,
    amount_inr: float,
    catalog: list[Product] | None,
    budget_inr: float | None,
) -> tuple[float, UpsellOutcome | None]:
    """Offers a complementary add-on for `product`, if one applies, and
    deterministically accepts or declines it based on the buyer's remaining
    budget and the same policy caps the base order passed. Returns the
    (possibly increased) order amount and the outcome to report, or
    (amount_inr, None) if there was nothing to offer."""
    if not catalog or budget_inr is None:
        return amount_inr, None

    candidate = upsell.find_upsell_candidate(product, catalog)
    if candidate is None:
        return amount_inr, None

    audit_trail.emit(
        actor="merchant_agent",
        event_type="upsell_offered",
        message=f"Add a {candidate.name} for ₹{candidate.price_inr:.2f}?",
        metadata={
            "product_id": product.product_id,
            "upsell_product_id": candidate.product_id,
            "upsell_name": candidate.name,
            "upsell_price_inr": candidate.price_inr,
        },
    )

    policy = load_policy()
    eligible, combined_inr = _upsell_eligibility(candidate, amount_inr, budget_inr, policy)

    if eligible:
        audit_trail.emit(
            actor="buyer_agent",
            event_type="upsell_accepted",
            message=f"Added {candidate.name} (₹{candidate.price_inr:.2f}) to the order",
            metadata={
                "product_id": product.product_id,
                "upsell_product_id": candidate.product_id,
                "upsell_price_inr": candidate.price_inr,
            },
        )
        return combined_inr, UpsellOutcome(
            product_id=candidate.product_id,
            name=candidate.name,
            price_inr=candidate.price_inr,
            accepted=True,
            reason="Fits remaining budget and policy",
        )

    reason = "Adding this would exceed the remaining budget or a policy limit"
    audit_trail.emit(
        actor="buyer_agent",
        event_type="upsell_declined",
        message=f"Declined {candidate.name} — {reason}",
        metadata={
            "product_id": product.product_id,
            "upsell_product_id": candidate.product_id,
            "upsell_name": candidate.name,
            "upsell_price_inr": candidate.price_inr,
        },
    )
    return amount_inr, UpsellOutcome(
        product_id=candidate.product_id,
        name=candidate.name,
        price_inr=candidate.price_inr,
        accepted=False,
        reason=reason,
    )


def _emit_coupon_nudge_converted_if_applicable(product: Product) -> None:
    """If a coupon nudge was shown earlier this session for this product and
    the loyalty discount just applied, log that the nudge converted."""
    session_id = current_session_id()
    already_converted = any(
        e.event_type == "coupon_nudge_converted"
        and e.metadata.get("product_id") == product.product_id
        for e in audit_trail.history()
        if e.session_id == session_id
    )
    if already_converted:
        return
    nudge_shown = any(
        e.event_type == "coupon_nudge_shown" and e.metadata.get("product_id") == product.product_id
        for e in audit_trail.history()
        if e.session_id == session_id
    )
    if not nudge_shown:
        return
    audit_trail.emit(
        actor="system",
        event_type="coupon_nudge_converted",
        message="Buyer crossed the loyalty threshold after the nudge — coupon applied",
        metadata={"product_id": product.product_id},
    )


def initiate_checkout(
    product: Product,
    quantity: int,
    orders_this_session: int,
    unit_price_inr: float | None = None,
    customer_id: str | None = None,
    catalog: list[Product] | None = None,
    budget_inr: float | None = None,
) -> CheckoutStartResult:
    """Policy-check the order, then either create a real Razorpay Order (the
    normal path — payment is completed separately, see routes/payment.py) or,
    if a payment_decline failure is armed for this product, fail immediately
    the same way a real card decline would, without touching Razorpay.

    Before finalizing, a complementary add-on may be offered (core.upsell) —
    accepted automatically if it fits the buyer's remaining budget and the
    same policy caps the base order passed, declined otherwise. `catalog`
    and `budget_inr` are optional (skips the upsell step if omitted) for
    backward compatibility with older callers/tests.

    If this order's pre-discount total (including any accepted upsell) meets
    the loyalty discount's minimum (core.loyalty), the discount is applied
    here, deterministically — not left to the Buyer Agent to remember to ask
    for. Applies to any order, known customer_id or not; the rule is a pure
    function of order value.
    """
    policy_result = check_order(
        product=product,
        quantity=quantity,
        orders_this_session=orders_this_session,
        unit_price_inr=unit_price_inr,
    )
    if not policy_result.allowed:
        return CheckoutStartResult(status="blocked_by_policy", reason=policy_result.reason)

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
        return CheckoutStartResult(status="failed", reason="Payment declined by the card issuer")

    amount_inr, upsell_outcome = _offer_upsell(product, amount_inr, catalog, budget_inr)

    loyalty_policy = loyalty.load_loyalty_policy()
    discount_inr = loyalty.compute_discount_inr(amount_inr, policy=loyalty_policy)
    if discount_inr > 0:
        amount_inr = round(amount_inr - discount_inr, 2)
        audit_trail.emit(
            actor="system",
            event_type="loyalty_discount_applied",
            message=(
                f"🎁 ₹{discount_inr:.2f} loyalty discount applied automatically — "
                f"orders over ₹{loyalty_policy.min_purchase_for_discount_inr:.0f} qualify!"
            ),
            metadata={
                "customer_id": customer_id,
                "discount_inr": discount_inr,
                "product_id": product.product_id,
            },
        )
        _emit_coupon_nudge_converted_if_applicable(product)

    receipt = f"receipt_{product.product_id}_{int(time.time())}"
    order = create_order(
        product_id=product.product_id,
        amount_inr=amount_inr,
        receipt=receipt,
        customer_id=customer_id,
    )
    base_url = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")

    return CheckoutStartResult(
        status="awaiting_payment",
        order_id=order["id"],
        amount_inr=amount_inr,
        checkout_url=f"{base_url}/api/payment/pay/{order['id']}",
        status_url=f"{base_url}/api/payment/status/{order['id']}",
        upsell=upsell_outcome,
    )
