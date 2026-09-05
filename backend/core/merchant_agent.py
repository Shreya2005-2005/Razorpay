"""Merchant-side pricing/discount rules loaded from config/merchant_policy.yaml."""

from functools import lru_cache
from pathlib import Path

import yaml

from core.bundle_policy import load_bundle_policy, matching_bundle
from models.schemas import BundlePolicyConfig, BundleRule, MerchantPolicyConfig, Product

MERCHANT_POLICY_PATH = Path(__file__).resolve().parent.parent / "config" / "merchant_policy.yaml"


@lru_cache
def load_merchant_policy() -> MerchantPolicyConfig:
    """Load and cache the merchant pricing config from config/merchant_policy.yaml."""
    raw = yaml.safe_load(MERCHANT_POLICY_PATH.read_text(encoding="utf-8"))
    return MerchantPolicyConfig(**raw)


class MerchantAgent:
    """Deterministic pricing/discount rules the merchant negotiates within.

    Discount eligibility:
      - committing to `bulk_discount_min_qty`+ units unlocks the full `max_discount_pct`
      - the active category promotion adds its own discount on top, even for single units
      - a matching bundle rule (config/bundle_policy.yaml) adds its own discount too,
        once `min_items` units of a bundle-eligible product are committed to
      - combined discount is capped at `max_discount_pct`
      - the resulting price can never drop below `cost_floor_pct` of list price
    """

    def __init__(
        self,
        policy: MerchantPolicyConfig | None = None,
        bundle_policy: BundlePolicyConfig | None = None,
    ):
        self.policy = policy or load_merchant_policy()
        self.bundle_policy = bundle_policy or load_bundle_policy()

    def matched_bundle(self, product: Product, quantity: int) -> BundleRule | None:
        """The bundle rule (if any) this product+quantity qualifies for."""
        return matching_bundle(product, quantity, policy=self.bundle_policy)

    def min_acceptable_price(self, product: Product, quantity: int) -> float:
        """The lowest per-unit price the merchant will accept for this order,
        after applying any bulk/promotion/bundle discount and the cost floor."""
        discount_pct = 0.0
        if quantity >= self.policy.bulk_discount_min_qty:
            discount_pct = self.policy.max_discount_pct

        promo = self.policy.active_promotion
        if promo and product.category == promo.category:
            discount_pct = min(self.policy.max_discount_pct, discount_pct + promo.discount_pct)

        bundle = self.matched_bundle(product, quantity)
        if bundle is not None:
            discount_pct = min(self.policy.max_discount_pct, discount_pct + bundle.discount_pct)

        target_price = product.price_inr * (1 - discount_pct)
        cost_floor = product.price_inr * self.policy.cost_floor_pct
        return round(max(target_price, cost_floor), 2)

    def is_low_stock(self, product: Product) -> bool:
        """True when fewer than `low_stock_threshold` units remain."""
        return product.stock < self.policy.low_stock_threshold
