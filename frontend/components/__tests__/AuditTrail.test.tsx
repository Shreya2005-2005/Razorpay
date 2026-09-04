import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuditTrail from "../AuditTrail";
import type { AuditEvent } from "@/lib/types";

const mockUseAuditTrail = vi.fn();

vi.mock("@/hooks/useAuditTrail", () => ({
  useAuditTrail: () => mockUseAuditTrail(),
  SESSION_START_PREFIX: "Starting session with goal: ",
}));

function ev(overrides: Partial<AuditEvent>): AuditEvent {
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

describe("AuditTrail narrative summary", () => {
  it("shows no narrative line before a session has started", () => {
    mockUseAuditTrail.mockReturnValue({ events: [], connectionState: "open" });
    render(<AuditTrail />);
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
  });

  it("shows an accurate one-line narrative once a session has a goal", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        ev({
          message: "Starting session with goal: a gift under ₹700",
          metadata: { budget_inr: 700 },
        }),
        ev({
          actor: "merchant_agent",
          event_type: "negotiation_turn",
          message: "Round 2: merchant accepts at ₹674.00/unit",
          metadata: {
            settled_price_inr: 674,
            list_price_inr: 700,
            quantity: 1,
            round: 2,
          },
        }),
        ev({
          actor: "razorpay",
          event_type: "payment_call",
          message: "Payment pay_1 captured for order order_1",
          metadata: { signature_verified: true, payments_api_verified: true },
        }),
        ev({
          actor: "razorpay",
          event_type: "payment_call",
          message: "Created order order_1 for ₹674.00",
          metadata: { order_id: "order_1", amount_inr: 674 },
        }),
        ev({
          event_type: "decision",
          message: "Bought it.",
          metadata: { final: true },
        }),
      ],
      connectionState: "open",
    });
    render(<AuditTrail />);

    expect(
      screen.getByText(
        "Buyer wanted a gift under ₹700, negotiated 2 rounds, saved ₹26, payment succeeded."
      )
    ).toBeInTheDocument();
  });

  it("reflects a stopped session in the narrative, not a success message", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        ev({ message: "Starting session with goal: a mouse" }),
        ev({
          event_type: "stopped",
          message: "Session stopped by user request",
        }),
      ],
      connectionState: "open",
    });
    render(<AuditTrail />);

    expect(
      screen.getByText(/but was stopped by the user before finishing/i)
    ).toBeInTheDocument();
  });
});
