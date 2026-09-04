from core.merchant_agent import MerchantAgent
from core.negotiation import negotiate


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
