import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComplianceCard from "../ComplianceCard";
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

const finalDecision = ev({
  event_type: "decision",
  message: "Done.",
  metadata: { final: true },
});

describe("ComplianceCard", () => {
  it("renders nothing while the session is not yet complete", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [ev({ message: "Calling tool 'search_catalog'" })],
    });
    const { container } = render(<ComplianceCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a neutral state for policy checks and payment when neither occurred", () => {
    mockUseAuditTrail.mockReturnValue({ events: [finalDecision] });
    render(<ComplianceCard />);

    expect(
      screen.getByText(/no policy checks ran this session/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no payment attempted this session/i)
    ).toBeInTheDocument();
  });

  it("shows a pass state for guardrails and a verified payment", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        ev({
          actor: "policy_guard",
          event_type: "guardrail_check",
          message: "Allowed order",
          metadata: { allowed: true },
        }),
        ev({
          actor: "razorpay",
          event_type: "payment_call",
          message: "Payment pay_1 captured for order order_1",
          metadata: { signature_verified: true, payments_api_verified: true },
        }),
        finalDecision,
      ],
    });
    render(<ComplianceCard />);

    expect(screen.getByText(/1 of 1 allowed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/signature verified \+ confirmed via razorpay/i)
    ).toBeInTheDocument();
  });

  it("shows a fail state for a declined payment", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        ev({
          actor: "razorpay",
          event_type: "payment_call",
          message: "Created order order_1 for ₹500.00",
          metadata: { order_id: "order_1", amount_inr: 500 },
        }),
        ev({
          actor: "razorpay",
          event_type: "failure",
          message: "Payment declined for X: card declined by issuing bank",
        }),
        finalDecision,
      ],
    });
    render(<ComplianceCard />);

    expect(screen.getByText(/payment was declined/i)).toBeInTheDocument();
  });

  it("shows the savings row only when a negotiation settled", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        ev({
          event_type: "negotiation_turn",
          message: "merchant accepts at ₹950.00/unit",
          metadata: {
            settled_price_inr: 950,
            list_price_inr: 1000,
            quantity: 1,
          },
        }),
        finalDecision,
      ],
    });
    render(<ComplianceCard />);

    expect(
      screen.getByText(/₹50\.00 saved via negotiation/i)
    ).toBeInTheDocument();
  });

  it("omits the savings row when no negotiation happened", () => {
    mockUseAuditTrail.mockReturnValue({ events: [finalDecision] });
    render(<ComplianceCard />);

    expect(
      screen.queryByText(/saved via negotiation/i)
    ).not.toBeInTheDocument();
  });

  it("treats a stopped session as complete for display purposes", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        ev({
          event_type: "stopped",
          message: "Session stopped by user request",
        }),
      ],
    });
    render(<ComplianceCard />);

    expect(screen.getByText(/compliance summary/i)).toBeInTheDocument();
  });
});
