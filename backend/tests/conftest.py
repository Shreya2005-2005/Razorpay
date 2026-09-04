import os

import pytest

os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("RAZORPAY_KEY_ID", "test-key-id")
os.environ.setdefault("RAZORPAY_KEY_SECRET", "test-key-secret")

from core import failure_injector  # noqa: E402
from core.audit_trail import audit_trail  # noqa: E402
from models.schemas import MerchantPolicyConfig, PolicyConfig, Product  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_module_singleton_state():
    """core.audit_trail and core.failure_injector are process-wide singletons
    (in-memory state, no persistence layer yet — see the Phase 2 roadmap).
    Reset both around every test so tests can't leak state into each other."""
    failure_injector.clear()
    audit_trail._history.clear()
    audit_trail._subscribers.clear()
    yield
    failure_injector.clear()
    audit_trail._history.clear()
    audit_trail._subscribers.clear()


@pytest.fixture
def product() -> Product:
    return Product(
        product_id="sku-1",
        name="Wireless Mouse",
        price_inr=1000.0,
        stock=10,
        category="electronics",
        description="A wireless mouse",
        return_policy="30-day return",
        max_qty_per_order=5,
    )


@pytest.fixture
def policy() -> PolicyConfig:
    return PolicyConfig(
        max_spend_per_order=5000.0,
        max_orders_per_session=3,
        allowed_categories=[],
        blocked_categories=["weapons"],
        requires_human_approval_above=4000.0,
    )


@pytest.fixture
def merchant_policy() -> MerchantPolicyConfig:
    return MerchantPolicyConfig(
        max_discount_pct=0.2,
        bulk_discount_min_qty=5,
        cost_floor_pct=0.7,
        active_promotion=None,
    )
