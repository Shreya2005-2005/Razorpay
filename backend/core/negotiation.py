"""Bounded back-and-forth negotiation between a buyer's opening offer and
the merchant's deterministic pricing floor."""

from core.audit_trail import audit_trail
from core.loyalty import load_loyalty_policy
from core.merchant_agent import MerchantAgent
from models.schemas import NegotiationResult, Product

MAX_ROUNDS = 4
# Fraction of the (list_price - floor) gap the merchant concedes by round N.
MERCHANT_CONCESSION_SCHEDULE = [0.4, 0.7, 1.0, 1.0]
BUYER_FLEXIBILITY_PCT = 0.15  # buyer will go up to 15% above their opening offer
BUYER_MEET_FRACTION = 0.5  # buyer closes half the remaining gap toward the merchant's counter


def _emit_low_stock_signal(product: Product, merchant: MerchantAgent) -> None:
    if not merchant.is_low_stock(product):
        return
    audit_trail.emit(
        actor="merchant_agent",
        event_type="low_stock_flagged",
        message=f"Only {product.stock} left in stock for {product.product_id}",
        metadata={"product_id": product.product_id, "stock": product.stock},
    )


def _emit_bundle_signal(product: Product, quantity: int, merchant: MerchantAgent) -> None:
    bundle = merchant.matched_bundle(product, quantity)
    if bundle is None:
        return
    audit_trail.emit(
        actor="merchant_agent",
        event_type="bundle_discount_applied",
        message=(
            f"Bundle discount '{bundle.name}' applied: "
            f"{bundle.discount_pct * 100:.0f}% off for {quantity}x {product.product_id}"
        ),
        metadata={
            "product_id": product.product_id,
            "quantity": quantity,
            "bundle_name": bundle.name,
            "discount_pct": bundle.discount_pct,
        },
    )


def _emit_coupon_nudge_signal(product: Product, quantity: int, settled_price_inr: float) -> None:
    loyalty_policy = load_loyalty_policy()
    total_inr = round(settled_price_inr * quantity, 2)
    threshold_inr = loyalty_policy.min_purchase_for_discount_inr
    if not (threshold_inr - loyalty_policy.nudge_margin_inr <= total_inr < threshold_inr):
        return
    shortfall_inr = round(threshold_inr - total_inr, 2)
    audit_trail.emit(
        actor="merchant_agent",
        event_type="coupon_nudge_shown",
        message=(
            f"Add ₹{shortfall_inr:.2f} more to unlock ₹{loyalty_policy.discount_inr:.0f} off!"
        ),
        metadata={
            "product_id": product.product_id,
            "total_inr": total_inr,
            "shortfall_inr": shortfall_inr,
            "threshold_inr": threshold_inr,
            "discount_inr": loyalty_policy.discount_inr,
        },
    )


def negotiate(
    product: Product,
    quantity: int,
    opening_offer_inr: float,
    merchant: MerchantAgent | None = None,
) -> NegotiationResult:
    """Run a bounded back-and-forth between the buyer's opening offer and the
    merchant's deterministic pricing floor, logging every round to the audit trail."""
    merchant = merchant or MerchantAgent()
    floor = merchant.min_acceptable_price(product, quantity)
    buyer_ceiling = opening_offer_inr * (1 + BUYER_FLEXIBILITY_PCT)
    buyer_offer = round(opening_offer_inr, 2)

    _emit_low_stock_signal(product, merchant)

    for round_num in range(1, MAX_ROUNDS + 1):
        audit_trail.emit(
            actor="buyer_agent",
            event_type="negotiation_turn",
            message=(
                f"Round {round_num}: buyer offers ₹{buyer_offer:.2f}/unit for "
                f"{product.product_id} x{quantity}"
            ),
            metadata={
                "product_id": product.product_id,
                "quantity": quantity,
                "offer_inr": buyer_offer,
                "round": round_num,
            },
        )

        if buyer_offer >= floor:
            settled_price = round(min(buyer_offer, product.price_inr), 2)
            audit_trail.emit(
                actor="merchant_agent",
                event_type="negotiation_turn",
                message=f"Round {round_num}: merchant accepts at ₹{settled_price:.2f}/unit",
                metadata={
                    "product_id": product.product_id,
                    "settled_price_inr": settled_price,
                    "list_price_inr": product.price_inr,
                    "quantity": quantity,
                    "round": round_num,
                },
            )
            _emit_bundle_signal(product, quantity, merchant)
            _emit_coupon_nudge_signal(product, quantity, settled_price)
            return NegotiationResult(
                product_id=product.product_id,
                final_price_inr=settled_price,
                accepted=True,
                turns=round_num,
                reason="Merchant accepted the buyer's offer",
            )

        concession_fraction = MERCHANT_CONCESSION_SCHEDULE[
            min(round_num - 1, len(MERCHANT_CONCESSION_SCHEDULE) - 1)
        ]
        merchant_counter = round(
            product.price_inr - (product.price_inr - floor) * concession_fraction, 2
        )

        audit_trail.emit(
            actor="merchant_agent",
            event_type="negotiation_turn",
            message=f"Round {round_num}: merchant counters at ₹{merchant_counter:.2f}/unit",
            metadata={
                "product_id": product.product_id,
                "counter_inr": merchant_counter,
                "round": round_num,
            },
        )

        if merchant_counter <= buyer_ceiling:
            audit_trail.emit(
                actor="buyer_agent",
                event_type="negotiation_turn",
                message=(
                    f"Round {round_num}: buyer accepts merchant's counter of "
                    f"₹{merchant_counter:.2f}/unit"
                ),
                metadata={
                    "product_id": product.product_id,
                    "settled_price_inr": merchant_counter,
                    "list_price_inr": product.price_inr,
                    "quantity": quantity,
                    "round": round_num,
                },
            )
            _emit_bundle_signal(product, quantity, merchant)
            _emit_coupon_nudge_signal(product, quantity, merchant_counter)
            return NegotiationResult(
                product_id=product.product_id,
                final_price_inr=merchant_counter,
                accepted=True,
                turns=round_num,
                reason="Buyer accepted the merchant's counter-offer",
            )

        if round_num == MAX_ROUNDS:
            break

        next_buyer_offer = round(
            buyer_offer + (merchant_counter - buyer_offer) * BUYER_MEET_FRACTION, 2
        )
        next_buyer_offer = min(next_buyer_offer, buyer_ceiling)
        if next_buyer_offer <= buyer_offer:
            # Buyer has hit their ceiling and has no more room to concede — further
            # rounds would just repeat the same numbers, so stop here.
            break
        buyer_offer = next_buyer_offer

    audit_trail.emit(
        actor="buyer_agent",
        event_type="failure",
        message=(
            f"Negotiation for {product.product_id} failed to reach agreement "
            f"after {round_num} round(s)"
        ),
        metadata={"product_id": product.product_id, "quantity": quantity},
    )
    return NegotiationResult(
        product_id=product.product_id,
        final_price_inr=None,
        accepted=False,
        turns=round_num,
        reason="No agreement reached — buyer and merchant price ranges did not overlap",
    )
