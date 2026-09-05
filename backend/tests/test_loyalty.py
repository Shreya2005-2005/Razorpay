"""core.loyalty's own discount/purchase-counting semantics, independent of
where it's wired into checkout/payments — see test_checkout.py and
test_payments.py for the integration points."""

from core import loyalty
from models.schemas import LoyaltyPolicyConfig

POLICY = LoyaltyPolicyConfig(min_purchase_for_discount_inr=800, discount_inr=150)


def test_purchase_count_starts_at_zero():
    assert loyalty.purchase_count("cust-a") == 0


def test_record_purchase_increments_the_count():
    loyalty.record_purchase("cust-a")
    loyalty.record_purchase("cust-a")
    assert loyalty.purchase_count("cust-a") == 2


def test_purchase_counts_are_scoped_per_customer():
    loyalty.record_purchase("cust-a")
    loyalty.record_purchase("cust-a")
    assert loyalty.purchase_count("cust-a") == 2
    assert loyalty.purchase_count("cust-b") == 0


def test_no_discount_below_the_minimum():
    assert loyalty.compute_discount_inr(799.99, policy=POLICY) == 0.0


def test_discount_applies_at_exactly_the_minimum():
    assert loyalty.compute_discount_inr(800.0, policy=POLICY) == 150.0


def test_discount_applies_above_the_minimum():
    assert loyalty.compute_discount_inr(5000.0, policy=POLICY) == 150.0


def test_discount_never_exceeds_the_order_amount():
    huge_discount_policy = LoyaltyPolicyConfig(min_purchase_for_discount_inr=10, discount_inr=5000)
    assert loyalty.compute_discount_inr(100.0, policy=huge_discount_policy) == 100.0


def test_discount_is_independent_of_customer_identity():
    # No customer_id parameter at all — the rule is purely a function of
    # order value.
    assert loyalty.compute_discount_inr(900.0, policy=POLICY) == 150.0


def test_clear_resets_purchase_counts():
    loyalty.record_purchase("cust-a")
    loyalty.clear()
    assert loyalty.purchase_count("cust-a") == 0
