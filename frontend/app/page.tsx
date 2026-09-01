"use client";

import { useState } from "react";
import { AuditTrailProvider } from "@/hooks/useAuditTrail";
import AuditTrail from "@/components/AuditTrail";
import CatalogUploader from "@/components/CatalogUploader";
import FailureTrigger from "@/components/FailureTrigger";
import NegotiationPanel from "@/components/NegotiationPanel";
import PolicyDashboard from "@/components/PolicyDashboard";
import SessionForm from "@/components/SessionForm";
import SessionHistorySelector from "@/components/SessionHistorySelector";
import type { Product } from "@/lib/types";

export default function Home() {
  const [catalogFile, setCatalogFile] = useState("catalog_demo_1.csv");
  const [products, setProducts] = useState<Product[]>([]);

  return (
    <AuditTrailProvider>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 sm:p-6">
        <header>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Agent Commerce Adapter
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Live view of the buyer agent, merchant negotiation, policy guard, and payments.
          </p>
        </header>

        <SessionForm catalogFile={catalogFile} />

        <SessionHistorySelector />

        <div className="grid h-[70vh] min-h-[520px] flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
            <CatalogUploader
              value={catalogFile}
              onChange={setCatalogFile}
              onProductsChange={setProducts}
            />
            <FailureTrigger products={products} />
            <PolicyDashboard />
            <div className="min-h-[280px] flex-1">
              <NegotiationPanel />
            </div>
          </div>
          <div className="min-h-0">
            <AuditTrail />
          </div>
        </div>
      </div>
    </AuditTrailProvider>
  );
}
