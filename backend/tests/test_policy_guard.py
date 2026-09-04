from core import failure_injector
from core.policy_guard import check_order


def test_allows_order_within_all_limits(product, policy):
    result = check_order(product=product, quantity=1, orders_this_session=0, policy=policy)
    assert result.allowed is True


def test_blocks_blocked_category(product, policy):
    product.category = "weapons"
    result = check_order(product=product, quantity=1, orders_this_session=0, policy=policy)
    assert result.allowed is False
    assert "blocked" in result.reason.lower()


def test_blocks_category_not_in_allow_list(product, policy):
    policy.allowed_categories = ["groceries"]
    result = check_order(product=product, quantity=1, orders_this_session=0, policy=policy)
    assert result.allowed is False
    assert "not in the allowed list" in result.reason


def test_allows_any_category_when_allow_list_empty(product, policy):
    assert policy.allowed_categories == []
    result = check_order(product=product, quantity=1, orders_this_session=0, policy=policy)
    assert result.allowed is True


def test_blocks_quantity_over_product_max(product, policy):
    result = check_order(
        product=product,
        quantity=product.max_qty_per_order + 1,
        orders_this_session=0,
        policy=policy,
    )
    assert result.allowed is False
    assert "max_qty_per_order" in result.reason


def test_blocks_quantity_over_available_stock(product, policy):
    # Raise max_qty_per_order out of the way so this isolates the stock check
    # specifically, rather than tripping the per-order quantity cap first.
    product.max_qty_per_order = product.stock + 5
    result = check_order(
        product=product, quantity=product.stock + 1, orders_this_session=0, policy=policy
    )
    assert result.allowed is False
    assert "stock" in result.reason.lower()


def test_stock_out_failure_injection_zeroes_available_stock(product, policy):
    failure_injector.arm(product.product_id, "stock_out")
    result = check_order(product=product, quantity=1, orders_this_session=0, policy=policy)
    assert result.allowed is False
    assert "stock" in result.reason.lower()


def test_blocks_order_total_over_spend_cap(product, policy):
    policy.max_spend_per_order = 500.0
    result = check_order(product=product, quantity=1, orders_this_session=0, policy=policy)
    assert result.allowed is False
    assert "max_spend_per_order" in result.reason


def test_blocks_when_session_order_cap_reached(product, policy):
    result = check_order(
        product=product,
        quantity=1,
        orders_this_session=policy.max_orders_per_session,
        policy=policy,
    )
    assert result.allowed is False
    assert "max_orders_per_session" in result.reason


def test_blocks_order_requiring_human_approval(product, policy):
    policy.requires_human_approval_above = 500.0
    policy.max_spend_per_order = 999999.0
    result = check_order(product=product, quantity=1, orders_this_session=0, policy=policy)
    assert result.allowed is False
    assert "human approval" in result.reason


def test_negotiated_price_is_checked_instead_of_list_price(product, policy):
    policy.max_spend_per_order = 500.0
    # List price (1000) would fail the cap; a negotiated price under it should pass.
    result = check_order(
        product=product,
        quantity=1,
        orders_this_session=0,
        unit_price_inr=400.0,
        policy=policy,
    )
    assert result.allowed is True


def test_emits_guardrail_check_event_to_audit_trail(product, policy):
    from core.audit_trail import audit_trail

    check_order(product=product, quantity=1, orders_this_session=0, policy=policy)
    events = audit_trail.history()
    assert len(events) == 1
    assert events[0].actor == "policy_guard"
    assert events[0].event_type == "guardrail_check"
