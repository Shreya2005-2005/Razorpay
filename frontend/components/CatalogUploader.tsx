"use client";

import { useEffect, useRef, useState } from "react";
import { fetchCatalog } from "@/lib/api";
import type { Product } from "@/lib/types";

const CATALOG_FILES = [
  { file: "catalog_demo_1.csv", label: "Demo 1 (CSV)" },
  { file: "catalog_demo_2.json", label: "Demo 2 (JSON)" },
  { file: "catalog_demo_3.csv", label: "Demo 3 (CSV)" },
];

type Status = "loading" | "done" | "error";

interface CatalogUploaderProps {
  value: string;
  onChange: (file: string) => void;
  onProductsChange?: (products: Product[]) => void;
  /** "full" (default) shows the data-ingestion badge — used in Merchant
   * View. "buyer" hides it: it's a catalog-parsing detail, not something a
   * buyer needs to see. */
  variant?: "full" | "buyer";
}

export default function CatalogUploader({
  value,
  onChange,
  onProductsChange,
  variant = "full",
}: CatalogUploaderProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState(value);
  // Suppresses the swap flash on the very first load — it's only meant to
  // confirm a *change*, since that's the thing that's easy to miss.
  const hasLoadedOnceRef = useRef(false);
  const [justSwapped, setJustSwapped] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (loadedFor !== value) {
    setLoadedFor(value);
    setStatus("loading");
    setError("");
  }

  useEffect(() => {
    let cancelled = false;

    fetchCatalog(value)
      .then((data) => {
        if (cancelled) return;
        setProducts(data);
        onProductsChange?.(data);
        setStatus("done");

        if (hasLoadedOnceRef.current) {
          setJustSwapped(true);
          if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
          flashTimeoutRef.current = setTimeout(
            () => setJustSwapped(false),
            1400
          );
        }
        hasLoadedOnceRef.current = true;
      })
      .catch((err) => {
        if (cancelled) return;
        setProducts([]);
        onProductsChange?.([]);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [value, onProductsChange]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const extension = value.split(".").pop()?.toLowerCase() ?? "";

  return (
    <div
      className={`rounded-xl border bg-[var(--surface-1)] p-4 transition-colors duration-700 ${
        justSwapped ? "border-[var(--border-strong)]" : "border-[var(--border)]"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Merchant Catalog
        </h2>
        <span
          className={`text-xs font-medium text-[var(--text-secondary)] transition-opacity duration-700 ${
            justSwapped ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={!justSwapped}
        >
          ✓ Catalog swapped — re-parsed from scratch
        </span>
      </div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--border-strong)] focus:outline-none"
      >
        {CATALOG_FILES.map(({ file, label }) => (
          <option key={file} value={file}>
            {label} — {file}
          </option>
        ))}
      </select>

      {status === "loading" && (
        <p className="text-sm text-[var(--text-tertiary)]">
          Translating catalog…
        </p>
      )}
      {status === "error" && (
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {error}
        </p>
      )}

      {status === "done" && (
        <>
          <div className="mb-3 flex items-center gap-2">
            {variant === "full" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                <span aria-hidden>✓</span> parsed from .{extension}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
              {products.length} product{products.length === 1 ? "" : "s"}{" "}
              normalized
            </span>
          </div>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            Same standard schema regardless of the source file&apos;s column
            names — proof this works with any merchant&apos;s catalog format.
          </p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--surface-2)]">
                <tr>
                  <th className="px-2 py-1.5 font-semibold text-[var(--text-secondary)]">
                    ID
                  </th>
                  <th className="px-2 py-1.5 font-semibold text-[var(--text-secondary)]">
                    Name
                  </th>
                  <th className="px-2 py-1.5 font-semibold text-[var(--text-secondary)]">
                    ₹
                  </th>
                  <th className="px-2 py-1.5 font-semibold text-[var(--text-secondary)]">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.product_id}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-2 py-1 font-mono text-[var(--text-secondary)]">
                      {p.product_id}
                    </td>
                    <td className="px-2 py-1 text-[var(--text-primary)]">
                      {p.name}
                    </td>
                    <td className="px-2 py-1 font-mono text-[var(--text-secondary)]">
                      {p.price_inr.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 font-mono text-[var(--text-secondary)]">
                      {p.stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
