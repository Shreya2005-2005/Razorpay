"""Demo-only loyalty support: an always-on, order-value-based discount plus
lightweight in-memory purchase counting per customer_id (see
frontend/lib/customerId.ts — a client-generated id stored in localStorage,
since there's no account system). Same in-memory-singleton pattern as
core.failure_injector and core.kill_switch: no persistence layer yet, see
the Phase 2 roadmap.

Deliberately a simplification, not a production loyalty system: the discount
is a flat rule applied to every qualifying order (not a scarce coupon that's
earned once and then spent), and purchase counts live only in this process's
memory and reset on restart.
"""

from functools import lru_cache
from pathlib import Path

import yaml

from models.schemas import LoyaltyPolicyConfig

LOYALTY_POLICY_PATH = Path(__file__).resolve().parent.parent / "config" / "loyalty_policy.yaml"

# customer_id -> number of completed (captured) purchases. Not currently
# used to gate the discount below, but kept so purchases are tracked per
# customer across sessions — a prerequisite for any future repeat-customer
# feature (e.g. a Merchant View breakdown by customer).
_purchase_counts: dict[str, int] = {}


@lru_cache
def load_loyalty_policy() -> LoyaltyPolicyConfig:
    """Load and cache the loyalty config from config/loyalty_policy.yaml."""
    raw = yaml.safe_load(LOYALTY_POLICY_PATH.read_text(encoding="utf-8"))
    return LoyaltyPolicyConfig(**raw)


def purchase_count(customer_id: str) -> int:
    return _purchase_counts.get(customer_id, 0)


def record_purchase(customer_id: str) -> None:
    """Call once per completed (captured) purchase for `customer_id`."""
    _purchase_counts[customer_id] = _purchase_counts.get(customer_id, 0) + 1


def compute_discount_inr(amount_inr: float, policy: LoyaltyPolicyConfig | None = None) -> float:
    """The automatic loyalty discount for an order of this size, in INR —
    0.0 if it doesn't qualify. Applies to any order regardless of
    customer_id: this rule is purely a function of order value, not
    purchase history."""
    policy = policy or load_loyalty_policy()
    if amount_inr < policy.min_purchase_for_discount_inr:
        return 0.0
    return min(policy.discount_inr, amount_inr)


def clear() -> None:
    """Reset all state — used between tests."""
    _purchase_counts.clear()
