import { describe, expect, it } from "vitest";
import { summarizeMerchantRevenue } from "../merchantRevenue";
import type { AuditEvent } from "@/lib/types";

function ev(sessionId: string, overrides: Partial<AuditEvent>): AuditEvent {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    actor: "buyer_agent",
    event_type: "decision",
    message: "",
    metadata: {},
    session_id: sessionId,
    ...overrides,
  };
}

function completedSession(
  sessionId: string,
  {
    budgetInr,
    listPriceInr,
    settledPriceInr,
    negotiated = true,
  }: {
    budgetInr: number;
    listPriceInr: number;
    settledPriceInr: number;
    negotiated?: boolean;
  }
): AuditEvent[] {
  const events: AuditEvent[] = [
    ev(sessionId, {
      message: `Starting session with goal: buy something for ₹${budgetInr}`,
      metadata: { budget_inr: budgetInr },
    }),
  ];
  if (negotiated) {
    events.push(
      ev(sessionId, {
        actor: "merchant_agent",
        event_type: "negotiation_turn",
        message: `merchant accepts at ₹${settledPriceInr}.00/unit`,
        metadata: {
          settled_price_inr: settledPriceInr,
          list_price_inr: listPriceInr,
          quantity: 1,
        },
      })
    );
  }
  events.push(
    ev(sessionId, {
      actor: "razorpay",
      event_type: "payment_call",
      message: `Created order order_${sessionId} for ₹${settledPriceInr}.00`,
      metadata: { order_id: `order_${sessionId}`, amount_inr: settledPriceInr },
    }),
    ev(sessionId, {
      actor: "razorpay",
      event_type: "payment_call",
      message: `Payment pay_${sessionId} captured for order order_${sessionId}`,
      metadata: { signature_verified: true, payments_api_verified: true },
    }),
    ev(sessionId, {
      event_type: "decision",
      message: "Done.",
      metadata: { final: true },
    })
  );
  return events;
}

describe("summarizeMerchantRevenue", () => {
  it("returns zeroed-out results for no events", () => {
    const summary = summarizeMerchantRevenue([]);
    expect(summary.totalCompletedSessions).toBe(0);
    expect(summary.totalRevenueInr).toBe(0);
    expect(summary.averageOrderValueInr).toBeNull();
    expect(summary.likelyLostSalesCount).toBe(0);
    expect(summary.policyBlockedCount).toBe(0);
  });

  it("counts a completed sale and its revenue", () => {
    const events = completedSession("s1", {
      budgetInr: 1000,
      listPriceInr: 1000,
      settledPriceInr: 950,
    });
    const summary = summarizeMerchantRevenue(events);
    expect(summary.totalCompletedSessions).toBe(1);
    expect(summary.totalRevenueInr).toBe(950);
    expect(summary.averageOrderValueInr).toBe(950);
  });

  it("ignores sessions that never completed a payment", () => {
    const events: AuditEvent[] = [
      ev("s1", {
        message: "Starting session with goal: buy anything",
        metadata: { budget_inr: 500 },
      }),
      ev("s1", {
        event_type: "failure",
        message: "Reached max tool-calling turns without a final answer",
      }),
    ];
    const summary = summarizeMerchantRevenue(events);
    expect(summary.totalCompletedSessions).toBe(0);
    expect(summary.totalRevenueInr).toBe(0);
  });

  it("flags a sale as likely-lost-without-negotiation when budget was below list price", () => {
    const events = completedSession("s1", {
      budgetInr: 800,
      listPriceInr: 1000,
      settledPriceInr: 780,
    });
    const summary = summarizeMerchantRevenue(events);
    expect(summary.likelyLostSalesCount).toBe(1);
    expect(summary.likelyLostSalesRevenueInr).toBe(780);
    expect(summary.likelyLostSales[0].sessionId).toBe("s1");
  });

  it("does not flag a sale as likely-lost when budget already covered list price", () => {
    const events = completedSession("s1", {
      budgetInr: 1200,
      listPriceInr: 1000,
      settledPriceInr: 950,
    });
    const summary = summarizeMerchantRevenue(events);
    expect(summary.likelyLostSalesCount).toBe(0);
  });

  it("does not flag a non-negotiated sale even if budget was tight", () => {
    const events = completedSession("s1", {
      budgetInr: 800,
      listPriceInr: 1000,
      settledPriceInr: 1000,
      negotiated: false,
    });
    const summary = summarizeMerchantRevenue(events);
    expect(summary.likelyLostSalesCount).toBe(0);
  });

  it("counts policy-blocked attempts across all sessions", () => {
    const events: AuditEvent[] = [
      ev("s1", {
        actor: "policy_guard",
        event_type: "guardrail_check",
        metadata: { allowed: false },
      }),
      ev("s2", {
        actor: "policy_guard",
        event_type: "guardrail_check",
        metadata: { allowed: false },
      }),
      ev("s2", {
        actor: "policy_guard",
        event_type: "guardrail_check",
        metadata: { allowed: true },
      }),
    ];
    const summary = summarizeMerchantRevenue(events);
    expect(summary.policyBlockedCount).toBe(2);
  });

  it("aggregates across multiple completed sessions", () => {
    const events = [
      ...completedSession("s1", {
        budgetInr: 800,
        listPriceInr: 1000,
        settledPriceInr: 780,
      }),
      ...completedSession("s2", {
        budgetInr: 2000,
        listPriceInr: 1500,
        settledPriceInr: 1400,
      }),
    ];
    const summary = summarizeMerchantRevenue(events);
    expect(summary.totalCompletedSessions).toBe(2);
    expect(summary.totalRevenueInr).toBe(2180);
    expect(summary.averageOrderValueInr).toBe(1090);
    expect(summary.likelyLostSalesCount).toBe(1);
  });

  it("ignores events with no session_id when grouping", () => {
    const events: AuditEvent[] = [
      ev("", {
        actor: "system",
        event_type: "decision",
        message: "manual test event",
      }),
    ];
    const summary = summarizeMerchantRevenue(events);
    expect(summary.totalCompletedSessions).toBe(0);
  });

  it("defaults loyalty stats to zero with no discount activity", () => {
    const events = completedSession("s1", {
      budgetInr: 1500,
      listPriceInr: 1000,
      settledPriceInr: 950,
    });
    const summary = summarizeMerchantRevenue(events);
    expect(summary.loyalty).toEqual({
      discountsAppliedCount: 0,
      totalDiscountGivenInr: 0,
      discountedRevenueInr: 0,
    });
  });

  it("counts a loyalty discount applied in one session but not another", () => {
    const events: AuditEvent[] = [
      ...completedSession("s1", {
        budgetInr: 1500,
        listPriceInr: 1299,
        settledPriceInr: 1299,
      }),
      ...completedSession("s2", {
        budgetInr: 1500,
        listPriceInr: 1299,
        settledPriceInr: 1099,
      }),
      ev("s2", {
        actor: "system",
        event_type: "loyalty_discount_applied",
        message: "🎁 applied",
        metadata: { customer_id: "cust-a", discount_inr: 150 },
      }),
    ];

    const summary = summarizeMerchantRevenue(events);

    expect(summary.loyalty.discountsAppliedCount).toBe(1);
    expect(summary.loyalty.totalDiscountGivenInr).toBe(150);
    // Revenue attributed to the session where the discount was actually applied.
    expect(summary.loyalty.discountedRevenueInr).toBe(1099);
  });

  it("defaults upsell/bundle/coupon-nudge/low-stock stats to zero", () => {
    const events = completedSession("s1", {
      budgetInr: 1500,
      listPriceInr: 1000,
      settledPriceInr: 950,
    });
    const summary = summarizeMerchantRevenue(events);
    expect(summary.upsell).toEqual({
      offeredCount: 0,
      acceptedCount: 0,
      revenueInr: 0,
    });
    expect(summary.bundle).toEqual({ appliedCount: 0 });
    expect(summary.couponNudge).toEqual({ shownCount: 0, convertedCount: 0 });
    expect(summary.lowStockFlagCount).toBe(0);
  });

  it("counts an accepted upsell's revenue only for the session it was accepted in", () => {
    const events: AuditEvent[] = [
      ...completedSession("s1", {
        budgetInr: 1500,
        listPriceInr: 1000,
        settledPriceInr: 950,
      }),
      ev("s1", {
        actor: "merchant_agent",
        event_type: "upsell_offered",
        message: "Add a Gift Wrap for ₹49.00?",
        metadata: { upsell_name: "Gift Wrap", upsell_price_inr: 49 },
      }),
      ev("s1", {
        actor: "buyer_agent",
        event_type: "upsell_accepted",
        message: "Added Gift Wrap (₹49.00) to the order",
        metadata: { upsell_name: "Gift Wrap", upsell_price_inr: 49 },
      }),
      ...completedSession("s2", {
        budgetInr: 1500,
        listPriceInr: 1000,
        settledPriceInr: 950,
      }),
      ev("s2", {
        actor: "merchant_agent",
        event_type: "upsell_offered",
        message: "Add a Candle for ₹150.00?",
        metadata: { upsell_name: "Candle", upsell_price_inr: 150 },
      }),
      ev("s2", {
        actor: "buyer_agent",
        event_type: "upsell_declined",
        message: "Declined Candle — over budget",
        metadata: { upsell_name: "Candle", upsell_price_inr: 150 },
      }),
    ];

    const summary = summarizeMerchantRevenue(events);

    expect(summary.upsell.offeredCount).toBe(2);
    expect(summary.upsell.acceptedCount).toBe(1);
    expect(summary.upsell.revenueInr).toBe(49);
  });

  it("counts bundle discounts and coupon nudges across sessions", () => {
    const events: AuditEvent[] = [
      ...completedSession("s1", {
        budgetInr: 1500,
        listPriceInr: 1000,
        settledPriceInr: 950,
      }),
      ev("s1", {
        actor: "merchant_agent",
        event_type: "bundle_discount_applied",
        message: "Bundle discount 'Electronics Bundle' applied",
        metadata: { bundle_name: "Electronics Bundle" },
      }),
      ev("s1", {
        actor: "merchant_agent",
        event_type: "coupon_nudge_shown",
        message: "Add ₹50 more to unlock ₹150 off!",
      }),
      ev("s1", {
        actor: "system",
        event_type: "coupon_nudge_converted",
        message: "Buyer crossed the loyalty threshold after the nudge",
      }),
      ev("s1", {
        actor: "merchant_agent",
        event_type: "low_stock_flagged",
        message: "Only 3 left in stock",
      }),
      ...completedSession("s2", {
        budgetInr: 1500,
        listPriceInr: 1000,
        settledPriceInr: 950,
      }),
      ev("s2", {
        actor: "merchant_agent",
        event_type: "coupon_nudge_shown",
        message: "Add ₹50 more to unlock ₹150 off!",
      }),
    ];

    const summary = summarizeMerchantRevenue(events);

    expect(summary.bundle.appliedCount).toBe(1);
    expect(summary.couponNudge.shownCount).toBe(2);
    expect(summary.couponNudge.convertedCount).toBe(1);
    expect(summary.lowStockFlagCount).toBe(1);
  });
});
