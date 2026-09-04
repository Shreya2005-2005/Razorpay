import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NegotiationPanel from "../NegotiationPanel";
import type { AuditEvent } from "@/lib/types";

const mockUseAuditTrail = vi.fn();

vi.mock("@/hooks/useAuditTrail", () => ({
  useAuditTrail: () => mockUseAuditTrail(),
}));

function negotiationTurn(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    timestamp: "2026-01-01T00:00:00Z",
    actor: "buyer_agent",
    event_type: "negotiation_turn",
    message: "Round 1: buyer offers ₹500.00/unit for sku-1 x1",
    metadata: {},
    session_id: "s1",
    ...overrides,
  };
}

describe("NegotiationPanel", () => {
  it("shows an empty state when there is no negotiation activity", () => {
    mockUseAuditTrail.mockReturnValue({ events: [] });
    render(<NegotiationPanel />);
    expect(
      screen.getByText(/no negotiation activity yet/i)
    ).toBeInTheDocument();
  });

  it("shows the vs-list-price savings line for a settled negotiation", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        negotiationTurn({
          actor: "merchant_agent",
          message: "Round 1: merchant accepts at ₹850.00/unit",
          metadata: {
            settled_price_inr: 850,
            list_price_inr: 1000,
            quantity: 1,
          },
        }),
      ],
    });
    render(<NegotiationPanel />);

    expect(
      screen.getByText(
        /settled at ₹850\.00 vs list price ₹1000\.00 — 15% saved/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/₹150\.00 saved across 1 negotiation so far/i)
    ).toBeInTheDocument();
  });

  it("sums savings across multiple settled negotiations and pluralizes correctly", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        negotiationTurn({
          actor: "merchant_agent",
          message: "Round 1: merchant accepts at ₹900.00/unit",
          metadata: {
            settled_price_inr: 900,
            list_price_inr: 1000,
            quantity: 1,
          },
        }),
        negotiationTurn({
          actor: "buyer_agent",
          message: "Round 2: buyer accepts merchant's counter of ₹480.00/unit",
          metadata: {
            settled_price_inr: 480,
            list_price_inr: 600,
            quantity: 2,
          },
        }),
      ],
    });
    render(<NegotiationPanel />);

    // (1000-900)*1 + (600-480)*2 = 100 + 240 = 340
    expect(
      screen.getByText(/₹340\.00 saved across 2 negotiations so far/i)
    ).toBeInTheDocument();
  });

  it("does not show a savings line when settlement metadata is missing", () => {
    mockUseAuditTrail.mockReturnValue({
      events: [
        negotiationTurn({
          actor: "merchant_agent",
          message: "Round 1: merchant accepts at ₹850.00/unit",
          metadata: {},
        }),
      ],
    });
    render(<NegotiationPanel />);

    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument();
  });
});
