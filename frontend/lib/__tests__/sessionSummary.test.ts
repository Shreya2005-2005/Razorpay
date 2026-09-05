import { describe, expect, it } from "vitest";
import { formatDuration, summarizeSession } from "../sessionSummary";
import type { AuditEvent } from "@/lib/types";

function event(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    actor: "buyer_agent",
    event_type: "decision",
    message: "",
    metadata: {},
    session_id: "s1",
    ...overrides,
  };
}

describe("summarizeSession", () => {
  it("returns an empty/incomplete summary for no events", () => {
    const summary = summarizeSession([]);
    expect(summary.goal).toBeNull();
    expect(summary.isComplete).toBe(false);
    expect(summary.settlements).toEqual([]);
    expect(summary.totalSavedInr).toBe(0);
    expect(summary.guardrails).toEqual({ total: 0, passed: 0, blocked: 0 });
    expect(summary.payment.attempted).toBe(false);
  });

  it("extracts the goal and budget from the starting event", () => {
    const summary = summarizeSession([
      event({
        message: "Starting session with goal: Find a gift under ₹700",
        metadata: { budget_inr: 700, catalog_file: "catalog_demo_1.csv" },
      }),
    ]);
    expect(summary.goal).toBe("Find a gift under ₹700");
    expect(summary.budgetInr).toBe(700);
  });

  it("summarizes a fully successful session end to end", () => {
    const events: AuditEvent[] = [
      event({
        timestamp: "2026-01-01T00:00:00.000Z",
        message: "Starting session with goal: Buy a speaker",
        metadata: { budget_inr: 1000 },
      }),
      event({
        actor: "policy_guard",
        event_type: "guardrail_check",
        message: "Allowed order for EL-1 x1",
        metadata: { allowed: true },
      }),
      event({
        actor: "merchant_agent",
        event_type: "negotiation_turn",
        message: "Round 1: merchant accepts at ₹950.00/unit",
        metadata: {
          settled_price_inr: 950,
          list_price_inr: 1000,
          quantity: 1,
          product_id: "EL-1",
        },
      }),
      event({
        actor: "razorpay",
        event_type: "payment_call",
        message: "Created order order_1 for ₹950.00",
        metadata: { order_id: "order_1", amount_inr: 950, product_id: "EL-1" },
      }),
      event({
        actor: "razorpay",
        event_type: "payment_call",
        message: "Payment pay_1 captured for order order_1",
        metadata: {
          order_id: "order_1",
          payment_id: "pay_1",
          status: "captured",
          signature_verified: true,
          payments_api_verified: true,
        },
      }),
      event({
        timestamp: "2026-01-01T00:00:14.000Z",
        event_type: "decision",
        message: "Bought the speaker for ₹950.",
        metadata: { final: true },
      }),
    ];

    const summary = summarizeSession(events);

    expect(summary.guardrails).toEqual({ total: 1, passed: 1, blocked: 0 });
    expect(summary.settlements).toHaveLength(1);
    expect(summary.totalSavedInr).toBe(50);
    expect(summary.payment).toEqual({
      attempted: true,
      captured: true,
      verified: true,
      declined: false,
      amountInr: 950,
    });
    expect(summary.isComplete).toBe(true);
    expect(summary.durationMs).toBe(14000);
  });

  it("marks a blocked guardrail check without counting it as passed", () => {
    const summary = summarizeSession([
      event({
        actor: "policy_guard",
        event_type: "guardrail_check",
        message: "Blocked order for X x1",
        metadata: { allowed: false },
      }),
    ]);
    expect(summary.guardrails).toEqual({ total: 1, passed: 0, blocked: 1 });
  });

  it("marks a declined payment as attempted but not captured/verified", () => {
    const summary = summarizeSession([
      event({
        actor: "razorpay",
        event_type: "payment_call",
        message: "Created order order_1 for ₹500.00",
        metadata: { order_id: "order_1", amount_inr: 500 },
      }),
      event({
        actor: "razorpay",
        event_type: "failure",
        message: "Payment declined for X: card declined by issuing bank",
      }),
    ]);
    expect(summary.payment.attempted).toBe(true);
    expect(summary.payment.captured).toBe(false);
    expect(summary.payment.verified).toBe(false);
    expect(summary.payment.declined).toBe(true);
  });

  it("does not mark a captured payment verified if the metadata says otherwise", () => {
    const summary = summarizeSession([
      event({
        actor: "razorpay",
        event_type: "payment_call",
        message: "Payment pay_1 captured for order order_1",
        metadata: { signature_verified: false, payments_api_verified: true },
      }),
    ]);
    expect(summary.payment.captured).toBe(true);
    expect(summary.payment.verified).toBe(false);
  });

  it("marks a stopped session as complete and stopped", () => {
    const summary = summarizeSession([
      event({
        message: "Starting session with goal: Buy anything",
        metadata: {},
      }),
      event({
        event_type: "stopped",
        message: "Session stopped by user request",
      }),
    ]);
    expect(summary.stopped).toBe(true);
    expect(summary.isComplete).toBe(true);
  });

  it("marks a max-turns failure as complete, reachedMaxTurns, but not stopped", () => {
    const summary = summarizeSession([
      event({
        event_type: "failure",
        message: "Reached max tool-calling turns without a final answer",
      }),
    ]);
    expect(summary.reachedMaxTurns).toBe(true);
    expect(summary.stopped).toBe(false);
    expect(summary.isComplete).toBe(true);
  });

  it("marks negotiationFailed without marking the session complete on its own", () => {
    const summary = summarizeSession([
      event({
        event_type: "failure",
        message:
          "Negotiation for EL-1 failed to reach agreement after 4 round(s)",
      }),
    ]);
    expect(summary.negotiationFailed).toBe(true);
    expect(summary.isComplete).toBe(false);
  });

  it("sums savings across multiple settlements", () => {
    const summary = summarizeSession([
      event({
        event_type: "negotiation_turn",
        message: "merchant accepts at ₹900.00/unit",
        metadata: { settled_price_inr: 900, list_price_inr: 1000, quantity: 1 },
      }),
      event({
        event_type: "negotiation_turn",
        message: "buyer accepts merchant's counter of ₹480.00/unit",
        metadata: { settled_price_inr: 480, list_price_inr: 600, quantity: 2 },
      }),
    ]);
    expect(summary.totalSavedInr).toBe(340);
    expect(summary.settlements).toHaveLength(2);
  });
});

describe("formatDuration", () => {
  it("shows 'under a second' for sub-second durations", () => {
    expect(formatDuration(400)).toBe("under a second");
  });

  it("shows whole seconds", () => {
    expect(formatDuration(14000)).toBe("14 seconds");
  });

  it("singularizes one second", () => {
    expect(formatDuration(1000)).toBe("1 second");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(14600)).toBe("15 seconds");
  });

  it("shows minutes and seconds past a minute", () => {
    expect(formatDuration(65000)).toBe("1m 5s");
  });
});

describe("summarizeSession loyalty facts", () => {
  it("defaults to no loyalty activity", () => {
    const summary = summarizeSession([]);
    expect(summary.loyalty).toEqual({
      discountApplied: false,
      discountAppliedInr: 0,
    });
  });

  it("detects a discount applied this session and its amount", () => {
    const summary = summarizeSession([
      event({
        actor: "system",
        event_type: "loyalty_discount_applied",
        message:
          "🎁 ₹150.00 loyalty discount applied automatically — orders over ₹800 qualify!",
        metadata: { customer_id: "cust-a", discount_inr: 150 },
      }),
    ]);
    expect(summary.loyalty.discountApplied).toBe(true);
    expect(summary.loyalty.discountAppliedInr).toBe(150);
  });
});

describe("summarizeSession first-purchase facts", () => {
  it("defaults to no first-purchase activity", () => {
    const summary = summarizeSession([]);
    expect(summary.firstPurchase).toEqual({
      discountApplied: false,
      discountAppliedInr: 0,
    });
  });

  it("detects a first-purchase discount applied this session and its amount", () => {
    const summary = summarizeSession([
      event({
        actor: "system",
        event_type: "first_purchase_discount_applied",
        message:
          "🎉 ₹500.00 first-purchase discount applied — welcome! 50% off your first order.",
        metadata: {
          customer_id: "cust-new",
          discount_inr: 500,
          discount_pct: 0.5,
        },
      }),
    ]);
    expect(summary.firstPurchase.discountApplied).toBe(true);
    expect(summary.firstPurchase.discountAppliedInr).toBe(500);
  });
});

describe("summarizeSession upsell facts", () => {
  it("defaults to no upsell activity", () => {
    const summary = summarizeSession([]);
    expect(summary.upsell).toEqual({
      offered: false,
      accepted: false,
      addOnName: null,
      addOnPriceInr: 0,
    });
  });

  it("detects an upsell offered and its add-on details", () => {
    const summary = summarizeSession([
      event({
        actor: "merchant_agent",
        event_type: "upsell_offered",
        message: "Add a Gift Wrap for ₹49.00?",
        metadata: {
          product_id: "GS-101",
          upsell_product_id: "GS-106",
          upsell_name: "Gift Wrap",
          upsell_price_inr: 49,
        },
      }),
    ]);
    expect(summary.upsell.offered).toBe(true);
    expect(summary.upsell.accepted).toBe(false);
    expect(summary.upsell.addOnName).toBe("Gift Wrap");
    expect(summary.upsell.addOnPriceInr).toBe(49);
  });

  it("detects an upsell accepted", () => {
    const summary = summarizeSession([
      event({
        actor: "merchant_agent",
        event_type: "upsell_offered",
        message: "Add a Gift Wrap for ₹49.00?",
        metadata: { upsell_name: "Gift Wrap", upsell_price_inr: 49 },
      }),
      event({
        actor: "buyer_agent",
        event_type: "upsell_accepted",
        message: "Added Gift Wrap (₹49.00) to the order",
        metadata: { upsell_name: "Gift Wrap", upsell_price_inr: 49 },
      }),
    ]);
    expect(summary.upsell.accepted).toBe(true);
  });
});

describe("summarizeSession bundle facts", () => {
  it("defaults to no bundle activity", () => {
    const summary = summarizeSession([]);
    expect(summary.bundle).toEqual({ applied: false, bundleName: null });
  });

  it("detects a bundle discount applied and its name", () => {
    const summary = summarizeSession([
      event({
        actor: "merchant_agent",
        event_type: "bundle_discount_applied",
        message:
          "Bundle discount 'Electronics Bundle' applied: 8% off for 2x GS-115",
        metadata: {
          product_id: "GS-115",
          quantity: 2,
          bundle_name: "Electronics Bundle",
          discount_pct: 0.08,
        },
      }),
    ]);
    expect(summary.bundle.applied).toBe(true);
    expect(summary.bundle.bundleName).toBe("Electronics Bundle");
  });
});

describe("summarizeSession coupon nudge facts", () => {
  it("defaults to no nudge activity", () => {
    const summary = summarizeSession([]);
    expect(summary.couponNudge).toEqual({ shown: false, converted: false });
  });

  it("detects a nudge shown", () => {
    const summary = summarizeSession([
      event({
        actor: "merchant_agent",
        event_type: "coupon_nudge_shown",
        message: "Add ₹50.00 more to unlock ₹150 off!",
        metadata: { product_id: "GS-108", total_inr: 750, shortfall_inr: 50 },
      }),
    ]);
    expect(summary.couponNudge.shown).toBe(true);
    expect(summary.couponNudge.converted).toBe(false);
  });

  it("detects a nudge that converted", () => {
    const summary = summarizeSession([
      event({
        actor: "merchant_agent",
        event_type: "coupon_nudge_shown",
        message: "Add ₹50.00 more to unlock ₹150 off!",
        metadata: { product_id: "GS-108" },
      }),
      event({
        actor: "system",
        event_type: "coupon_nudge_converted",
        message:
          "Buyer crossed the loyalty threshold after the nudge — coupon applied",
        metadata: { product_id: "GS-108" },
      }),
    ]);
    expect(summary.couponNudge.converted).toBe(true);
  });
});

describe("summarizeSession low-stock facts", () => {
  it("defaults to zero low-stock flags", () => {
    const summary = summarizeSession([]);
    expect(summary.lowStockFlagCount).toBe(0);
  });

  it("counts low-stock flags raised this session", () => {
    const summary = summarizeSession([
      event({
        actor: "merchant_agent",
        event_type: "low_stock_flagged",
        message: "Only 3 left in stock for GS-101",
        metadata: { product_id: "GS-101", stock: 3 },
      }),
    ]);
    expect(summary.lowStockFlagCount).toBe(1);
  });
});
