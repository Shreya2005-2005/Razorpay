from core.merchant_agent import MerchantAgent
from models.schemas import ActivePromotion, BundlePolicyConfig, BundleRule, MerchantPolicyConfig


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


def test_bundle_discount_applies_when_product_id_matches_and_quantity_met(product, merchant_policy):
    bundle_policy = BundlePolicyConfig(
        bundles=[
            BundleRule(
                name="Test Bundle", product_ids=[product.product_id], min_items=2, discount_pct=0.15
            )
        ]
    )
    merchant = MerchantAgent(policy=merchant_policy, bundle_policy=bundle_policy)

    price = merchant.min_acceptable_price(product, quantity=2)

    expected = round(product.price_inr * (1 - 0.15), 2)
    assert price == expected
    assert merchant.matched_bundle(product, quantity=2).name == "Test Bundle"


def test_bundle_discount_applies_when_category_matches_and_quantity_met(product, merchant_policy):
    bundle_policy = BundlePolicyConfig(
        bundles=[
            BundleRule(
                name="Category Bundle", category=product.category, min_items=3, discount_pct=0.1
            )
        ]
    )
    merchant = MerchantAgent(policy=merchant_policy, bundle_policy=bundle_policy)

    price = merchant.min_acceptable_price(product, quantity=3)

    expected = round(product.price_inr * (1 - 0.1), 2)
    assert price == expected


def test_bundle_discount_does_not_apply_below_min_items(product, merchant_policy):
    bundle_policy = BundlePolicyConfig(
        bundles=[
            BundleRule(
                name="Test Bundle", product_ids=[product.product_id], min_items=2, discount_pct=0.15
            )
        ]
    )
    merchant = MerchantAgent(policy=merchant_policy, bundle_policy=bundle_policy)

    price = merchant.min_acceptable_price(product, quantity=1)

    assert price == product.price_inr
    assert merchant.matched_bundle(product, quantity=1) is None


def test_bundle_discount_does_not_apply_to_unrelated_product(product, merchant_policy):
    bundle_policy = BundlePolicyConfig(
        bundles=[
            BundleRule(
                name="Other Bundle", product_ids=["some-other-sku"], min_items=1, discount_pct=0.5
            )
        ]
    )
    merchant = MerchantAgent(policy=merchant_policy, bundle_policy=bundle_policy)

    # quantity=4 stays under merchant_policy's own bulk_discount_min_qty (5),
    # so only the (non-matching) bundle rule could apply here.
    price = merchant.min_acceptable_price(product, quantity=4)

    assert price == product.price_inr


def test_bundle_and_promotion_discounts_combine_and_are_capped(product):
    policy = MerchantPolicyConfig(
        max_discount_pct=0.2,
        bulk_discount_min_qty=99,
        cost_floor_pct=0.5,
        active_promotion=ActivePromotion(category=product.category, discount_pct=0.1),
    )
    bundle_policy = BundlePolicyConfig(
        bundles=[
            BundleRule(
                name="Test Bundle", product_ids=[product.product_id], min_items=2, discount_pct=0.15
            )
        ]
    )
    merchant = MerchantAgent(policy=policy, bundle_policy=bundle_policy)

    price = merchant.min_acceptable_price(product, quantity=2)

    # 0.1 (promo) + 0.15 (bundle) = 0.25, capped at max_discount_pct (0.2).
    expected = round(product.price_inr * (1 - 0.2), 2)
    assert price == expected


def test_is_low_stock_true_below_threshold(merchant_policy):
    from models.schemas import Product

    low_stock_product = Product(
        product_id="sku-low",
        name="Rare Item",
        price_inr=500.0,
        stock=3,
        category="gifts",
        description="Almost gone",
        return_policy="No returns",
        max_qty_per_order=1,
    )
    merchant = MerchantAgent(policy=merchant_policy)
    assert merchant.is_low_stock(low_stock_product) is True


def test_is_low_stock_false_at_or_above_threshold(product, merchant_policy):
    # product fixture has stock=10, threshold is 5.
    merchant = MerchantAgent(policy=merchant_policy)
    assert merchant.is_low_stock(product) is False
