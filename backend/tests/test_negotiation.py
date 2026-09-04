from core.merchant_agent import MerchantAgent
from core.negotiation import negotiate
from models.schemas import MerchantPolicyConfig


def test_merchant_accepts_offer_at_or_above_floor(product, merchant_policy):
    merchant = MerchantAgent(policy=merchant_policy)
    floor = merchant.min_acceptable_price(product, quantity=1)

    result = negotiate(product=product, quantity=1, opening_offer_inr=floor, merchant=merchant)

    assert result.accepted is True
    assert result.final_price_inr is not None
    assert result.final_price_inr <= product.price_inr
    assert result.turns == 1


def test_buyer_and_merchant_converge_when_offer_below_floor_but_in_flex_range(
    product, merchant_policy
):
    merchant = MerchantAgent(policy=merchant_policy)
    floor = merchant.min_acceptable_price(product, quantity=1)
    # Opening offer a little under the floor — buyer's 15% flexibility should
    # let the two sides meet somewhere in between within MAX_ROUNDS.
    opening_offer = floor * 0.95

    result = negotiate(
        product=product, quantity=1, opening_offer_inr=opening_offer, merchant=merchant
    )

    assert result.accepted is True
    assert result.final_price_inr is not None
    assert result.final_price_inr >= floor - 0.01


def test_negotiation_fails_when_offer_far_below_floor(product, merchant_policy):
    merchant = MerchantAgent(policy=merchant_policy)
    floor = merchant.min_acceptable_price(product, quantity=1)
    # Opening far enough below floor that even buyer's max flexibility (15%)
    # can't reach it.
    opening_offer = floor * 0.5

    result = negotiate(
        product=product, quantity=1, opening_offer_inr=opening_offer, merchant=merchant
    )

    assert result.accepted is False
    assert result.final_price_inr is None
    assert result.turns >= 1


def test_settled_price_never_exceeds_list_price(product, merchant_policy):
    merchant = MerchantAgent(policy=merchant_policy)
    # Opening offer above list price should still settle at/under list price.
    result = negotiate(
        product=product,
        quantity=1,
        opening_offer_inr=product.price_inr * 2,
        merchant=merchant,
    )

    assert result.accepted is True
    assert result.final_price_inr <= product.price_inr


def test_negotiation_emits_turn_events_to_audit_trail(product, merchant_policy):
    from core.audit_trail import audit_trail

    merchant = MerchantAgent(policy=merchant_policy)
    floor = merchant.min_acceptable_price(product, quantity=1)
    negotiate(product=product, quantity=1, opening_offer_inr=floor, merchant=merchant)

    events = audit_trail.history()
    assert len(events) >= 2
    assert all(e.event_type == "negotiation_turn" for e in events)
    assert {e.actor for e in events} == {"buyer_agent", "merchant_agent"}


def test_bulk_quantity_unlocks_better_merchant_floor(product, merchant_policy):
    merchant = MerchantAgent(policy=merchant_policy)
    single_unit_floor = merchant.min_acceptable_price(product, quantity=1)
    bulk_floor = merchant.min_acceptable_price(
        product, quantity=merchant_policy.bulk_discount_min_qty
    )

    assert bulk_floor <= single_unit_floor


def test_settlement_metadata_includes_list_price_and_quantity_on_merchant_accept(
    product, merchant_policy
):
    """The "merchant accepts" path — the settlement metadata needs
    list_price_inr/quantity alongside settled_price_inr so the frontend can
    compute savings without re-deriving pricing logic."""
    from core.audit_trail import audit_trail

    merchant = MerchantAgent(policy=merchant_policy)
    floor = merchant.min_acceptable_price(product, quantity=1)

    negotiate(product=product, quantity=1, opening_offer_inr=floor, merchant=merchant)

    settlement_events = [e for e in audit_trail.history() if "accepts" in e.message]
    assert len(settlement_events) == 1
    meta = settlement_events[0].metadata
    assert meta["settled_price_inr"] == floor
    assert meta["list_price_inr"] == product.price_inr
    assert meta["quantity"] == 1


def test_settlement_metadata_includes_list_price_and_quantity_on_buyer_accept():
    """The other settlement path — buyer accepts the merchant's counter,
    rather than the merchant accepting the buyer's offer outright."""
    from core.audit_trail import audit_trail
    from models.schemas import Product

    product = Product(
        product_id="sku-2",
        name="Desk Lamp",
        price_inr=1000.0,
        stock=10,
        category="home",
        description="A desk lamp",
        return_policy="30-day return",
        max_qty_per_order=5,
    )
    # Tuned so round 1 settles via "buyer accepts merchant's counter":
    # floor (850) is high enough that the merchant's round-1 counter (940,
    # per MERCHANT_CONCESSION_SCHEDULE[0]=0.4) falls within the buyer's 15%
    # flexibility above their opening offer (830 * 1.15 = 954.5).
    policy = MerchantPolicyConfig(
        max_discount_pct=0.15,
        bulk_discount_min_qty=1,
        cost_floor_pct=0.85,
        active_promotion=None,
    )
    merchant = MerchantAgent(policy=policy)

    result = negotiate(product=product, quantity=1, opening_offer_inr=830, merchant=merchant)

    assert result.accepted is True
    assert result.final_price_inr == 940.0

    settlement_events = [e for e in audit_trail.history() if "buyer accepts" in e.message]
    assert len(settlement_events) == 1
    meta = settlement_events[0].metadata
    assert meta["settled_price_inr"] == 940.0
    assert meta["list_price_inr"] == 1000.0
    assert meta["quantity"] == 1
