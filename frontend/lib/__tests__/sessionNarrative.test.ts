import { describe, expect, it } from "vitest";
import { generateSessionNarrative } from "../sessionNarrative";
import type { SessionSummary } from "../sessionSummary";

const BASE: SessionSummary = {
  goal: null,
  budgetInr: null,
  startedAt: null,
  endedAt: null,
  durationMs: null,
  settlements: [],
  totalSavedInr: 0,
  guardrails: { total: 0, passed: 0, blocked: 0 },
  payment: {
    attempted: false,
    captured: false,
    verified: false,
    declined: false,
    amountInr: null,
  },
  stopped: false,
  negotiationFailed: false,
  reachedMaxTurns: false,
  isComplete: false,
  negotiationRounds: 0,
  recoveries: [],
  loyalty: {
    discountApplied: false,
    discountAppliedInr: 0,
  },
  firstPurchase: {
    discountApplied: false,
    discountAppliedInr: 0,
  },
  upsell: {
    offered: false,
    accepted: false,
    addOnName: null,
    addOnPriceInr: 0,
  },
  bundle: {
    applied: false,
    bundleName: null,
  },
  couponNudge: {
    shown: false,
    converted: false,
  },
  lowStockFlagCount: 0,
};

describe("generateSessionNarrative", () => {
  it("reports no activity when there is no goal yet", () => {
    expect(generateSessionNarrative(BASE)).toBe("No session activity yet.");
  });

  it("describes a full success: negotiated, saved, payment succeeded", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "a gift under ₹700",
      negotiationRounds: 2,
      totalSavedInr: 26,
      settlements: [
        {
          productId: "p1",
          settledPriceInr: 674,
          listPriceInr: 700,
          quantity: 1,
          savedPerUnitInr: 26,
          savedTotalInr: 26,
          savedPct: 3.7,
        },
      ],
      payment: {
        attempted: true,
        captured: true,
        verified: true,
        declined: false,
        amountInr: 674,
      },
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted a gift under ₹700, negotiated 2 rounds, saved ₹26, payment succeeded."
    );
  });

  it("describes buying at list price with no negotiation", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "a phone case",
      payment: {
        attempted: true,
        captured: true,
        verified: true,
        declined: false,
        amountInr: 300,
      },
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted a phone case, bought at list price, payment succeeded."
    );
  });

  it("describes a payment decline", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "a speaker",
      payment: {
        attempted: true,
        captured: false,
        verified: false,
        declined: true,
        amountInr: null,
      },
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted a speaker, bought at list price, payment was declined."
    );
  });

  it("describes a policy block with no payment attempted", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "10 laptops",
      guardrails: { total: 1, passed: 0, blocked: 1 },
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted 10 laptops, the order was blocked by policy."
    );
  });

  it("describes a negotiation that never converged", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "a laptop for ₹50",
      negotiationFailed: true,
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted a laptop for ₹50, no agreement was reached."
    );
  });

  it("describes a session stopped by the user", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "a mug",
      stopped: true,
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted a mug, but was stopped by the user before finishing."
    );
  });

  it("describes hitting the max-turns limit", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "something complicated",
      reachedMaxTurns: true,
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted something complicated, couldn't reach a conclusion in time."
    );
  });

  it("mentions a single recovery by its reason", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "a mouse",
      recoveries: ["search returned no matching products"],
      payment: {
        attempted: true,
        captured: true,
        verified: true,
        declined: false,
        amountInr: 400,
      },
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted a mouse, bought at list price, recovered from an issue (search returned no matching products), payment succeeded."
    );
  });

  it("mentions multiple recoveries by count", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "a mouse",
      recoveries: ["reason one", "reason two"],
      isComplete: true,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted a mouse, recovered from 2 issues along the way."
    );
  });

  it("says still in progress when the session has no terminal event yet", () => {
    const summary: SessionSummary = {
      ...BASE,
      goal: "a mouse",
      isComplete: false,
    };
    expect(generateSessionNarrative(summary)).toBe(
      "Buyer wanted a mouse, still in progress."
    );
  });
});
