from core.merchant_agent import MerchantAgent
from models.schemas import ActivePromotion, MerchantPolicyConfig


def test_no_discount_below_bulk_threshold_and_no_promotion(product, merchant_policy):
    merchant = MerchantAgent(policy=merchant_policy)
    price = merchant.min_acceptable_price(product, quantity=1)
    assert price == product.price_inr


def test_bulk_quantity_applies_max_discount(product, merchant_policy):
    merchant = MerchantAgent(policy=merchant_policy)
    price = merchant.min_acceptable_price(product, quantity=merchant_policy.bulk_discount_min_qty)
    expected = round(product.price_inr * (1 - merchant_policy.max_discount_pct), 2)
    assert price == expected


def test_matching_promotion_applies_even_for_single_unit(product):
    policy = MerchantPolicyConfig(
        max_discount_pct=0.3,
        bulk_discount_min_qty=10,
        cost_floor_pct=0.5,
        active_promotion=ActivePromotion(category=product.category, discount_pct=0.1),
    )
    merchant = MerchantAgent(policy=policy)
    price = merchant.min_acceptable_price(product, quantity=1)
    expected = round(product.price_inr * (1 - 0.1), 2)
    assert price == expected


def test_promotion_for_different_category_does_not_apply(product):
    policy = MerchantPolicyConfig(
        max_discount_pct=0.3,
        bulk_discount_min_qty=10,
        cost_floor_pct=0.5,
        active_promotion=ActivePromotion(category="groceries", discount_pct=0.5),
    )
    merchant = MerchantAgent(policy=policy)
    price = merchant.min_acceptable_price(product, quantity=1)
    assert price == product.price_inr


def test_combined_discount_capped_at_max_discount_pct(product):
    policy = MerchantPolicyConfig(
        max_discount_pct=0.2,
        bulk_discount_min_qty=1,
        cost_floor_pct=0.1,
        active_promotion=ActivePromotion(category=product.category, discount_pct=0.5),
    )
    merchant = MerchantAgent(policy=policy)
    price = merchant.min_acceptable_price(product, quantity=1)
    expected = round(product.price_inr * (1 - 0.2), 2)
    assert price == expected


def test_price_never_drops_below_cost_floor(product):
    policy = MerchantPolicyConfig(
        max_discount_pct=0.9,
        bulk_discount_min_qty=1,
        cost_floor_pct=0.6,
        active_promotion=None,
    )
    merchant = MerchantAgent(policy=policy)
    price = merchant.min_acceptable_price(product, quantity=1)
    expected = round(product.price_inr * 0.6, 2)
    assert price == expected
