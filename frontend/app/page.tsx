"use client";

import { useState } from "react";
import { AuditTrailProvider } from "@/hooks/useAuditTrail";
import AuditTrail from "@/components/AuditTrail";
import CatalogUploader from "@/components/CatalogUploader";
import ComplianceCard from "@/components/ComplianceCard";
import FailureTrigger from "@/components/FailureTrigger";
import MerchantRevenuePanel from "@/components/MerchantRevenuePanel";
import NegotiationPanel from "@/components/NegotiationPanel";
import PolicyDashboard from "@/components/PolicyDashboard";
import SessionForm from "@/components/SessionForm";
import SessionHistorySelector from "@/components/SessionHistorySelector";
import type { Product } from "@/lib/types";

type View = "buyer" | "merchant";
type MerchantSubView = "summary" | "advanced";

export default function Home() {
  const [catalogFile, setCatalogFile] = useState("catalog_demo_1.csv");
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<View>("buyer");
  const [merchantSubView, setMerchantSubView] =
    useState<MerchantSubView>("summary");

  return (
    <AuditTrailProvider>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Agent Commerce Adapter
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Live view of the buyer agent, merchant negotiation, policy guard,
              and payments.
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Perspective"
            className="inline-flex shrink-0 rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "buyer"}
              onClick={() => setView("buyer")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === "buyer"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              Buyer View
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "merchant"}
              onClick={() => setView("merchant")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === "merchant"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              Merchant View
            </button>
          </div>
        </header>

        {/* Both views stay mounted at all times and are only hidden with
            CSS on the inactive one — conditionally unmounting SessionForm
            (or anything else with local state) on every tab switch would
            wipe that state, e.g. the in-progress goal/budget fields. */}
        <div hidden={view !== "buyer"}>
          <div className="flex flex-col gap-4">
            <SessionForm catalogFile={catalogFile} />

            <SessionHistorySelector />

            <div className="grid h-[70vh] min-h-[520px] flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
                <CatalogUploader
                  value={catalogFile}
                  onChange={setCatalogFile}
                  onProductsChange={setProducts}
                  variant="buyer"
                />
                <PolicyDashboard variant="buyer" />
                <div className="min-h-[280px] flex-1">
                  <NegotiationPanel />
                </div>
              </div>
              <div className="min-h-0">
                <AuditTrail variant="buyer" />
              </div>
            </div>
          </div>
        </div>

        {/* Merchant View defaults to a clean revenue/health summary — a
            merchant checking in day-to-day wants "am I making money, is
            anything broken," not a full technical log. The full
            governance/control detail (catalog, failure injector, policy
            rules, compliance, raw audit trail) still exists, just moved
            behind this secondary Summary/Advanced tab so it stays reachable
            for a merchant or judge who wants to verify how the system works
            under the hood. Both sub-views stay mounted (hidden via CSS, not
            unmounted) for the same reason as the Buyer/Merchant split above
            — switching tabs must not reset anything's state. */}
        <div hidden={view !== "merchant"}>
          <div className="flex flex-col gap-4">
            <div
              role="tablist"
              aria-label="Merchant View detail level"
              className="inline-flex w-fit shrink-0 rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <button
                type="button"
                role="tab"
                aria-selected={merchantSubView === "summary"}
                onClick={() => setMerchantSubView("summary")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  merchantSubView === "summary"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                Summary
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={merchantSubView === "advanced"}
                onClick={() => setMerchantSubView("advanced")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  merchantSubView === "advanced"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                Advanced
              </button>
            </div>

            <div hidden={merchantSubView !== "summary"}>
              <MerchantRevenuePanel />
            </div>

            <div hidden={merchantSubView !== "advanced"}>
              <div className="grid h-[70vh] min-h-[520px] flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
                <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
                  <CatalogUploader
                    value={catalogFile}
                    onChange={setCatalogFile}
                    onProductsChange={setProducts}
                  />
                  <FailureTrigger products={products} />
                  <PolicyDashboard />
                  <ComplianceCard />
                </div>
                <div className="min-h-0">
                  <AuditTrail />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuditTrailProvider>
  );
}
