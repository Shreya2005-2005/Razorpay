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

  const loyaltyNudgeMessage = useMemo(() => {
    const firstPurchaseEvent = events.find(
      (e) => e.event_type === "first_purchase_discount_applied"
    );
    if (firstPurchaseEvent) {
      const discountPct = firstPurchaseEvent.metadata?.discount_pct;
      return typeof discountPct === "number"
        ? `Welcome! You've got ${(discountPct * 100).toFixed(0)}% off your first order.`
        : null;
    }
    const discountAppliedEvent = events.find(
      (e) => e.event_type === "loyalty_discount_applied"
    );
    if (discountAppliedEvent) {
      const discountInr = discountAppliedEvent.metadata?.discount_inr;
      return typeof discountInr === "number"
        ? `You've unlocked ₹${discountInr.toFixed(0)} off!`
        : null;
    }
    const nudgeEvent = events.find(
      (e) => e.event_type === "coupon_nudge_shown"
    );
    if (nudgeEvent) {
      const shortfallInr = nudgeEvent.metadata?.shortfall_inr;
      const discountInr = nudgeEvent.metadata?.discount_inr;
      if (typeof shortfallInr === "number" && typeof discountInr === "number") {
        return `Add ₹${shortfallInr.toFixed(0)} more to get ₹${discountInr.toFixed(0)} off!`;
      }
    }
    return null;
  }, [events]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Start a Buyer Agent Session
      </h2>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        Catalog: <span className="font-mono">{catalogFile}</span>
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-zinc-500 dark:text-zinc-400">
            Goal
          </span>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Find a gift under ₹700 and recommend the best one"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            required
          />
        </label>
        <label className="text-sm sm:w-40">
          <span className="mb-1 block text-zinc-500 dark:text-zinc-400">
            Budget (₹)
          </span>
          <input
            type="number"
            min={0}
            value={budgetInr}
            onChange={(e) => setBudgetInr(Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            required
          />
        </label>
        <button
          type="submit"
          disabled={status === "running"}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "running" ? "Running…" : "Start Buyer Agent"}
        </button>
        {canStop && (
          <button
            type="button"
            onClick={handleStop}
            disabled={stopping}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
          >
            {stopping ? "Stopping…" : "Stop Agent"}
          </button>
        )}
      </form>

      {status === "running" && !stopping && (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Agent is shopping — watch the audit trail for live activity…
        </p>
      )}

      {stopping && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          Stopping — the agent will halt before its next action…
        </p>
      )}

      {stopError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {stopError}
        </p>
      )}

      {loyaltyNudgeMessage && (
        <p className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-base font-bold text-purple-800 dark:border-purple-900/50 dark:bg-purple-500/10 dark:text-purple-300">
          {loyaltyNudgeMessage}
        </p>
      )}

      {resultMessage && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            status === "error"
              ? "border-red-200 bg-red-50 text-red-800 whitespace-pre-wrap dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-300"
              : "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
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
                  <strong className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {children}
                  </strong>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">
                    {children}
                  </code>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline dark:text-blue-400"
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
                  <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 font-semibold dark:border-zinc-700 dark:bg-zinc-800">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-zinc-300 px-2 py-1 dark:border-zinc-700">
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
        <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
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
