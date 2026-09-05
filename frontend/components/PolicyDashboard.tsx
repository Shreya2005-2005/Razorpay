"use client";

import { useEffect, useState } from "react";
import { fetchPolicy } from "@/lib/api";
import type { PolicyConfig } from "@/lib/types";

interface PolicyDashboardProps {
  /** "full" (default) shows every rule — used in Merchant View. "buyer"
   * drops the internal system limits (spend cap, order-count cap) and the
   * static category lists, which aren't tied to anything the buyer sees
   * happen, keeping just a plain-language approval-threshold note. */
  variant?: "full" | "buyer";
}

export default function PolicyDashboard({
  variant = "full",
}: PolicyDashboardProps) {
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPolicy()
      .then(setPolicy)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, []);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Policy Guard Rules
      </h2>

      {error && (
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {error}
        </p>
      )}
      {!policy && !error && (
        <p className="text-sm text-[var(--text-tertiary)]">Loading policy…</p>
      )}

      {policy && variant === "buyer" && (
        <p className="text-sm text-[var(--text-primary)]">
          Orders above ₹{policy.requires_human_approval_above.toFixed(2)} may
          need manual approval.
        </p>
      )}

      {policy && variant === "full" && (
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-[var(--text-secondary)]">Max spend / order</dt>
            <dd className="font-mono font-medium text-[var(--text-primary)]">
              ₹{policy.max_spend_per_order.toFixed(2)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-[var(--text-secondary)]">
              Max orders / session
            </dt>
            <dd className="font-mono font-medium text-[var(--text-primary)]">
              {policy.max_orders_per_session}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-[var(--text-secondary)]">
              Human approval above
            </dt>
            <dd className="font-mono font-medium text-[var(--text-primary)]">
              ₹{policy.requires_human_approval_above.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-[var(--text-secondary)]">
              Allowed categories
            </dt>
            <dd className="flex flex-wrap gap-1.5">
              {policy.allowed_categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
                >
                  {category}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-[var(--text-secondary)]">
              Blocked categories
            </dt>
            <dd className="flex flex-wrap gap-1.5">
              {policy.blocked_categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--text-danger)]"
                >
                  {category}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
