"""core.first_purchase's own discount/eligibility semantics, independent of
where it's wired into checkout — see test_checkout.py for the integration
points and the priority over the loyalty discount."""

from core import first_purchase, loyalty
from models.schemas import FirstPurchasePolicyConfig

POLICY = FirstPurchasePolicyConfig(enabled=True, discount_pct=0.5)


def test_is_first_purchase_true_for_a_customer_with_no_history():
    assert first_purchase.is_first_purchase("cust-a") is True


def test_is_first_purchase_false_after_a_recorded_purchase():
    loyalty.record_purchase("cust-a")
    assert first_purchase.is_first_purchase("cust-a") is False


def test_is_first_purchase_false_without_a_customer_id():
    assert first_purchase.is_first_purchase(None) is False


def test_is_first_purchase_scoped_per_customer():
    loyalty.record_purchase("cust-a")
    assert first_purchase.is_first_purchase("cust-a") is False
    assert first_purchase.is_first_purchase("cust-b") is True


def test_discount_applies_for_a_new_customer():
    assert first_purchase.compute_discount_inr(1000.0, "cust-a", policy=POLICY) == 500.0


def test_discount_is_zero_for_a_repeat_customer():
    loyalty.record_purchase("cust-a")
    assert first_purchase.compute_discount_inr(1000.0, "cust-a", policy=POLICY) == 0.0


def test_discount_is_zero_without_a_customer_id():
    assert first_purchase.compute_discount_inr(1000.0, None, policy=POLICY) == 0.0


def test_discount_is_zero_when_policy_disabled():
    disabled = FirstPurchasePolicyConfig(enabled=False, discount_pct=0.5)
    assert first_purchase.compute_discount_inr(1000.0, "cust-a", policy=disabled) == 0.0


def test_discount_rounds_to_two_decimal_places():
    policy = FirstPurchasePolicyConfig(enabled=True, discount_pct=1 / 3)
    assert first_purchase.compute_discount_inr(100.0, "cust-a", policy=policy) == 33.33
