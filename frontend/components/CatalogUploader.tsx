"use client";

import { useEffect, useState } from "react";
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
}

export default function CatalogUploader({
  value,
  onChange,
  onProductsChange,
}: CatalogUploaderProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState(value);

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

  const extension = value.split(".").pop()?.toLowerCase() ?? "";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Merchant Catalog
        </h2>
        {status === "done" && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            parsed from .{extension}
          </span>
        )}
      </div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {CATALOG_FILES.map(({ file, label }) => (
          <option key={file} value={file}>
            {label} — {file}
          </option>
        ))}
      </select>

      {status === "loading" && (
        <p className="text-sm text-zinc-400">Translating catalog…</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {status === "done" && (
        <>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            {products.length} item{products.length === 1 ? "" : "s"} normalized
            to the standard schema — same shape regardless of the source
            file&apos;s columns.
          </p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">
                    ID
                  </th>
                  <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">
                    Name
                  </th>
                  <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">
                    ₹
                  </th>
                  <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.product_id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-2 py-1 font-mono text-zinc-700 dark:text-zinc-300">
                      {p.product_id}
                    </td>
                    <td className="px-2 py-1 text-zinc-800 dark:text-zinc-200">
                      {p.name}
                    </td>
                    <td className="px-2 py-1 font-mono text-zinc-700 dark:text-zinc-300">
                      {p.price_inr.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 font-mono text-zinc-700 dark:text-zinc-300">
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
