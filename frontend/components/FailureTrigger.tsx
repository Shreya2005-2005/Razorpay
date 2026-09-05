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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Failure Injector
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={products.length === 0}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--border-strong)] focus:outline-none disabled:opacity-60"
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
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--border-strong)] focus:outline-none"
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
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--surface-0)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Arm
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
          {error}
        </p>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-xs text-[var(--text-secondary)]">
          Armed for next checkout attempt:
        </p>
        {armedEntries.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">None armed.</p>
        ) : (
          <ul className="space-y-1.5">
            {armedEntries.map(([id, m]) => (
              <li
                key={id}
                className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-sm text-[var(--text-warning)]"
              >
                <span>
                  <span className="font-mono">{id}</span> —{" "}
                  {m.replace("_", " ")}
                </span>
                <button
                  type="button"
                  onClick={() => handleDisarm(id)}
                  disabled={busy}
                  className="text-xs font-medium text-[var(--text-warning)] underline hover:opacity-80 disabled:opacity-60"
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
