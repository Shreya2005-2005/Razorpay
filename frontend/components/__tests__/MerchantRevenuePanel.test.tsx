import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MerchantRevenuePanel from "../MerchantRevenuePanel";
import type { AuditEvent } from "@/lib/types";

const mockUseAuditTrail = vi.fn();

vi.mock("@/hooks/useAuditTrail", () => ({
  useAuditTrail: () => mockUseAuditTrail(),
  SESSION_START_PREFIX: "Starting session with goal: ",
}));

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
  budgetInr: number,
  listPriceInr: number,
  settledPriceInr: number
): AuditEvent[] {
  return [
    ev(sessionId, {
      message: `Starting session with goal: buy something`,
      metadata: { budget_inr: budgetInr },
    }),
    ev(sessionId, {
      actor: "merchant_agent",
      event_type: "negotiation_turn",
      message: `merchant accepts at ₹${settledPriceInr}.00/unit`,
      metadata: {
        settled_price_inr: settledPriceInr,
        list_price_inr: listPriceInr,
        quantity: 1,
      },
    }),
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
    }),
  ];
}

describe("MerchantRevenuePanel", () => {
  it("shows a zeroed-out state with no sessions", () => {
    mockUseAuditTrail.mockReturnValue({ allEvents: [] });
    render(<MerchantRevenuePanel />);

    expect(
      screen.getByText(/₹0\.00 in revenue closed across 0 sales/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/no sales like this yet/i)).toBeInTheDocument();
  });

  it("shows the summary stat line and stat cards for a completed likely-lost sale", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: completedSession("s1", 800, 1000, 780),
    });
    render(<MerchantRevenuePanel />);

    expect(
      screen.getByText(
        /₹780\.00 in revenue closed across 1 sale — including 1 sale/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/budget ₹800\.00 < list price ₹1000\.00/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/settled at ₹780\.00 → sale closed/i)
    ).toBeInTheDocument();
  });

  it("does not list a normally-affordable sale in the before/after section", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: completedSession("s1", 1500, 1000, 950),
    });
    render(<MerchantRevenuePanel />);

    expect(screen.getByText(/no sales like this yet/i)).toBeInTheDocument();
  });

  it("aggregates revenue and average order value across multiple sales", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: [
        ...completedSession("s1", 800, 1000, 780),
        ...completedSession("s2", 2000, 1500, 1400),
      ],
    });
    render(<MerchantRevenuePanel />);

    expect(screen.getByText("₹2180.00")).toBeInTheDocument();
    expect(screen.getByText("₹1090.00")).toBeInTheDocument();
  });

  it("does not show the loyalty banner when no discounts have been applied", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: completedSession("s1", 1500, 1000, 950),
    });
    render(<MerchantRevenuePanel />);

    expect(screen.queryByText(/loyalty discount/i)).not.toBeInTheDocument();
  });

  it("shows the loyalty summary line once a discount has been applied", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: [
        ...completedSession("s1", 1500, 1299, 1299),
        ...completedSession("s2", 1500, 1299, 1099),
        ev("s2", {
          actor: "system",
          event_type: "loyalty_discount_applied",
          message: "🎁 applied",
          metadata: {
            customer_id: "cust-a",
            discount_inr: 150,
          },
        }),
      ],
    });
    render(<MerchantRevenuePanel />);

    expect(
      screen.getByText(
        /🎁 1 order received the automatic loyalty discount — ₹150\.00 given in discounts, contributing ₹1099\.00 in revenue\./i
      )
    ).toBeInTheDocument();
  });

  it("does not show the first-purchase banner when no such discount has been applied", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: completedSession("s1", 1500, 1000, 950),
    });
    render(<MerchantRevenuePanel />);

    // The stat card label ("First-purchase discounts applied") always
    // renders — only the banner sentence is conditional.
    expect(
      screen.queryByText(/received the first-purchase discount/i)
    ).not.toBeInTheDocument();
  });

  it("shows the first-purchase summary line once a discount has been applied", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: [
        ...completedSession("s1", 1500, 1000, 1000),
        ...completedSession("s2", 1500, 1000, 500),
        ev("s2", {
          actor: "system",
          event_type: "first_purchase_discount_applied",
          message: "🎉 applied",
          metadata: {
            customer_id: "cust-new",
            discount_inr: 500,
            discount_pct: 0.5,
          },
        }),
      ],
    });
    render(<MerchantRevenuePanel />);

    expect(
      screen.getByText(
        /🎉 1 new customer received the first-purchase discount — ₹500\.00 given in discounts, contributing ₹500\.00 in revenue\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("First-purchase discounts applied")
    ).toBeInTheDocument();
  });

  it("does not show the upsell banner when no upsell has been offered", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: completedSession("s1", 1500, 1000, 950),
    });
    render(<MerchantRevenuePanel />);

    expect(
      screen.queryByText(/offered add-ons accepted/i)
    ).not.toBeInTheDocument();
  });

  it("shows the upsell summary line once an upsell has been offered", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: [
        ...completedSession("s1", 1500, 1000, 950),
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
      ],
    });
    render(<MerchantRevenuePanel />);

    expect(
      screen.getByText(
        /🛍️ 1 of 1 offered add-ons accepted, contributing ₹49\.00 in additional revenue\./i
      )
    ).toBeInTheDocument();
  });

  it("shows bundle, coupon-nudge, and low-stock stat cards", () => {
    mockUseAuditTrail.mockReturnValue({
      allEvents: [
        ...completedSession("s1", 1500, 1000, 950),
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
      ],
    });
    render(<MerchantRevenuePanel />);

    expect(screen.getByText("Bundle discounts applied")).toBeInTheDocument();
    expect(screen.getByText("Coupon nudges converted")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByText("Low-stock flags shown")).toBeInTheDocument();
  });
});
