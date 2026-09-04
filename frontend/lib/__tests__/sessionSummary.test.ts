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
