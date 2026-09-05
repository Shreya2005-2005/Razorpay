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
  tone?: "neutral" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
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
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-500/10 dark:text-emerald-300">
        ₹{revenue.totalRevenueInr.toFixed(2)} in revenue closed across{" "}
        {revenue.totalCompletedSessions} sale
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
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-500/10 dark:text-indigo-300">
          🎉 {revenue.firstPurchase.discountsAppliedCount} new customer
          {revenue.firstPurchase.discountsAppliedCount === 1 ? "" : "s"}{" "}
          received the first-purchase discount — ₹
          {revenue.firstPurchase.totalDiscountGivenInr.toFixed(2)} given in
          discounts, contributing ₹
          {revenue.firstPurchase.discountedRevenueInr.toFixed(2)} in revenue.
        </div>
      )}

      {revenue.loyalty.discountsAppliedCount > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm font-semibold text-purple-800 dark:border-purple-900/50 dark:bg-purple-500/10 dark:text-purple-300">
          🎁 {revenue.loyalty.discountsAppliedCount} order
          {revenue.loyalty.discountsAppliedCount === 1 ? "" : "s"} received the
          automatic loyalty discount — ₹
          {revenue.loyalty.totalDiscountGivenInr.toFixed(2)} given in discounts,
          contributing ₹{revenue.loyalty.discountedRevenueInr.toFixed(2)} in
          revenue.
        </div>
      )}

      {revenue.upsell.offeredCount > 0 && (
        <div className="rounded-xl border border-pink-200 bg-pink-50 p-4 text-sm font-semibold text-pink-800 dark:border-pink-900/50 dark:bg-pink-500/10 dark:text-pink-300">
          🛍️ {revenue.upsell.acceptedCount} of {revenue.upsell.offeredCount}{" "}
          offered add-ons accepted, contributing ₹
          {revenue.upsell.revenueInr.toFixed(2)} in additional revenue.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Completed sales"
          value={String(revenue.totalCompletedSessions)}
        />
        <StatCard
          label="Total revenue"
          value={`₹${revenue.totalRevenueInr.toFixed(2)}`}
          tone="emerald"
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
          tone="emerald"
        />
        <StatCard
          label="Policy-blocked attempts"
          value={String(revenue.policyBlockedCount)}
          tone="amber"
        />
        <StatCard
          label="Upsells accepted"
          value={`${revenue.upsell.acceptedCount} / ${revenue.upsell.offeredCount}`}
          tone="emerald"
        />
        <StatCard
          label="First-purchase discounts applied"
          value={String(revenue.firstPurchase.discountsAppliedCount)}
          tone="emerald"
        />
        <StatCard
          label="Bundle discounts applied"
          value={String(revenue.bundle.appliedCount)}
        />
        <StatCard
          label="Coupon nudges converted"
          value={`${revenue.couponNudge.convertedCount} / ${revenue.couponNudge.shownCount}`}
          tone="emerald"
        />
        <StatCard
          label="Low-stock flags shown"
          value={String(revenue.lowStockFlagCount)}
          tone="amber"
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Sales negotiation likely saved
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Sessions where the buyer&apos;s stated budget was below the
          item&apos;s list price — without negotiation, these would likely never
          have closed.
        </p>

        {revenue.likelyLostSales.length === 0 ? (
          <p className="p-4 text-center text-sm text-zinc-400">
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
                  className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 sm:grid-cols-2 dark:border-zinc-800"
                >
                  <div className="rounded-t-lg border-b border-zinc-200 bg-red-50 p-3 text-sm text-red-800 sm:rounded-tr-none sm:rounded-l-lg sm:border-r sm:border-b-0 dark:border-zinc-800 dark:bg-red-500/10 dark:text-red-300">
                    <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
                      Without negotiation
                    </p>
                    <p className="mt-1">
                      Budget ₹{sale.summary.budgetInr?.toFixed(2)} &lt; list
                      price ₹{settlement.listPriceInr.toFixed(2)} → sale likely
                      lost
                    </p>
                  </div>
                  <div className="rounded-b-lg bg-emerald-50 p-3 text-sm text-emerald-800 sm:rounded-bl-none sm:rounded-r-lg dark:bg-emerald-500/10 dark:text-emerald-300">
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
