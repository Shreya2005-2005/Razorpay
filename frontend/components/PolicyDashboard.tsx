"use client";

import { useEffect, useState } from "react";
import { fetchPolicy } from "@/lib/api";
import type { PolicyConfig } from "@/lib/types";

export default function PolicyDashboard() {
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPolicy()
      .then(setPolicy)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Policy Guard Rules
      </h2>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!policy && !error && <p className="text-sm text-zinc-400">Loading policy…</p>}

      {policy && (
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-zinc-500 dark:text-zinc-400">Max spend / order</dt>
            <dd className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
              ₹{policy.max_spend_per_order.toFixed(2)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-zinc-500 dark:text-zinc-400">Max orders / session</dt>
            <dd className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
              {policy.max_orders_per_session}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-zinc-500 dark:text-zinc-400">Human approval above</dt>
            <dd className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
              ₹{policy.requires_human_approval_above.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-zinc-500 dark:text-zinc-400">Allowed categories</dt>
            <dd className="flex flex-wrap gap-1.5">
              {policy.allowed_categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                >
                  {category}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-zinc-500 dark:text-zinc-400">Blocked categories</dt>
            <dd className="flex flex-wrap gap-1.5">
              {policy.blocked_categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300"
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
