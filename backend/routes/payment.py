import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from core.catalog_translator import CatalogTranslationError, translate_catalog
from core.checkout import initiate_checkout
from core.payments import fetch_order, finalize_payment, get_result
from models.schemas import (
    CheckoutRequest,
    CheckoutStartResult,
    PaymentCallbackRequest,
    PaymentResult,
)

router = APIRouter(prefix="/api/payment", tags=["payment"])


@router.post("/checkout", response_model=CheckoutStartResult)
def start_checkout(body: CheckoutRequest):
    """Policy-check the order, then create a real Razorpay test-mode Order.
    Completing the actual payment requires a human at the returned checkout_url
    (Razorpay's test cards need a browser — see /api/payment/pay/{order_id})."""
    try:
        catalog = translate_catalog(body.catalog_file)
    except CatalogTranslationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    product = next((p for p in catalog if p.product_id == body.product_id), None)
    if product is None:
        raise HTTPException(
            status_code=404,
            detail=f"Product '{body.product_id}' not found in {body.catalog_file}",
        )

    result = initiate_checkout(
        product=product,
        quantity=body.quantity,
        orders_this_session=body.orders_this_session,
        unit_price_inr=body.unit_price_inr,
    )
    return CheckoutStartResult(**result)


@router.get("/pay/{order_id}", response_class=HTMLResponse)
def checkout_page(order_id: str):
    """Minimal Checkout.js page for manually completing a test-mode payment —
    Razorpay's card flow requires a browser, there is no headless API path
    enabled on this account (see write-up in the Stage 7 changelog)."""
    order = fetch_order(order_id)
    key_id = os.getenv("RAZORPAY_KEY_ID")

    html = f"""
<!DOCTYPE html>
<html>
<head>
  <title>Test Checkout — {order_id}</title>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto;">
  <h2>Order {order_id}</h2>
  <p>Amount: ₹{order['amount'] / 100:.2f}</p>
  <p>
    Test cards (any future expiry, any CVV):<br>
    Success: <code>4100 2800 0000 1007</code><br>
    Declined: <code>4100 2800 0006 0003</code>
  </p>
  <button id="pay-btn" style="padding: 10px 20px; font-size: 16px;">Pay Now</button>
  <p id="result" style="font-weight: bold;"></p>

  <script>
    function report(payload) {{
      fetch('/api/payment/callback', {{
        method: 'POST',
        headers: {{'Content-Type': 'application/json'}},
        body: JSON.stringify(payload),
      }})
        .then(r => r.json())
        .then(data => {{
          document.getElementById('result').innerText =
            (data.success ? '✅ ' : '❌ ') + data.status + ': ' + (data.reason || '');
        }});
    }}

    var options = {{
      key: '{key_id}',
      amount: '{order['amount']}',
      currency: 'INR',
      name: 'Agent Commerce Adapter',
      description: 'Test transaction',
      order_id: '{order_id}',
      handler: function (response) {{
        report({{
          order_id: response.razorpay_order_id,
          payment_id: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        }});
      }},
      theme: {{ color: '#3399cc' }},
    }};
    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {{
      report({{
        order_id: '{order_id}',
        payment_id: response.error.metadata.payment_id,
      }});
    }});
    document.getElementById('pay-btn').onclick = function () {{
      rzp.open();
    }};
  </script>
</body>
</html>
"""
    return HTMLResponse(content=html)


@router.post("/callback", response_model=PaymentResult)
def payment_callback(body: PaymentCallbackRequest):
    """Called by the checkout page's JS once Razorpay reports an outcome.
    The client's claim is never trusted directly — finalize_payment always
    re-fetches the real status from Razorpay's Payments API."""
    return finalize_payment(
        order_id=body.order_id,
        payment_id=body.payment_id,
        signature=body.signature,
    )


@router.get("/status/{order_id}", response_model=PaymentResult)
def payment_status(order_id: str):
    result = get_result(order_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No payment outcome recorded yet for this order")
    return result
