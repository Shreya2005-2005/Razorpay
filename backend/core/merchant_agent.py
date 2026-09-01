from functools import lru_cache
from pathlib import Path

import yaml

from models.schemas import MerchantPolicyConfig, Product

MERCHANT_POLICY_PATH = Path(__file__).resolve().parent.parent / "config" / "merchant_policy.yaml"


@lru_cache
def load_merchant_policy() -> MerchantPolicyConfig:
    raw = yaml.safe_load(MERCHANT_POLICY_PATH.read_text(encoding="utf-8"))
    return MerchantPolicyConfig(**raw)


class MerchantAgent:
    """Deterministic pricing/discount rules the merchant negotiates within.

    Discount eligibility:
      - committing to `bulk_discount_min_qty`+ units unlocks the full `max_discount_pct`
      - the active category promotion adds its own discount on top, even for single units
      - combined discount is capped at `max_discount_pct`
      - the resulting price can never drop below `cost_floor_pct` of list price
    """

    def __init__(self, policy: MerchantPolicyConfig | None = None):
        self.policy = policy or load_merchant_policy()

    def min_acceptable_price(self, product: Product, quantity: int) -> float:
        discount_pct = 0.0
        if quantity >= self.policy.bulk_discount_min_qty:
            discount_pct = self.policy.max_discount_pct

        promo = self.policy.active_promotion
        if promo and product.category == promo.category:
            discount_pct = min(self.policy.max_discount_pct, discount_pct + promo.discount_pct)

        target_price = product.price_inr * (1 - discount_pct)
        cost_floor = product.price_inr * self.policy.cost_floor_pct
        return round(max(target_price, cost_floor), 2)
