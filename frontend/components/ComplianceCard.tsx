"use client";

import { useMemo } from "react";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import { summarizeSession } from "@/lib/sessionSummary";

type CheckState = "pass" | "fail" | "neutral";

function CheckRow({
  state,
  label,
  detail,
}: {
  state: CheckState;
  label: string;
  detail?: string;
}) {
  const icon = state === "pass" ? "✓" : state === "fail" ? "✗" : "–";
  const iconClass =
    state === "pass"
      ? "text-emerald-600 dark:text-emerald-400"
      : state === "fail"
        ? "text-red-600 dark:text-red-400"
        : "text-zinc-400 dark:text-zinc-500";

  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 font-bold ${iconClass}`} aria-hidden>
        {icon}
      </span>
      <span className="text-sm text-zinc-700 dark:text-zinc-300">
        {label}
        {detail && (
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            {detail}
          </span>
        )}
      </span>
    </li>
  );
}

/** A compliance-style checklist for a completed session — visually distinct
 * from the raw audit trail log, meant to answer "was this trustworthy?" at
 * a glance rather than requiring someone to read every event. */
export default function ComplianceCard() {
  const { events } = useAuditTrail();
  const summary = useMemo(() => summarizeSession(events), [events]);

  if (!summary.isComplete) return null;

  const guardrailState: CheckState =
    summary.guardrails.total === 0 ? "neutral" : "pass";
  const guardrailDetail =
    summary.guardrails.total === 0
      ? "No policy checks ran this session"
      : `${summary.guardrails.passed} of ${summary.guardrails.total} allowed` +
        (summary.guardrails.blocked > 0
          ? `, ${summary.guardrails.blocked} correctly blocked`
          : "");

  const paymentState: CheckState = !summary.payment.attempted
    ? "neutral"
    : summary.payment.captured && summary.payment.verified
      ? "pass"
      : "fail";
  const paymentDetail = !summary.payment.attempted
    ? "No payment attempted this session"
    : paymentState === "pass"
      ? "Signature verified + confirmed via Razorpay's Payments API"
      : summary.payment.declined
        ? "Payment was declined"
        : "Captured, but not independently verified";

  return (
    <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <span aria-hidden>📋</span> Compliance Summary
      </h2>
      <ul className="space-y-2.5">
        <CheckRow
          state={guardrailState}
          label="Policy guardrails enforced"
          detail={guardrailDetail}
        />
        <CheckRow
          state={paymentState}
          label="Payment independently verified"
          detail={paymentDetail}
        />
        {summary.settlements.length > 0 && (
          <CheckRow
            state="pass"
            label={`₹${summary.totalSavedInr.toFixed(2)} saved via negotiation`}
            detail={`Across ${summary.settlements.length} settled negotiation${
              summary.settlements.length === 1 ? "" : "s"
            }`}
          />
        )}
      </ul>
    </div>
  );
}
