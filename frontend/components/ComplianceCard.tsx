"use client";

import { useMemo } from "react";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import { summarizeSession } from "@/lib/sessionSummary";

// "pending" is reserved for a genuine in-progress state (e.g. "Confirming
// payment…") — the one place amber/warning is allowed outside the
// money-positive (green) / money-negative-or-blocked (red) reservation.
type CheckState = "pass" | "fail" | "pending" | "neutral";

function CheckRow({
  state,
  label,
  detail,
}: {
  state: CheckState;
  label: string;
  detail?: string;
}) {
  const icon =
    state === "pass"
      ? "✓"
      : state === "fail"
        ? "✗"
        : state === "pending"
          ? "…"
          : "–";
  const iconClass =
    state === "pass"
      ? "text-[var(--text-success)]"
      : state === "fail"
        ? "text-[var(--text-danger)]"
        : state === "pending"
          ? "text-[var(--text-warning)]"
          : "text-[var(--text-tertiary)]";

  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 font-bold ${iconClass}`} aria-hidden>
        {icon}
      </span>
      <span className="text-sm text-[var(--text-primary)]">
        {label}
        {detail && (
          <span className="block text-xs text-[var(--text-secondary)]">
            {detail}
          </span>
        )}
      </span>
    </li>
  );
}

interface ComplianceCardProps {
  /** "full" (default) shows the complete technical wording — used in
   * Merchant View. "buyer" simplifies the payment-verification line so an
   * in-progress independent verification doesn't read as a failure. */
  variant?: "full" | "buyer";
}

/** A compliance-style checklist for a completed session — visually distinct
 * from the raw audit trail log, meant to answer "was this trustworthy?" at
 * a glance rather than requiring someone to read every event. */
export default function ComplianceCard({
  variant = "full",
}: ComplianceCardProps) {
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

  // Buyer View: an unverified-but-captured payment is a deliberate,
  // in-progress safety check, not a failure — an ✗ there reads as an error.
  // Keep a real ✗ only for an actual decline; show it as genuinely pending
  // otherwise (the one legitimate use of the amber/warning color here).
  const buyerPaymentState: CheckState =
    paymentState === "fail" && !summary.payment.declined
      ? "pending"
      : paymentState;
  const buyerPaymentLabel =
    buyerPaymentState === "pass"
      ? "Payment confirmed"
      : paymentState === "fail" && !summary.payment.declined
        ? "Confirming payment…"
        : "Payment independently verified";
  const buyerPaymentDetail =
    buyerPaymentState === "pass" ||
    (paymentState === "fail" && !summary.payment.declined)
      ? undefined
      : paymentDetail;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
        <span aria-hidden>📋</span> Compliance Summary
      </h2>
      <ul className="space-y-2.5">
        <CheckRow
          state={guardrailState}
          label="Policy guardrails enforced"
          detail={guardrailDetail}
        />
        {variant === "buyer" ? (
          <CheckRow
            state={buyerPaymentState}
            label={buyerPaymentLabel}
            detail={buyerPaymentDetail}
          />
        ) : (
          <CheckRow
            state={paymentState}
            label="Payment independently verified"
            detail={paymentDetail}
          />
        )}
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
