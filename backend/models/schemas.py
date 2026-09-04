"""Pydantic request/response models shared by every route and core module.
No plain/untyped dicts cross a route boundary — this file is the single
source of truth for every shape that does."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class Product(BaseModel):
    """A catalog item, normalized into the standard schema by core.catalog_translator."""

    product_id: str
    name: str
    price_inr: float
    stock: int
    category: str
    description: str
    return_policy: str
    max_qty_per_order: int


class PolicyConfig(BaseModel):
    """Buyer-side guardrails loaded from config/policy.yaml."""

    max_spend_per_order: float
    max_orders_per_session: int
    allowed_categories: list[str]
    blocked_categories: list[str]
    requires_human_approval_above: float


class PolicyResult(BaseModel):
    """Outcome of a policy_guard.check_order call."""

    allowed: bool
    reason: str


AuditActor = Literal["buyer_agent", "merchant_agent", "policy_guard", "razorpay", "system"]
AuditEventType = Literal[
    "decision",
    "guardrail_check",
    "negotiation_turn",
    "payment_call",
    "failure",
    "recovery",
    "stopped",
]


class AuditEvent(BaseModel):
    """One entry in the business audit trail (core.audit_trail)."""

    timestamp: str
    actor: AuditActor
    event_type: AuditEventType
    message: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    session_id: str = ""


class AuditEventRequest(BaseModel):
    """Body for manually emitting a test audit event via POST /api/audit/events."""

    actor: AuditActor
    event_type: AuditEventType
    message: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    session_id: str = ""


class NegotiationRequest(BaseModel):
    """Body for a standalone negotiation request (not currently exposed as a route)."""

    product_id: str
    offer_inr: float
    quantity: int = 1


class NegotiationResult(BaseModel):
    """Outcome of a core.negotiation.negotiate call."""

    product_id: str
    final_price_inr: float | None
    accepted: bool
    turns: int
    reason: str


class ActivePromotion(BaseModel):
    """A category-wide discount the merchant is currently running."""

    category: str
    discount_pct: float


class MerchantPolicyConfig(BaseModel):
    """Merchant-side pricing/discount rules loaded from config/merchant_policy.yaml."""

    max_discount_pct: float
    bulk_discount_min_qty: int
    cost_floor_pct: float
    active_promotion: ActivePromotion | None = None


class PaymentResult(BaseModel):
    """Outcome of a Razorpay payment, as settled by core.payments.finalize_payment."""

    success: bool
    order_id: str | None = None
    payment_id: str | None = None
    amount_inr: float | None = None
    status: str
    reason: str | None = None


class CheckoutRequest(BaseModel):
    """Body for POST /api/payment/checkout."""

    catalog_file: str = "catalog_demo_1.csv"
    product_id: str
    quantity: int = 1
    unit_price_inr: float | None = None
    orders_this_session: int = 0


class CheckoutStartResult(BaseModel):
    """Outcome of core.checkout.initiate_checkout: blocked, declined, or awaiting payment."""

    status: str
    order_id: str | None = None
    amount_inr: float | None = None
    checkout_url: str | None = None
    status_url: str | None = None
    reason: str | None = None


class PaymentCallbackRequest(BaseModel):
    """Body the browser checkout page posts once Razorpay reports an outcome."""

    order_id: str
    payment_id: str
    signature: str | None = None


FailureMode = Literal["stock_out", "payment_decline"]


class FailureInjectionRequest(BaseModel):
    """Body for POST /api/failure-injector/arm."""

    product_id: str
    mode: FailureMode


class FailureInjectorStatus(BaseModel):
    """Every product currently armed with a failure mode, keyed by product_id."""

    armed: dict[str, FailureMode]


class SessionStartRequest(BaseModel):
    """Body for POST /api/session/start."""

    goal: str
    budget_inr: float
    catalog_file: str = "catalog_demo_1.csv"


class OrderCheckRequest(BaseModel):
    """Body for POST /api/policy/check-order — a policy dry-run, no checkout."""

    catalog_file: str = "catalog_demo_1.csv"
    product_id: str
    quantity: int = 1
    orders_this_session: int = 0


class SessionResult(BaseModel):
    """Response for POST /api/session/start: the buyer agent's final answer."""

    final_message: str
