"use client";

import { useMemo } from "react";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import type { AuditEvent } from "@/lib/types";

const PRICE_KEYS = ["settled_price_inr", "counter_inr", "offer_inr"] as const;

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

function Bubble({ event }: { event: AuditEvent }) {
  const isBuyer = event.actor === "buyer_agent";
  const price = extractPrice(event);
  const settled = isSettled(event);

  return (
    <div className={`flex ${isBuyer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
          isBuyer
            ? "rounded-bl-sm bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100"
            : "rounded-br-sm bg-purple-50 text-purple-900 dark:bg-purple-500/10 dark:text-purple-100"
        } ${settled ? "ring-2 ring-emerald-400/60" : ""}`}
      >
        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase opacity-70">
          {isBuyer ? "Buyer Agent" : "Merchant Agent"}
          {settled && (
            <span className="text-emerald-600 dark:text-emerald-400">
              ✓ Settled
            </span>
          )}
        </div>
        <p>{event.message}</p>
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

  const lastSettled = useMemo(
    () => [...negotiationEvents].reverse().find(isSettled) ?? null,
    [negotiationEvents]
  );
  const settledPrice = lastSettled ? extractPrice(lastSettled) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Negotiation
        </h2>
        {settledPrice !== null && (
          <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
            Settled at ₹{settledPrice.toFixed(2)}/unit
          </p>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {negotiationEvents.length === 0 ? (
          <p className="p-4 text-center text-sm text-zinc-400">
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
