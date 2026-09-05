import { SESSION_START_PREFIX } from "@/hooks/useAuditTrail";
import type { AuditEvent } from "@/lib/types";

export interface Settlement {
  productId: string | null;
  settledPriceInr: number;
  listPriceInr: number;
  quantity: number;
  savedPerUnitInr: number;
  savedTotalInr: number;
  savedPct: number;
}

export interface GuardrailSummary {
  total: number;
  passed: number;
  blocked: number;
}

export interface PaymentSummary {
  attempted: boolean;
  captured: boolean;
  verified: boolean;
  declined: boolean;
  amountInr: number | null;
}

export interface LoyaltySummary {
  discountApplied: boolean;
  discountAppliedInr: number;
}

export interface FirstPurchaseSummary {
  discountApplied: boolean;
  discountAppliedInr: number;
}

export interface UpsellSummary {
  offered: boolean;
  accepted: boolean;
  addOnName: string | null;
  addOnPriceInr: number;
}

export interface BundleSummary {
  applied: boolean;
  bundleName: string | null;
}

export interface CouponNudgeSummary {
  shown: boolean;
  converted: boolean;
}

export interface SessionSummary {
  goal: string | null;
  budgetInr: number | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  settlements: Settlement[];
  totalSavedInr: number;
  guardrails: GuardrailSummary;
  payment: PaymentSummary;
  stopped: boolean;
  negotiationFailed: boolean;
  reachedMaxTurns: boolean;
  isComplete: boolean;
  negotiationRounds: number;
  recoveries: string[];
  loyalty: LoyaltySummary;
  firstPurchase: FirstPurchaseSummary;
  upsell: UpsellSummary;
  bundle: BundleSummary;
  couponNudge: CouponNudgeSummary;
  lowStockFlagCount: number;
}

function isSettlementMessage(event: AuditEvent): boolean {
  return (
    event.event_type === "negotiation_turn" &&
    event.message.toLowerCase().includes("accepts")
  );
}

function extractSettlement(event: AuditEvent): Settlement | null {
  const meta = event.metadata ?? {};
  const settledPriceInr = meta.settled_price_inr;
  const listPriceInr = meta.list_price_inr;
  if (
    typeof settledPriceInr !== "number" ||
    typeof listPriceInr !== "number" ||
    listPriceInr <= 0
  ) {
    return null;
  }
  const quantity =
    typeof meta.quantity === "number" && meta.quantity > 0 ? meta.quantity : 1;
  const savedPerUnitInr = listPriceInr - settledPriceInr;
  const productId =
    typeof meta.product_id === "string" ? meta.product_id : null;
  return {
    productId,
    settledPriceInr,
    listPriceInr,
    quantity,
    savedPerUnitInr,
    savedTotalInr: savedPerUnitInr * quantity,
    savedPct: (savedPerUnitInr / listPriceInr) * 100,
  };
}

/** "Completed in 14 seconds" / "Completed in 1m 5s" / "Completed in under a second". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return "under a second";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  return `${minutes}m ${seconds}s`;
}

/** Derives every fact the demo-polish features (savings, compliance
 * summary, one-line narrative, speed stat) need from one session's audit
 * events — a single place that interprets what actually happened, so each
 * of those features reads facts instead of re-parsing event messages. */
export function summarizeSession(events: AuditEvent[]): SessionSummary {
  const startEvent = events.find((e) =>
    e.message.startsWith(SESSION_START_PREFIX)
  );
  const goal = startEvent
    ? startEvent.message.slice(SESSION_START_PREFIX.length)
    : null;
  const budgetInr =
    startEvent && typeof startEvent.metadata?.budget_inr === "number"
      ? startEvent.metadata.budget_inr
      : null;

  const settlements = events
    .filter(isSettlementMessage)
    .map(extractSettlement)
    .filter((s): s is Settlement => s !== null);
  const totalSavedInr = settlements.reduce(
    (sum, s) => sum + Math.max(s.savedTotalInr, 0),
    0
  );

  const guardrailEvents = events.filter(
    (e) => e.event_type === "guardrail_check"
  );
  const passed = guardrailEvents.filter(
    (e) => e.metadata?.allowed === true
  ).length;
  const guardrails: GuardrailSummary = {
    total: guardrailEvents.length,
    passed,
    blocked: guardrailEvents.length - passed,
  };

  const orderCreatedEvent = events.find(
    (e) => e.actor === "razorpay" && e.message.startsWith("Created order")
  );
  const capturedEvent = events.find(
    (e) =>
      e.actor === "razorpay" &&
      e.event_type === "payment_call" &&
      e.message.includes("captured")
  );
  const razorpayFailureEvent = events.find(
    (e) => e.actor === "razorpay" && e.event_type === "failure"
  );
  const payment: PaymentSummary = {
    attempted: !!orderCreatedEvent || !!razorpayFailureEvent || !!capturedEvent,
    captured: !!capturedEvent,
    verified:
      !!capturedEvent &&
      capturedEvent.metadata?.signature_verified === true &&
      capturedEvent.metadata?.payments_api_verified === true,
    declined: !capturedEvent && !!razorpayFailureEvent,
    amountInr:
      typeof orderCreatedEvent?.metadata?.amount_inr === "number"
        ? orderCreatedEvent.metadata.amount_inr
        : null,
  };

  const negotiationRounds = events
    .filter((e) => e.event_type === "negotiation_turn")
    .reduce((max, e) => {
      const round = e.metadata?.round;
      return typeof round === "number" && round > max ? round : max;
    }, 0);

  const recoveries = events
    .filter((e) => e.event_type === "recovery")
    .map((e) =>
      typeof e.metadata?.failed_reason === "string"
        ? e.metadata.failed_reason
        : e.message
    );

  const discountAppliedEvent = events.find(
    (e) => e.event_type === "loyalty_discount_applied"
  );
  const loyalty: LoyaltySummary = {
    discountApplied: !!discountAppliedEvent,
    discountAppliedInr:
      typeof discountAppliedEvent?.metadata?.discount_inr === "number"
        ? discountAppliedEvent.metadata.discount_inr
        : 0,
  };

  const firstPurchaseDiscountEvent = events.find(
    (e) => e.event_type === "first_purchase_discount_applied"
  );
  const firstPurchase: FirstPurchaseSummary = {
    discountApplied: !!firstPurchaseDiscountEvent,
    discountAppliedInr:
      typeof firstPurchaseDiscountEvent?.metadata?.discount_inr === "number"
        ? firstPurchaseDiscountEvent.metadata.discount_inr
        : 0,
  };

  const upsellOfferedEvent = events.find(
    (e) => e.event_type === "upsell_offered"
  );
  const upsellAcceptedEvent = events.find(
    (e) => e.event_type === "upsell_accepted"
  );
  const upsell: UpsellSummary = {
    offered: !!upsellOfferedEvent,
    accepted: !!upsellAcceptedEvent,
    addOnName:
      typeof upsellOfferedEvent?.metadata?.upsell_name === "string"
        ? upsellOfferedEvent.metadata.upsell_name
        : null,
    addOnPriceInr:
      typeof upsellOfferedEvent?.metadata?.upsell_price_inr === "number"
        ? upsellOfferedEvent.metadata.upsell_price_inr
        : 0,
  };

  const bundleEvent = events.find(
    (e) => e.event_type === "bundle_discount_applied"
  );
  const bundle: BundleSummary = {
    applied: !!bundleEvent,
    bundleName:
      typeof bundleEvent?.metadata?.bundle_name === "string"
        ? bundleEvent.metadata.bundle_name
        : null,
  };

  const couponNudge: CouponNudgeSummary = {
    shown: events.some((e) => e.event_type === "coupon_nudge_shown"),
    converted: events.some((e) => e.event_type === "coupon_nudge_converted"),
  };

  const lowStockFlagCount = events.filter(
    (e) => e.event_type === "low_stock_flagged"
  ).length;

  const stopped = events.some((e) => e.event_type === "stopped");
  const negotiationFailed = events.some(
    (e) =>
      e.event_type === "failure" &&
      e.message.includes("failed to reach agreement")
  );
  const reachedMaxTurns = events.some(
    (e) =>
      e.event_type === "failure" &&
      e.message.includes("Reached max tool-calling turns")
  );
  const finalDecisionEvent = events.find(
    (e) => e.event_type === "decision" && e.metadata?.final === true
  );

  const terminalEvent =
    finalDecisionEvent ??
    events.find((e) => e.event_type === "stopped") ??
    (reachedMaxTurns
      ? events.find((e) => e.message.includes("Reached max tool-calling turns"))
      : undefined);

  const isComplete = !!terminalEvent;
  const startedAt = startEvent?.timestamp ?? null;
  const endedAt = terminalEvent?.timestamp ?? null;
  const durationMs =
    startedAt && endedAt
      ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
      : null;

  return {
    goal,
    budgetInr,
    startedAt,
    endedAt,
    durationMs: durationMs !== null && durationMs >= 0 ? durationMs : null,
    settlements,
    totalSavedInr,
    guardrails,
    payment,
    stopped,
    negotiationFailed,
    reachedMaxTurns,
    isComplete,
    negotiationRounds,
    recoveries,
    loyalty,
    firstPurchase,
    upsell,
    bundle,
    couponNudge,
    lowStockFlagCount,
  };
}
