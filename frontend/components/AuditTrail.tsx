"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuditTrail, type ConnectionState } from "@/hooks/useAuditTrail";
import { generateSessionNarrative } from "@/lib/sessionNarrative";
import { summarizeSession } from "@/lib/sessionSummary";
import type { AuditActor, AuditEvent } from "@/lib/types";

const ACTOR_STYLES: Record<
  AuditActor,
  { dot: string; badge: string; label: string }
> = {
  buyer_agent: {
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    label: "Buyer Agent",
  },
  merchant_agent: {
    dot: "bg-purple-500",
    badge:
      "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
    label: "Merchant Agent",
  },
  policy_guard: {
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    label: "Policy Guard",
  },
  razorpay: {
    dot: "bg-green-500",
    badge:
      "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300",
    label: "Razorpay",
  },
  system: {
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-300",
    label: "System",
  },
};

const EVENT_TYPE_STYLES: Record<string, string> = {
  decision: "text-zinc-500 dark:text-zinc-400",
  guardrail_check: "text-amber-600 dark:text-amber-400",
  negotiation_turn: "text-purple-600 dark:text-purple-400",
  payment_call: "text-green-600 dark:text-green-400",
  failure: "text-red-600 dark:text-red-400",
  recovery: "text-teal-600 dark:text-teal-400",
  stopped: "text-orange-600 dark:text-orange-400",
  loyalty_discount_applied: "text-purple-600 dark:text-purple-400",
  upsell_offered: "text-pink-600 dark:text-pink-400",
  upsell_accepted: "text-pink-600 dark:text-pink-400",
  upsell_declined: "text-zinc-500 dark:text-zinc-400",
  bundle_discount_applied: "text-purple-600 dark:text-purple-400",
  coupon_nudge_shown: "text-fuchsia-600 dark:text-fuchsia-400",
  coupon_nudge_converted: "text-fuchsia-600 dark:text-fuchsia-400",
  low_stock_flagged: "text-amber-600 dark:text-amber-400",
};

const CONNECTION_STYLES: Record<
  ConnectionState,
  { dot: string; label: string }
> = {
  connecting: { dot: "bg-amber-400", label: "Connecting…" },
  open: { dot: "bg-green-500", label: "Live" },
  error: { dot: "bg-red-500", label: "Reconnecting…" },
};

function formatTime(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function AuditRow({ event }: { event: AuditEvent }) {
  const style = ACTOR_STYLES[event.actor] ?? ACTOR_STYLES.system;
  const eventTypeClass = EVENT_TYPE_STYLES[event.event_type] ?? "text-zinc-500";

  return (
    <div className="flex gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-b-0 dark:border-zinc-800/60">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
            {formatTime(event.timestamp)}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${style.badge}`}
          >
            {style.label}
          </span>
          <span
            className={`text-xs font-medium tracking-wide uppercase ${eventTypeClass}`}
          >
            {event.event_type.replace("_", " ")}
          </span>
        </div>
        <p className="mt-0.5 text-sm break-words text-zinc-800 dark:text-zinc-200">
          {event.message}
        </p>
      </div>
    </div>
  );
}

interface AuditTrailProps {
  /** "full" (default) uses the technical "Audit Trail" heading — used in
   * Merchant View. "buyer" reframes it as a trust/transparency feature;
   * the log content and behavior are identical either way. */
  variant?: "full" | "buyer";
}

export default function AuditTrail({ variant = "full" }: AuditTrailProps) {
  const { events, connectionState } = useAuditTrail();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 48;
  }

  const status = CONNECTION_STYLES[connectionState];
  const narrative = useMemo(() => {
    const summary = summarizeSession(events);
    return summary.goal ? generateSessionNarrative(summary) : null;
  }, [events]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {variant === "buyer"
            ? "Full Transparency Log: every decision this agent made"
            : "Audit Trail"}
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span
            className={`h-1.5 w-1.5 rounded-full ${status.dot} ${
              connectionState === "open" ? "animate-pulse" : ""
            }`}
          />
          {status.label}
        </div>
      </div>
      {narrative && (
        <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-700 italic dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {narrative}
        </p>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {events.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-400">
            No events yet — start a buyer agent session to see activity here.
          </p>
        ) : (
          events.map((event, idx) => <AuditRow key={idx} event={event} />)
        )}
      </div>
    </div>
  );
}
