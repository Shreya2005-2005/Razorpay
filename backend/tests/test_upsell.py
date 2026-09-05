"""core.upsell.find_upsell_candidate's own selection logic, independent of
where it's wired into checkout — see test_checkout.py for the integration
points (accept/decline against budget and policy)."""

from core.upsell import find_upsell_candidate
from models.schemas import Product, UpsellPolicyConfig


def _product(product_id: str, category: str, price_inr: float, stock: int = 10) -> Product:
    return Product(
        product_id=product_id,
        name=product_id,
        price_inr=price_inr,
        stock=stock,
        category=category,
        description="",
        return_policy="No returns",
        max_qty_per_order=5,
    )


def test_returns_none_when_disabled():
    product = _product("a", "gifts", 500)
    catalog = [product, _product("b", "gifts", 100)]
    policy = UpsellPolicyConfig(enabled=False, pairs_with={}, category_fallback=True)

    assert find_upsell_candidate(product, catalog, policy=policy) is None


def test_uses_explicit_pair_when_configured():
    product = _product("a", "gifts", 500)
    paired = _product("b", "gifts", 49)
    unrelated_cheaper = _product("c", "gifts", 10)
    catalog = [product, paired, unrelated_cheaper]
    policy = UpsellPolicyConfig(enabled=True, pairs_with={"a": "b"}, category_fallback=True)

    candidate = find_upsell_candidate(product, catalog, policy=policy)

    assert candidate is not None
    assert candidate.product_id == "b"


def test_ignores_explicit_pair_if_out_of_stock():
    product = _product("a", "gifts", 500)
    paired_out_of_stock = _product("b", "gifts", 49, stock=0)
    fallback_candidate = _product("c", "gifts", 100)
    catalog = [product, paired_out_of_stock, fallback_candidate]
    policy = UpsellPolicyConfig(enabled=True, pairs_with={"a": "b"}, category_fallback=True)

    candidate = find_upsell_candidate(product, catalog, policy=policy)

    assert candidate is not None
    assert candidate.product_id == "c"


def test_falls_back_to_cheapest_same_category_item():
    product = _product("a", "gifts", 500)
    pricier_same_category = _product("b", "gifts", 200)
    cheaper_same_category = _product("c", "gifts", 50)
    different_category = _product("d", "home", 10)
    catalog = [product, pricier_same_category, cheaper_same_category, different_category]
    policy = UpsellPolicyConfig(enabled=True, pairs_with={}, category_fallback=True)

    candidate = find_upsell_candidate(product, catalog, policy=policy)

    assert candidate is not None
    assert candidate.product_id == "c"


def test_no_candidate_when_category_fallback_disabled_and_no_explicit_pair():
    product = _product("a", "gifts", 500)
    catalog = [product, _product("b", "gifts", 50)]
    policy = UpsellPolicyConfig(enabled=True, pairs_with={}, category_fallback=False)

    assert find_upsell_candidate(product, catalog, policy=policy) is None


def test_no_candidate_when_no_other_in_stock_item_in_category():
    product = _product("a", "gifts", 500)
    out_of_stock_same_category = _product("b", "gifts", 50, stock=0)
    catalog = [product, out_of_stock_same_category]
    policy = UpsellPolicyConfig(enabled=True, pairs_with={}, category_fallback=True)

    assert find_upsell_candidate(product, catalog, policy=policy) is None
