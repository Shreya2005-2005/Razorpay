"use client";

import { useMemo } from "react";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import type { AuditEvent } from "@/lib/types";

const PRICE_KEYS = ["settled_price_inr", "counter_inr", "offer_inr"] as const;

interface Settlement {
  settledPriceInr: number;
  listPriceInr: number;
  quantity: number;
  savedPerUnitInr: number;
  savedTotalInr: number;
  savedPct: number;
}

function extractPrice(event: AuditEvent): number | null {
  const meta = event.metadata ?? {};
  for (const key of PRICE_KEYS) {
    const value = meta[key];
    if (typeof value === "number") return value;
  }
  return null;
}

function isSettled(event: AuditEvent): boolean {
  return event.message.toLowerCase().includes("accepts");
}

/** A settlement event carries settled_price_inr + list_price_inr (added
 * specifically so the frontend can compute savings without re-deriving
 * pricing logic that only core.negotiation/core.merchant_agent know). */
function extractSettlement(event: AuditEvent): Settlement | null {
  const meta = event.metadata ?? {};
  const settledPriceInr = meta.settled_price_inr;
  const listPriceInr = meta.list_price_inr;
  const quantity = meta.quantity;
  if (
    typeof settledPriceInr !== "number" ||
    typeof listPriceInr !== "number" ||
    listPriceInr <= 0
  ) {
    return null;
  }
  const qty = typeof quantity === "number" && quantity > 0 ? quantity : 1;
  const savedPerUnitInr = listPriceInr - settledPriceInr;
  return {
    settledPriceInr,
    listPriceInr,
    quantity: qty,
    savedPerUnitInr,
    savedTotalInr: savedPerUnitInr * qty,
    savedPct: (savedPerUnitInr / listPriceInr) * 100,
  };
}

function SavingsLine({ settlement }: { settlement: Settlement }) {
  if (settlement.savedPerUnitInr <= 0) {
    // Settled at or above list price (e.g. a low opening offer that still
    // landed at list) — nothing to brag about, so just show the price.
    return (
      <p className="mt-1 font-mono text-xs opacity-80">
        ₹{settlement.settledPriceInr.toFixed(2)}/unit
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs opacity-80">
      <span className="font-mono line-through opacity-60">
        ₹{settlement.listPriceInr.toFixed(2)}
      </span>{" "}
      <span className="font-mono font-semibold">
        ₹{settlement.settledPriceInr.toFixed(2)}
      </span>{" "}
      <span className="font-medium text-[var(--text-success)]">
        — {settlement.savedPct.toFixed(0)}% saved
      </span>
    </p>
  );
}

function Bubble({ event }: { event: AuditEvent }) {
  const isBuyer = event.actor === "buyer_agent";
  const settled = isSettled(event);
  const settlement = settled ? extractSettlement(event) : null;
  const price = settlement ? null : extractPrice(event);

  return (
    <div className={`flex ${isBuyer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm text-[var(--text-primary)] ${
          isBuyer
            ? "rounded-bl-sm bg-[var(--surface-2)]"
            : "rounded-br-sm border border-[var(--border)] bg-[var(--surface-1)]"
        } ${settled ? "ring-2 ring-[var(--text-success)]/50" : ""}`}
      >
        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase opacity-70">
          {isBuyer ? "Buyer Agent" : "Merchant Agent"}
          {settled && (
            <span className="text-[var(--text-success)]">✓ Settled</span>
          )}
        </div>
        <p>{event.message}</p>
        {settlement && <SavingsLine settlement={settlement} />}
        {price !== null && (
          <p className="mt-1 font-mono text-xs opacity-80">
            ₹{price.toFixed(2)}/unit
          </p>
        )}
      </div>
    </div>
  );
}

export default function NegotiationPanel() {
  const { events } = useAuditTrail();

  const negotiationEvents = useMemo(
    () => events.filter((e) => e.event_type === "negotiation_turn"),
    [events]
  );

  const settlements = useMemo(
    () =>
      negotiationEvents
        .filter(isSettled)
        .map(extractSettlement)
        .filter((s): s is Settlement => s !== null),
    [negotiationEvents]
  );

  const lastSettlement =
    settlements.length > 0 ? settlements[settlements.length - 1] : null;
  const totalSavedInr = settlements.reduce(
    (sum, s) => sum + Math.max(s.savedTotalInr, 0),
    0
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Negotiation
        </h2>
        {lastSettlement && (
          <p className="mt-0.5 text-xs text-[var(--text-success)]">
            Settled at ₹{lastSettlement.settledPriceInr.toFixed(2)} vs list
            price ₹{lastSettlement.listPriceInr.toFixed(2)} —{" "}
            {lastSettlement.savedPct.toFixed(0)}% saved
          </p>
        )}
        {totalSavedInr > 0 && (
          <p className="mt-0.5 text-xs font-medium text-[var(--text-success)]">
            ₹{totalSavedInr.toFixed(2)} saved across {settlements.length}{" "}
            negotiation{settlements.length === 1 ? "" : "s"} so far
          </p>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {negotiationEvents.length === 0 ? (
          <p className="p-4 text-center text-sm text-[var(--text-tertiary)]">
            No negotiation activity yet.
          </p>
        ) : (
          negotiationEvents.map((event, idx) => (
            <Bubble key={idx} event={event} />
          ))
        )}
      </div>
    </div>
  );
}
