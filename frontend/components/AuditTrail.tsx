"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuditTrail, type ConnectionState } from "@/hooks/useAuditTrail";
import { generateSessionNarrative } from "@/lib/sessionNarrative";
import { summarizeSession } from "@/lib/sessionSummary";
import type { AuditActor, AuditEvent } from "@/lib/types";

// Actor identity isn't a status, so it isn't colored — every actor shares
// the same neutral badge, differentiated by label text only.
const ACTOR_LABELS: Record<AuditActor, string> = {
  buyer_agent: "Buyer Agent",
  merchant_agent: "Merchant Agent",
  policy_guard: "Policy Guard",
  razorpay: "Razorpay",
  system: "System",
};

type Accent = "neutral" | "success" | "danger";

const ACCENT_BORDER: Record<Accent, string> = {
  neutral: "border-l-[var(--border-strong)]",
  success: "border-l-[var(--text-success)]",
  danger: "border-l-[var(--text-danger)]",
};

const SUCCESS_EVENT_TYPES = new Set([
  "loyalty_discount_applied",
  "bundle_discount_applied",
  "upsell_accepted",
  "coupon_nudge_converted",
]);

/** One event type maps to exactly one of 3 accents — gray for neutral/
 * decision events, green for payment-success/discount-applied events, red
 * for blocked/declined events. A payment_call event and a guardrail_check
 * event each cover both an outcome and a non-outcome message, so those two
 * are resolved from the event's own metadata/message rather than a static
 * table. */
function eventAccent(event: AuditEvent): Accent {
  if (event.event_type === "failure") return "danger";
  if (event.event_type === "guardrail_check") {
    return event.metadata?.allowed === false ? "danger" : "neutral";
  }
  if (event.event_type === "payment_call") {
    return event.message.toLowerCase().includes("captured")
      ? "success"
      : "neutral";
  }
  if (SUCCESS_EVENT_TYPES.has(event.event_type)) return "success";
  return "neutral";
}

const CONNECTION_STYLES: Record<
  ConnectionState,
  { dot: string; label: string }
> = {
  connecting: { dot: "bg-[var(--text-warning)]", label: "Connecting…" },
  open: { dot: "bg-[var(--text-tertiary)]", label: "Live" },
  error: { dot: "bg-[var(--text-warning)]", label: "Reconnecting…" },
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
  const accent = eventAccent(event);

  return (
    <div
      className={`flex gap-3 rounded-l-none border-b border-l-2 border-[var(--border)] px-4 py-2.5 last:border-b-0 ${ACCENT_BORDER[accent]}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-xs text-[var(--text-tertiary)]">
            {formatTime(event.timestamp)}
          </span>
          <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
            {ACTOR_LABELS[event.actor] ?? "System"}
          </span>
          <span className="text-xs font-medium tracking-wide text-[var(--text-tertiary)] uppercase">
            {event.event_type.replace("_", " ")}
          </span>
        </div>
        <p className="mt-0.5 text-sm break-words text-[var(--text-primary)]">
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
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {variant === "buyer"
            ? "Full Transparency Log: every decision this agent made"
            : "Audit Trail"}
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${status.dot} ${
              connectionState === "open" ? "animate-pulse" : ""
            }`}
          />
          {status.label}
        </div>
      </div>
      {narrative && (
        <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-secondary)] italic">
          {narrative}
        </p>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {events.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">
            No events yet — start a buyer agent session to see activity here.
          </p>
        ) : (
          events.map((event, idx) => <AuditRow key={idx} event={event} />)
        )}
      </div>
    </div>
  );
}
