"use client";

import { useEffect, useState } from "react";
import { armFailure, disarmFailure, fetchArmedFailures } from "@/lib/api";
import type { FailureMode, Product } from "@/lib/types";

const MODES: { value: FailureMode; label: string }[] = [
  { value: "stock_out", label: "Stock out" },
  { value: "payment_decline", label: "Payment decline" },
];

interface FailureTriggerProps {
  products: Product[];
}

export default function FailureTrigger({ products }: FailureTriggerProps) {
  const [productId, setProductId] = useState("");
  const [mode, setMode] = useState<FailureMode>("stock_out");
  const [armed, setArmed] = useState<Record<string, FailureMode>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchArmedFailures()
      .then(setArmed)
      .catch(() => {
        // Non-fatal — arm/disarm actions below surface their own errors.
      });
  }, []);

  if (products.length === 0 && productId !== "") {
    setProductId("");
  } else if (
    products.length > 0 &&
    !products.some((p) => p.product_id === productId)
  ) {
    setProductId(products[0].product_id);
  }

  async function handleArm() {
    if (!productId) return;
    setBusy(true);
    setError("");
    try {
      setArmed(await armFailure(productId, mode));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisarm(id: string) {
    setBusy(true);
    setError("");
    try {
      setArmed(await disarmFailure(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const armedEntries = Object.entries(armed);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Failure Injector
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={products.length === 0}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {products.length === 0 && (
            <option value="">No products loaded</option>
          )}
          {products.map((p) => (
            <option key={p.product_id} value={p.product_id}>
              {p.product_id} — {p.name}
            </option>
          ))}
        </select>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as FailureMode)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleArm}
          disabled={busy || !productId}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Arm
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          Armed for next checkout attempt:
        </p>
        {armedEntries.length === 0 ? (
          <p className="text-sm text-zinc-400">None armed.</p>
        ) : (
          <ul className="space-y-1.5">
            {armedEntries.map(([id, m]) => (
              <li
                key={id}
                className="flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
              >
                <span>
                  <span className="font-mono">{id}</span> —{" "}
                  {m.replace("_", " ")}
                </span>
                <button
                  type="button"
                  onClick={() => handleDisarm(id)}
                  disabled={busy}
                  className="text-xs font-medium text-amber-700 underline hover:text-amber-900 disabled:opacity-60 dark:text-amber-300 dark:hover:text-amber-100"
                >
                  Disarm
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
