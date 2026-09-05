"""core.bundle_policy.matching_bundle's own scoping logic, independent of
where it's wired into MerchantAgent.min_acceptable_price — see
test_merchant_agent.py for the pricing integration."""

from core.bundle_policy import matching_bundle
from models.schemas import BundlePolicyConfig, BundleRule, Product


def _product(product_id: str = "sku-1", category: str = "electronics") -> Product:
    return Product(
        product_id=product_id,
        name=product_id,
        price_inr=1000.0,
        stock=10,
        category=category,
        description="",
        return_policy="No returns",
        max_qty_per_order=5,
    )


def test_no_match_with_empty_bundle_list():
    policy = BundlePolicyConfig(bundles=[])
    assert matching_bundle(_product(), quantity=5, policy=policy) is None


def test_matches_by_explicit_product_id():
    product = _product("sku-1")
    policy = BundlePolicyConfig(
        bundles=[BundleRule(name="A", product_ids=["sku-1"], min_items=2, discount_pct=0.1)]
    )
    assert matching_bundle(product, quantity=2, policy=policy).name == "A"


def test_matches_by_category():
    product = _product("sku-1", category="home")
    policy = BundlePolicyConfig(
        bundles=[BundleRule(name="A", category="home", min_items=2, discount_pct=0.1)]
    )
    assert matching_bundle(product, quantity=2, policy=policy).name == "A"


def test_does_not_match_wrong_product_id_or_category():
    product = _product("sku-1", category="electronics")
    policy = BundlePolicyConfig(
        bundles=[
            BundleRule(
                name="A", product_ids=["sku-2"], category="home", min_items=1, discount_pct=0.1
            )
        ]
    )
    assert matching_bundle(product, quantity=5, policy=policy) is None


def test_does_not_match_below_min_items():
    product = _product("sku-1")
    policy = BundlePolicyConfig(
        bundles=[BundleRule(name="A", product_ids=["sku-1"], min_items=3, discount_pct=0.1)]
    )
    assert matching_bundle(product, quantity=2, policy=policy) is None


def test_returns_first_matching_rule():
    product = _product("sku-1")
    policy = BundlePolicyConfig(
        bundles=[
            BundleRule(name="First", product_ids=["sku-1"], min_items=1, discount_pct=0.05),
            BundleRule(name="Second", product_ids=["sku-1"], min_items=1, discount_pct=0.2),
        ]
    )
    assert matching_bundle(product, quantity=1, policy=policy).name == "First"
