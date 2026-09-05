"use client";

import { useMemo } from "react";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import { summarizeMerchantRevenue } from "@/lib/merchantRevenue";

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--text-success)]"
      : tone === "warning"
        ? "text-[var(--text-warning)]"
        : tone === "danger"
          ? "text-[var(--text-danger)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="p-4">
      <p className="text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function MerchantRevenuePanel() {
  const { allEvents } = useAuditTrail();
  const revenue = useMemo(
    () => summarizeMerchantRevenue(allEvents),
    [allEvents]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm font-semibold text-[var(--text-primary)]">
        <span className="text-[var(--text-success)]">
          ₹{revenue.totalRevenueInr.toFixed(2)}
        </span>{" "}
        in revenue closed across {revenue.totalCompletedSessions} sale
        {revenue.totalCompletedSessions === 1 ? "" : "s"}
        {revenue.likelyLostSalesCount > 0 && (
          <>
            {" "}
            — including {revenue.likelyLostSalesCount} sale
            {revenue.likelyLostSalesCount === 1 ? "" : "s"} that would likely
            have been lost without agent negotiation.
          </>
        )}
      </div>

      {revenue.firstPurchase.discountsAppliedCount > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm font-semibold text-[var(--text-primary)]">
          🎉 {revenue.firstPurchase.discountsAppliedCount} new customer
          {revenue.firstPurchase.discountsAppliedCount === 1 ? "" : "s"}{" "}
          received the first-purchase discount —{" "}
          <span className="text-[var(--text-success)]">
            ₹{revenue.firstPurchase.totalDiscountGivenInr.toFixed(2)}
          </span>{" "}
          given in discounts, contributing{" "}
          <span className="text-[var(--text-success)]">
            ₹{revenue.firstPurchase.discountedRevenueInr.toFixed(2)}
          </span>{" "}
          in revenue.
        </div>
      )}

      {revenue.loyalty.discountsAppliedCount > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm font-semibold text-[var(--text-primary)]">
          🎁 {revenue.loyalty.discountsAppliedCount} order
          {revenue.loyalty.discountsAppliedCount === 1 ? "" : "s"} received the
          automatic loyalty discount —{" "}
          <span className="text-[var(--text-success)]">
            ₹{revenue.loyalty.totalDiscountGivenInr.toFixed(2)}
          </span>{" "}
          given in discounts, contributing{" "}
          <span className="text-[var(--text-success)]">
            ₹{revenue.loyalty.discountedRevenueInr.toFixed(2)}
          </span>{" "}
          in revenue.
        </div>
      )}

      {revenue.upsell.offeredCount > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm font-semibold text-[var(--text-primary)]">
          🛍️ {revenue.upsell.acceptedCount} of {revenue.upsell.offeredCount}{" "}
          offered add-ons accepted, contributing{" "}
          <span className="text-[var(--text-success)]">
            ₹{revenue.upsell.revenueInr.toFixed(2)}
          </span>{" "}
          in additional revenue.
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
          <StatCard
            label="Completed sales"
            value={String(revenue.totalCompletedSessions)}
          />
          <StatCard
            label="Total revenue"
            value={`₹${revenue.totalRevenueInr.toFixed(2)}`}
            tone="success"
          />
          <StatCard
            label="Avg. order value"
            value={
              revenue.averageOrderValueInr !== null
                ? `₹${revenue.averageOrderValueInr.toFixed(2)}`
                : "–"
            }
          />
          <StatCard
            label="Sales negotiation likely saved"
            value={String(revenue.likelyLostSalesCount)}
            tone="success"
          />
          <StatCard
            label="Policy-blocked attempts"
            value={String(revenue.policyBlockedCount)}
            tone="danger"
          />
          <StatCard
            label="Upsells accepted"
            value={`${revenue.upsell.acceptedCount} / ${revenue.upsell.offeredCount}`}
            tone="success"
          />
          <StatCard
            label="First-purchase discounts applied"
            value={String(revenue.firstPurchase.discountsAppliedCount)}
            tone="success"
          />
          <StatCard
            label="Bundle discounts applied"
            value={String(revenue.bundle.appliedCount)}
          />
          <StatCard
            label="Coupon nudges converted"
            value={`${revenue.couponNudge.convertedCount} / ${revenue.couponNudge.shownCount}`}
            tone="success"
          />
          <StatCard
            label="Low-stock flags shown"
            value={String(revenue.lowStockFlagCount)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
          Sales negotiation likely saved
        </h2>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          Sessions where the buyer&apos;s stated budget was below the
          item&apos;s list price — without negotiation, these would likely never
          have closed.
        </p>

        {revenue.likelyLostSales.length === 0 ? (
          <p className="p-4 text-center text-sm text-[var(--text-tertiary)]">
            No sales like this yet — run a session with a tight budget on an
            item that negotiates well.
          </p>
        ) : (
          <ul className="space-y-3">
            {revenue.likelyLostSales.map((sale) => {
              const settlement =
                sale.summary.settlements[sale.summary.settlements.length - 1];
              return (
                <li
                  key={sale.sessionId}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border)] sm:grid-cols-2"
                >
                  <div className="border-b border-[var(--border)] p-3 text-sm text-[var(--text-danger)] sm:border-r sm:border-b-0">
                    <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                      Without negotiation
                    </p>
                    <p className="mt-1">
                      Budget ₹{sale.summary.budgetInr?.toFixed(2)} &lt; list
                      price ₹{settlement.listPriceInr.toFixed(2)} → sale likely
                      lost
                    </p>
                  </div>
                  <div className="p-3 text-sm text-[var(--text-success)]">
                    <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                      With negotiation
                    </p>
                    <p className="mt-1">
                      Settled at ₹{settlement.settledPriceInr.toFixed(2)} → sale
                      closed
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
