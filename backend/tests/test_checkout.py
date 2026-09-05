"""core.checkout.initiate_checkout's loyalty-discount, upsell, and
coupon-nudge-conversion integration: applying/offering things deterministically
at checkout time, and never on a path that doesn't actually create an order."""

from core import failure_injector, loyalty
from core.audit_trail import audit_trail, session_scope
from core.checkout import initiate_checkout
from models.schemas import LoyaltyPolicyConfig, PolicyConfig, Product, UpsellPolicyConfig

LOYALTY_POLICY = LoyaltyPolicyConfig(min_purchase_for_discount_inr=800, discount_inr=150)

# Deliberately far from any test's order amounts, so upsell/nudge tests below
# don't accidentally also trigger the loyalty discount unless they mean to.
NO_LOYALTY_POLICY = LoyaltyPolicyConfig(min_purchase_for_discount_inr=999999, discount_inr=150)


def _fake_create_order(monkeypatch, order_id: str = "order_test_1"):
    calls = []

    def _fake(product_id, amount_inr, receipt, customer_id=None):
        calls.append(
            {"product_id": product_id, "amount_inr": amount_inr, "customer_id": customer_id}
        )
        return {"id": order_id}

    monkeypatch.setattr("core.checkout.create_order", _fake)
    return calls


def _use_loyalty_policy(monkeypatch, policy: LoyaltyPolicyConfig = LOYALTY_POLICY):
    monkeypatch.setattr(loyalty, "load_loyalty_policy", lambda: policy)


def test_applies_discount_when_order_meets_minimum(monkeypatch, product):
    product.category = "electronics"
    product.price_inr = 1000.0
    _use_loyalty_policy(monkeypatch)
    calls = _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product, quantity=1, orders_this_session=0, customer_id="cust-a"
    )

    assert result.status == "awaiting_payment"
    assert result.amount_inr == 850.0
    assert calls[0]["amount_inr"] == 850.0

    applied_events = [
        e for e in audit_trail.history() if e.event_type == "loyalty_discount_applied"
    ]
    assert len(applied_events) == 1
    assert applied_events[0].metadata["discount_inr"] == 150
    assert applied_events[0].metadata["customer_id"] == "cust-a"


def test_does_not_apply_discount_below_minimum(monkeypatch, product):
    product.category = "electronics"
    product.price_inr = 500.0
    _use_loyalty_policy(monkeypatch)
    calls = _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product, quantity=1, orders_this_session=0, customer_id="cust-a"
    )

    assert result.amount_inr == 500.0
    assert calls[0]["amount_inr"] == 500.0
    assert not any(e.event_type == "loyalty_discount_applied" for e in audit_trail.history())


def test_applies_regardless_of_customer_id(monkeypatch, product):
    # The discount is purely a function of order value — an anonymous buyer
    # (no customer_id) qualifies exactly the same as a known one.
    product.category = "electronics"
    product.price_inr = 1000.0
    _use_loyalty_policy(monkeypatch)
    _fake_create_order(monkeypatch)

    result = initiate_checkout(product=product, quantity=1, orders_this_session=0)

    assert result.amount_inr == 850.0
    assert any(e.event_type == "loyalty_discount_applied" for e in audit_trail.history())


def test_discount_never_makes_the_order_amount_negative(monkeypatch, product):
    product.category = "electronics"
    product.price_inr = 100.0
    huge_discount_policy = LoyaltyPolicyConfig(min_purchase_for_discount_inr=10, discount_inr=5000)
    _use_loyalty_policy(monkeypatch, huge_discount_policy)
    _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product, quantity=1, orders_this_session=0, customer_id="cust-a"
    )

    assert result.amount_inr == 0.0


def test_payment_decline_path_does_not_apply_discount(monkeypatch, product):
    product.category = "electronics"
    product.price_inr = 1000.0
    _use_loyalty_policy(monkeypatch)
    _fake_create_order(monkeypatch)
    failure_injector.arm(product.product_id, "payment_decline")

    result = initiate_checkout(
        product=product, quantity=1, orders_this_session=0, customer_id="cust-a"
    )

    assert result.status == "failed"
    assert not any(e.event_type == "loyalty_discount_applied" for e in audit_trail.history())


def test_policy_blocked_path_does_not_apply_discount(monkeypatch, product):
    product.category = "electronics"
    product.price_inr = 1000.0
    _use_loyalty_policy(monkeypatch)
    _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product,
        quantity=product.max_qty_per_order + 1,  # trips the per-order quantity cap
        orders_this_session=0,
        customer_id="cust-a",
    )

    assert result.status == "blocked_by_policy"
    assert not any(e.event_type == "loyalty_discount_applied" for e in audit_trail.history())


def _addon(
    product_id: str = "addon-1", price_inr: float = 49.0, category: str = "gifts"
) -> Product:
    return Product(
        product_id=product_id,
        name="Gift Wrap",
        price_inr=price_inr,
        stock=10,
        category=category,
        description="",
        return_policy="No returns",
        max_qty_per_order=5,
    )


def test_upsell_offered_and_accepted_when_it_fits_budget_and_policy(monkeypatch, product):
    product.category = "gifts"
    product.price_inr = 500.0
    addon = _addon()
    _use_loyalty_policy(monkeypatch, NO_LOYALTY_POLICY)
    monkeypatch.setattr(
        "core.checkout.load_policy",
        lambda: PolicyConfig(
            max_spend_per_order=100000,
            max_orders_per_session=1,
            allowed_categories=[],
            blocked_categories=[],
            requires_human_approval_above=100000,
        ),
    )
    calls = _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product,
        quantity=1,
        orders_this_session=0,
        catalog=[product, addon],
        budget_inr=1000.0,
    )

    assert result.status == "awaiting_payment"
    assert result.amount_inr == 549.0
    assert calls[0]["amount_inr"] == 549.0
    assert result.upsell is not None
    assert result.upsell.accepted is True
    assert result.upsell.product_id == "addon-1"

    offered = [e for e in audit_trail.history() if e.event_type == "upsell_offered"]
    accepted = [e for e in audit_trail.history() if e.event_type == "upsell_accepted"]
    assert len(offered) == 1
    assert len(accepted) == 1


def test_upsell_declined_when_it_exceeds_remaining_budget(monkeypatch, product):
    product.category = "gifts"
    product.price_inr = 500.0
    addon = _addon(price_inr=49.0)
    _use_loyalty_policy(monkeypatch, NO_LOYALTY_POLICY)
    monkeypatch.setattr(
        "core.checkout.load_policy",
        lambda: PolicyConfig(
            max_spend_per_order=100000,
            max_orders_per_session=1,
            allowed_categories=[],
            blocked_categories=[],
            requires_human_approval_above=100000,
        ),
    )
    calls = _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product,
        quantity=1,
        orders_this_session=0,
        catalog=[product, addon],
        budget_inr=500.0,  # exactly covers the base product, nothing left for the add-on
    )

    assert result.amount_inr == 500.0
    assert calls[0]["amount_inr"] == 500.0
    assert result.upsell is not None
    assert result.upsell.accepted is False

    declined = [e for e in audit_trail.history() if e.event_type == "upsell_declined"]
    assert len(declined) == 1


def test_upsell_declined_when_it_would_require_human_approval(monkeypatch, product):
    product.category = "gifts"
    product.price_inr = 2980.0
    addon = _addon(price_inr=49.0)
    _use_loyalty_policy(monkeypatch, NO_LOYALTY_POLICY)
    monkeypatch.setattr(
        "core.checkout.load_policy",
        lambda: PolicyConfig(
            max_spend_per_order=100000,
            max_orders_per_session=1,
            allowed_categories=[],
            blocked_categories=[],
            requires_human_approval_above=3000,
        ),
    )
    _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product,
        quantity=1,
        orders_this_session=0,
        catalog=[product, addon],
        budget_inr=10000.0,  # budget is not the limiting factor here
    )

    assert result.upsell is not None
    assert result.upsell.accepted is False
    assert result.amount_inr == 2980.0


def test_upsell_declined_when_addon_category_is_blocked(monkeypatch, product):
    product.category = "gifts"
    product.price_inr = 500.0
    addon = _addon(category="alcohol")
    _use_loyalty_policy(monkeypatch, NO_LOYALTY_POLICY)
    # An explicit pair, since the default category-fallback would never
    # surface a different-category item like this addon as a candidate.
    monkeypatch.setattr(
        "core.upsell.load_upsell_policy",
        lambda: UpsellPolicyConfig(
            enabled=True, pairs_with={product.product_id: addon.product_id}, category_fallback=True
        ),
    )
    monkeypatch.setattr(
        "core.checkout.load_policy",
        lambda: PolicyConfig(
            max_spend_per_order=100000,
            max_orders_per_session=1,
            allowed_categories=[],
            blocked_categories=["alcohol"],
            requires_human_approval_above=100000,
        ),
    )
    _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product,
        quantity=1,
        orders_this_session=0,
        catalog=[product, addon],
        budget_inr=10000.0,
    )

    assert result.upsell is not None
    assert result.upsell.accepted is False
    assert result.amount_inr == 500.0


def test_no_upsell_offered_without_catalog_or_budget(monkeypatch, product):
    product.category = "gifts"
    product.price_inr = 500.0
    _use_loyalty_policy(monkeypatch, NO_LOYALTY_POLICY)
    _fake_create_order(monkeypatch)

    result = initiate_checkout(product=product, quantity=1, orders_this_session=0)

    assert result.upsell is None
    assert not any(e.event_type == "upsell_offered" for e in audit_trail.history())


def test_no_upsell_offered_when_no_candidate_in_catalog(monkeypatch, product):
    product.category = "gifts"
    product.price_inr = 500.0
    _use_loyalty_policy(monkeypatch, NO_LOYALTY_POLICY)
    _fake_create_order(monkeypatch)

    result = initiate_checkout(
        product=product,
        quantity=1,
        orders_this_session=0,
        catalog=[product],  # nothing else in the catalog to offer
        budget_inr=10000.0,
    )

    assert result.upsell is None
    assert not any(e.event_type == "upsell_offered" for e in audit_trail.history())


def test_coupon_nudge_converted_emitted_when_prior_nudge_shown_this_session(monkeypatch, product):
    product.category = "electronics"
    product.price_inr = 1000.0
    _use_loyalty_policy(monkeypatch, LOYALTY_POLICY)
    _fake_create_order(monkeypatch)

    with session_scope("session-nudge-1"):
        audit_trail.emit(
            actor="merchant_agent",
            event_type="coupon_nudge_shown",
            message="Add ₹50 more to unlock ₹150 off!",
            metadata={"product_id": product.product_id},
        )
        result = initiate_checkout(
            product=product, quantity=1, orders_this_session=0, customer_id="cust-a"
        )

    assert result.status == "awaiting_payment"
    converted = [e for e in audit_trail.history() if e.event_type == "coupon_nudge_converted"]
    assert len(converted) == 1
    assert converted[0].metadata["product_id"] == product.product_id


def test_no_coupon_nudge_converted_without_a_prior_nudge(monkeypatch, product):
    product.category = "electronics"
    product.price_inr = 1000.0
    _use_loyalty_policy(monkeypatch, LOYALTY_POLICY)
    _fake_create_order(monkeypatch)

    initiate_checkout(product=product, quantity=1, orders_this_session=0, customer_id="cust-a")

    assert not any(e.event_type == "coupon_nudge_converted" for e in audit_trail.history())
