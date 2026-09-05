"use client";

import { useMemo, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { startSession, stopSession } from "@/lib/api";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import ComplianceCard from "@/components/ComplianceCard";
import { getOrCreateCustomerId } from "@/lib/customerId";
import { formatDuration, summarizeSession } from "@/lib/sessionSummary";

type Status = "idle" | "running" | "done" | "error";

interface SessionFormProps {
  catalogFile: string;
}

export default function SessionForm({ catalogFile }: SessionFormProps) {
  const { activeSessionId, isLive, events } = useAuditTrail();
  const [goal, setGoal] = useState("");
  const [budgetInr, setBudgetInr] = useState<number>(1000);
  const [status, setStatus] = useState<Status>("idle");
  const [resultMessage, setResultMessage] = useState("");
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;

    setStatus("running");
    setResultMessage("");
    setStopping(false);
    setStopError("");
    try {
      const result = await startSession({
        goal,
        budget_inr: budgetInr,
        catalog_file: catalogFile,
        customer_id: getOrCreateCustomerId(),
      });
      setResultMessage(result.final_message);
      setStatus("done");
    } catch (err) {
      setResultMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function handleStop() {
    if (!activeSessionId || stopping) return;
    setStopping(true);
    setStopError("");
    try {
      await stopSession(activeSessionId);
    } catch (err) {
      setStopError(err instanceof Error ? err.message : String(err));
      setStopping(false);
    }
  }

  // The session id only becomes known once the audit stream delivers the
  // "Starting session..." event — a beat after the request is sent, not
  // before — so the button can't appear until then.
  const canStop = status === "running" && isLive && !!activeSessionId;

  const durationMs = useMemo(
    () => summarizeSession(events).durationMs,
    [events]
  );

  const loyaltyNudge = useMemo(() => {
    const firstPurchaseEvent = events.find(
      (e) => e.event_type === "first_purchase_discount_applied"
    );
    if (firstPurchaseEvent) {
      const discountPct = firstPurchaseEvent.metadata?.discount_pct;
      return typeof discountPct === "number"
        ? {
            message: `Welcome! You've got ${(discountPct * 100).toFixed(0)}% off your first order.`,
            unlocked: true,
          }
        : null;
    }
    const discountAppliedEvent = events.find(
      (e) => e.event_type === "loyalty_discount_applied"
    );
    if (discountAppliedEvent) {
      const discountInr = discountAppliedEvent.metadata?.discount_inr;
      return typeof discountInr === "number"
        ? {
            message: `You've unlocked ₹${discountInr.toFixed(0)} off!`,
            unlocked: true,
          }
        : null;
    }
    const nudgeEvent = events.find(
      (e) => e.event_type === "coupon_nudge_shown"
    );
    if (nudgeEvent) {
      const shortfallInr = nudgeEvent.metadata?.shortfall_inr;
      const discountInr = nudgeEvent.metadata?.discount_inr;
      if (typeof shortfallInr === "number" && typeof discountInr === "number") {
        return {
          message: `Add ₹${shortfallInr.toFixed(0)} more to get ₹${discountInr.toFixed(0)} off!`,
          unlocked: false,
        };
      }
    }
    return null;
  }, [events]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <h2 className="mb-0.5 text-sm font-semibold text-[var(--text-primary)]">
        Start a Buyer Agent Session
      </h2>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Catalog: <span className="font-mono">{catalogFile}</span>
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Goal</span>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Find a gift under ₹700 and recommend the best one"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--border-strong)] focus:outline-none"
            required
          />
        </label>
        <label className="text-sm sm:w-40">
          <span className="mb-1 block text-[var(--text-secondary)]">
            Budget (₹)
          </span>
          <input
            type="number"
            min={0}
            value={budgetInr}
            onChange={(e) => setBudgetInr(Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--border-strong)] focus:outline-none"
            required
          />
        </label>
        <button
          type="submit"
          disabled={status === "running"}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--surface-0)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "running" ? "Running…" : "Start Buyer Agent"}
        </button>
        {canStop && (
          <button
            type="button"
            onClick={handleStop}
            disabled={stopping}
            className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stopping ? "Stopping…" : "Stop Agent"}
          </button>
        )}
      </form>

      {status === "running" && !stopping && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Agent is shopping — watch the audit trail for live activity…
        </p>
      )}

      {stopping && (
        <p className="mt-3 text-sm text-[var(--text-warning)]">
          Stopping — the agent will halt before its next action…
        </p>
      )}

      {stopError && (
        <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
          {stopError}
        </p>
      )}

      {loyaltyNudge && (
        <p
          className={`mt-3 rounded-lg border p-3 text-base font-bold ${
            loyaltyNudge.unlocked
              ? "border-[var(--border)] text-[var(--text-success)]"
              : "border-[var(--border)] text-[var(--text-warning)]"
          }`}
        >
          {loyaltyNudge.message}
        </p>
      )}

      {resultMessage && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            status === "error"
              ? "border-[var(--border-strong)] bg-[var(--surface-2)] whitespace-pre-wrap text-[var(--text-primary)]"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)]"
          }`}
        >
          {status === "error" ? (
            resultMessage
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">
                    {children}
                  </ol>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-[var(--text-primary)]">
                    {children}
                  </strong>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-xs">
                    {children}
                  </code>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--text-primary)] underline"
                  >
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="mb-2 overflow-x-auto last:mb-0">
                    <table className="w-full border-collapse text-left text-sm">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 font-semibold">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-[var(--border)] px-2 py-1">
                    {children}
                  </td>
                ),
              }}
            >
              {resultMessage}
            </ReactMarkdown>
          )}
        </div>
      )}

      {status === "done" && durationMs !== null && (
        <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
          Completed in {formatDuration(durationMs)}
        </p>
      )}

      {status === "done" && (
        <div className="mt-3">
          <ComplianceCard variant="buyer" />
        </div>
      )}
    </div>
  );
}
