"""Deterministic add-on/upsell selection, checked at checkout time — not an
LLM decision, same philosophy as core.merchant_agent and core.loyalty:
pricing/offer rules should be predictable and auditable.

Whether an offered add-on is actually accepted is decided in core.checkout,
against the same budget and policy caps as the primary order — an upsell
can never bypass a policy check the primary order itself was subject to.
"""

from functools import lru_cache
from pathlib import Path

import yaml

from models.schemas import Product, UpsellPolicyConfig

UPSELL_POLICY_PATH = Path(__file__).resolve().parent.parent / "config" / "upsell_policy.yaml"


@lru_cache
def load_upsell_policy() -> UpsellPolicyConfig:
    """Load and cache the upsell config from config/upsell_policy.yaml."""
    raw = yaml.safe_load(UPSELL_POLICY_PATH.read_text(encoding="utf-8"))
    return UpsellPolicyConfig(**raw)


def find_upsell_candidate(
    product: Product,
    catalog: list[Product],
    policy: UpsellPolicyConfig | None = None,
) -> Product | None:
    """The add-on to offer alongside `product`, or None if no candidate
    applies. Prefers an explicit `pairs_with` mapping; falls back to the
    cheapest other in-stock item from the same category."""
    policy = policy or load_upsell_policy()
    if not policy.enabled:
        return None

    paired_id = policy.pairs_with.get(product.product_id)
    if paired_id:
        match = next(
            (p for p in catalog if p.product_id == paired_id and p.stock > 0),
            None,
        )
        if match is not None:
            return match

    if policy.category_fallback:
        candidates = sorted(
            (
                p
                for p in catalog
                if p.category == product.category
                and p.product_id != product.product_id
                and p.stock > 0
            ),
            key=lambda p: p.price_inr,
        )
        if candidates:
            return candidates[0]

    return None
