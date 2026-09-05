"""Bundle discount rules loaded from config/bundle_policy.yaml — see
core.merchant_agent.MerchantAgent.min_acceptable_price, which applies these
alongside the bulk-discount/category-promotion rules."""

from functools import lru_cache
from pathlib import Path

import yaml

from models.schemas import BundlePolicyConfig, BundleRule, Product

BUNDLE_POLICY_PATH = Path(__file__).resolve().parent.parent / "config" / "bundle_policy.yaml"


@lru_cache
def load_bundle_policy() -> BundlePolicyConfig:
    """Load and cache the bundle config from config/bundle_policy.yaml."""
    raw = yaml.safe_load(BUNDLE_POLICY_PATH.read_text(encoding="utf-8"))
    return BundlePolicyConfig(**raw)


def matching_bundle(
    product: Product, quantity: int, policy: BundlePolicyConfig | None = None
) -> BundleRule | None:
    """The first bundle rule this product+quantity qualifies for, or None."""
    policy = policy or load_bundle_policy()
    for bundle in policy.bundles:
        matches_scope = product.product_id in bundle.product_ids or (
            bundle.category is not None and product.category == bundle.category
        )
        if matches_scope and quantity >= bundle.min_items:
            return bundle
    return None
