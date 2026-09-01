from functools import lru_cache
from pathlib import Path

import yaml

from core import failure_injector
from core.audit_trail import audit_trail
from models.schemas import PolicyConfig, PolicyResult, Product

POLICY_PATH = Path(__file__).resolve().parent.parent / "config" / "policy.yaml"


@lru_cache
def load_policy() -> PolicyConfig:
    raw = yaml.safe_load(POLICY_PATH.read_text(encoding="utf-8"))
    return PolicyConfig(**raw)


def _evaluate(
    product: Product,
    quantity: int,
    orders_this_session: int,
    unit_price_inr: float,
    policy: PolicyConfig,
    available_stock: int,
) -> PolicyResult:
    order_total = unit_price_inr * quantity

    if product.category in policy.blocked_categories:
        return PolicyResult(
            allowed=False,
            reason=f"Category '{product.category}' is blocked by policy",
        )

    if policy.allowed_categories and product.category not in policy.allowed_categories:
        return PolicyResult(
            allowed=False,
            reason=f"Category '{product.category}' is not in the allowed list",
        )

    if quantity > product.max_qty_per_order:
        return PolicyResult(
            allowed=False,
            reason=(
                f"Requested quantity {quantity} exceeds the product's "
                f"max_qty_per_order of {product.max_qty_per_order}"
            ),
        )

    if quantity > available_stock:
        return PolicyResult(
            allowed=False,
            reason=f"Requested quantity {quantity} exceeds available stock of {available_stock}",
        )

    if order_total > policy.max_spend_per_order:
        return PolicyResult(
            allowed=False,
            reason=(
                f"Order total ₹{order_total:.2f} exceeds max_spend_per_order "
                f"of ₹{policy.max_spend_per_order:.2f}"
            ),
        )

    if orders_this_session >= policy.max_orders_per_session:
        return PolicyResult(
            allowed=False,
            reason=(
                f"Session has already reached max_orders_per_session "
                f"({policy.max_orders_per_session})"
            ),
        )

    if order_total > policy.requires_human_approval_above:
        return PolicyResult(
            allowed=False,
            reason=(
                f"Order total ₹{order_total:.2f} exceeds ₹"
                f"{policy.requires_human_approval_above:.2f} and requires human approval"
            ),
        )

    return PolicyResult(allowed=True, reason="Order passes all policy checks")


def check_order(
    product: Product,
    quantity: int,
    orders_this_session: int,
    unit_price_inr: float | None = None,
    policy: PolicyConfig | None = None,
) -> PolicyResult:
    """Check a prospective order against the policy before checkout is allowed to proceed.

    `unit_price_inr` lets a negotiated price (rather than list price) be checked
    against spend caps; it defaults to the product's list price.
    """
    policy = policy or load_policy()
    effective_price = unit_price_inr if unit_price_inr is not None else product.price_inr
    available_stock = 0 if failure_injector.get_armed_mode(product.product_id) == "stock_out" else product.stock

    result = _evaluate(
        product, quantity, orders_this_session, effective_price, policy, available_stock
    )

    audit_trail.emit(
        actor="policy_guard",
        event_type="guardrail_check",
        message=(
            f"{'Allowed' if result.allowed else 'Blocked'} order for "
            f"{product.product_id} x{quantity} @ ₹{effective_price:.2f}/unit: {result.reason}"
        ),
        metadata={
            "product_id": product.product_id,
            "quantity": quantity,
            "unit_price_inr": effective_price,
            "allowed": result.allowed,
        },
    )
    return result
