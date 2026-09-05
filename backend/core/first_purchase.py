"""First-purchase discount: a one-time percentage discount for a
customer_id's first completed purchase. A separate rule from
core.loyalty's order-value discount — mutually exclusive with it (see
core.checkout.initiate_checkout for the priority) so pricing stays simple
and explainable rather than an unclear stack of two discounts.

Reuses core.loyalty's purchase-count tracking rather than keeping a
second counter: "is this customer's first purchase" is exactly
`loyalty.purchase_count(customer_id) == 0`, checked before this order's
own eventual capture increments it (core.payments.finalize_payment calls
loyalty.record_purchase only once payment is captured, so a purchase
that hasn't settled yet never counts against itself).
"""

from functools import lru_cache
from pathlib import Path

import yaml

from core import loyalty
from models.schemas import FirstPurchasePolicyConfig

FIRST_PURCHASE_POLICY_PATH = (
    Path(__file__).resolve().parent.parent / "config" / "first_purchase_policy.yaml"
)


@lru_cache
def load_first_purchase_policy() -> FirstPurchasePolicyConfig:
    """Load and cache the first-purchase config from config/first_purchase_policy.yaml."""
    raw = yaml.safe_load(FIRST_PURCHASE_POLICY_PATH.read_text(encoding="utf-8"))
    return FirstPurchasePolicyConfig(**raw)


def is_first_purchase(customer_id: str | None) -> bool:
    """Whether `customer_id` has no prior completed purchase. A session
    without a customer_id (see SessionStartRequest) never qualifies —
    there's no purchase history to check."""
    if not customer_id:
        return False
    return loyalty.purchase_count(customer_id) == 0


def compute_discount_inr(
    amount_inr: float,
    customer_id: str | None,
    policy: FirstPurchasePolicyConfig | None = None,
) -> float:
    """The first-purchase discount for this order, in INR — 0.0 if it
    doesn't qualify (no customer_id, policy disabled, or not their first
    purchase)."""
    policy = policy or load_first_purchase_policy()
    if not policy.enabled or not is_first_purchase(customer_id):
        return 0.0
    return round(amount_inr * policy.discount_pct, 2)
