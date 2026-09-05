import { type SessionSummary, summarizeSession } from "@/lib/sessionSummary";
import type { AuditEvent } from "@/lib/types";

export interface SessionAggregate {
  sessionId: string;
  summary: SessionSummary;
  /** True when the buyer's stated budget was below the sold item's list
   * price, but the sale still completed — the clearest "negotiation grew
   * revenue" signal, since without it this sale would likely never have
   * closed at all. */
  wasLikelyLostWithoutNegotiation: boolean;
}

export interface LoyaltyRevenueSummary {
  discountsAppliedCount: number;
  totalDiscountGivenInr: number;
  discountedRevenueInr: number;
}

export interface FirstPurchaseRevenueSummary {
  discountsAppliedCount: number;
  totalDiscountGivenInr: number;
  discountedRevenueInr: number;
}

export interface UpsellRevenueSummary {
  offeredCount: number;
  acceptedCount: number;
  revenueInr: number;
}

export interface BundleRevenueSummary {
  appliedCount: number;
}

export interface CouponNudgeRevenueSummary {
  shownCount: number;
  convertedCount: number;
}

export interface MerchantRevenueSummary {
  totalCompletedSessions: number;
  totalRevenueInr: number;
  averageOrderValueInr: number | null;
  likelyLostSalesCount: number;
  likelyLostSalesRevenueInr: number;
  policyBlockedCount: number;
  likelyLostSales: SessionAggregate[];
  loyalty: LoyaltyRevenueSummary;
  firstPurchase: FirstPurchaseRevenueSummary;
  upsell: UpsellRevenueSummary;
  bundle: BundleRevenueSummary;
  couponNudge: CouponNudgeRevenueSummary;
  lowStockFlagCount: number;
}

function groupEventsBySession(events: AuditEvent[]): Map<string, AuditEvent[]> {
  const groups = new Map<string, AuditEvent[]>();
  for (const event of events) {
    if (!event.session_id) continue;
    const group = groups.get(event.session_id);
    if (group) {
      group.push(event);
    } else {
      groups.set(event.session_id, [event]);
    }
  }
  return groups;
}

/** Aggregates every session's audit events into merchant-facing revenue
 * facts — reuses summarizeSession() per session rather than re-deriving
 * settlement/payment/guardrail parsing a second time. */
export function summarizeMerchantRevenue(
  allEvents: AuditEvent[]
): MerchantRevenueSummary {
  const sessionGroups = groupEventsBySession(allEvents);

  const aggregates: SessionAggregate[] = Array.from(
    sessionGroups.entries()
  ).map(([sessionId, sessionEvents]) => {
    const summary = summarizeSession(sessionEvents);
    const primarySettlement =
      summary.settlements.length > 0
        ? summary.settlements[summary.settlements.length - 1]
        : null;
    const wasLikelyLostWithoutNegotiation =
      summary.payment.captured &&
      primarySettlement !== null &&
      summary.budgetInr !== null &&
      summary.budgetInr < primarySettlement.listPriceInr;
    return { sessionId, summary, wasLikelyLostWithoutNegotiation };
  });

  const completed = aggregates.filter((a) => a.summary.payment.captured);
  const totalRevenueInr = completed.reduce(
    (sum, a) => sum + (a.summary.payment.amountInr ?? 0),
    0
  );
  const likelyLostSales = aggregates.filter(
    (a) => a.wasLikelyLostWithoutNegotiation
  );
  const policyBlockedCount = aggregates.reduce(
    (sum, a) => sum + a.summary.guardrails.blocked,
    0
  );

  const discountedSessions = completed.filter(
    (a) => a.summary.loyalty.discountApplied
  );
  const loyalty: LoyaltyRevenueSummary = {
    discountsAppliedCount: discountedSessions.length,
    totalDiscountGivenInr: discountedSessions.reduce(
      (sum, a) => sum + a.summary.loyalty.discountAppliedInr,
      0
    ),
    discountedRevenueInr: discountedSessions.reduce(
      (sum, a) => sum + (a.summary.payment.amountInr ?? 0),
      0
    ),
  };

  const firstPurchaseDiscountedSessions = completed.filter(
    (a) => a.summary.firstPurchase.discountApplied
  );
  const firstPurchase: FirstPurchaseRevenueSummary = {
    discountsAppliedCount: firstPurchaseDiscountedSessions.length,
    totalDiscountGivenInr: firstPurchaseDiscountedSessions.reduce(
      (sum, a) => sum + a.summary.firstPurchase.discountAppliedInr,
      0
    ),
    discountedRevenueInr: firstPurchaseDiscountedSessions.reduce(
      (sum, a) => sum + (a.summary.payment.amountInr ?? 0),
      0
    ),
  };

  const upsellAcceptedSessions = completed.filter(
    (a) => a.summary.upsell.accepted
  );
  const upsell: UpsellRevenueSummary = {
    offeredCount: aggregates.filter((a) => a.summary.upsell.offered).length,
    acceptedCount: upsellAcceptedSessions.length,
    revenueInr: upsellAcceptedSessions.reduce(
      (sum, a) => sum + a.summary.upsell.addOnPriceInr,
      0
    ),
  };

  const bundle: BundleRevenueSummary = {
    appliedCount: completed.filter((a) => a.summary.bundle.applied).length,
  };

  const couponNudge: CouponNudgeRevenueSummary = {
    shownCount: aggregates.filter((a) => a.summary.couponNudge.shown).length,
    convertedCount: aggregates.filter((a) => a.summary.couponNudge.converted)
      .length,
  };

  const lowStockFlagCount = aggregates.reduce(
    (sum, a) => sum + a.summary.lowStockFlagCount,
    0
  );

  return {
    totalCompletedSessions: completed.length,
    totalRevenueInr,
    averageOrderValueInr:
      completed.length > 0 ? totalRevenueInr / completed.length : null,
    likelyLostSalesCount: likelyLostSales.length,
    likelyLostSalesRevenueInr: likelyLostSales.reduce(
      (sum, a) => sum + (a.summary.payment.amountInr ?? 0),
      0
    ),
    policyBlockedCount,
    likelyLostSales,
    loyalty,
    firstPurchase,
    upsell,
    bundle,
    couponNudge,
    lowStockFlagCount,
  };
}
