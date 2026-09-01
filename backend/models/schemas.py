from typing import Literal, Optional

from pydantic import BaseModel, Field


class Product(BaseModel):
    product_id: str
    name: str
    price_inr: float
    stock: int
    category: str
    description: str
    return_policy: str
    max_qty_per_order: int


class PolicyConfig(BaseModel):
    max_spend_per_order: float
    max_orders_per_session: int
    allowed_categories: list[str]
    blocked_categories: list[str]
    requires_human_approval_above: float


class PolicyResult(BaseModel):
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
]


class AuditEvent(BaseModel):
    timestamp: str
    actor: AuditActor
    event_type: AuditEventType
    message: str
    metadata: dict = Field(default_factory=dict)
    session_id: str = ""


class AuditEventRequest(BaseModel):
    actor: AuditActor
    event_type: AuditEventType
    message: str
    metadata: dict = Field(default_factory=dict)
    session_id: str = ""


class NegotiationRequest(BaseModel):
    product_id: str
    offer_inr: float
    quantity: int = 1


class NegotiationResult(BaseModel):
    product_id: str
    final_price_inr: Optional[float]
    accepted: bool
    turns: int
    reason: str


class ActivePromotion(BaseModel):
    category: str
    discount_pct: float


class MerchantPolicyConfig(BaseModel):
    max_discount_pct: float
    bulk_discount_min_qty: int
    cost_floor_pct: float
    active_promotion: Optional[ActivePromotion] = None


class PaymentResult(BaseModel):
    success: bool
    order_id: Optional[str] = None
    payment_id: Optional[str] = None
    amount_inr: Optional[float] = None
    status: str
    reason: Optional[str] = None


class CheckoutRequest(BaseModel):
    catalog_file: str = "catalog_demo_1.csv"
    product_id: str
    quantity: int = 1
    unit_price_inr: Optional[float] = None
    orders_this_session: int = 0


class CheckoutStartResult(BaseModel):
    status: str
    order_id: Optional[str] = None
    amount_inr: Optional[float] = None
    checkout_url: Optional[str] = None
    status_url: Optional[str] = None
    reason: Optional[str] = None


class PaymentCallbackRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: Optional[str] = None


FailureMode = Literal["stock_out", "payment_decline"]


class FailureInjectionRequest(BaseModel):
    product_id: str
    mode: FailureMode


class SessionStartRequest(BaseModel):
    goal: str
    budget_inr: float
    catalog_file: str = "catalog_demo_1.csv"


class OrderCheckRequest(BaseModel):
    catalog_file: str = "catalog_demo_1.csv"
    product_id: str
    quantity: int = 1
    orders_this_session: int = 0


class SessionResult(BaseModel):
    final_message: str
