import { useState } from "react";
import ExciseView from "@/views/ExciseView";
import ExciseTpView from "@/views/ExciseTpView";
import ExciseSalesView from "@/views/ExciseSalesView";
import ExciseBrandsManageView from "@/views/ExciseBrandsManageView";
import ExciseFlr4View from "@/views/ExciseFlr4View";
import ExciseRegisterView from "@/views/ExciseRegisterView";
import ExciseValueView from "@/views/ExciseValueView";
import ExciseOpeningStockView from "@/views/ExciseOpeningStockView";
import ExciseLowStockView from "@/views/ExciseLowStockView";
import ExciseBulkSalesView from "@/views/ExciseBulkSalesView";
import ExciseStockCheckView from "@/views/ExciseStockCheckView";
import ExciseForecastView from "@/views/ExciseForecastView";
import ExciseSalesReportView from "@/views/ExciseSalesReportView";
import ExciseHealthCheckView from "@/views/ExciseHealthCheckView";
import ExciseSummaryView from "@/views/ExciseSummaryView";

const TABS = [
  { id: "brands", label: "Brands & settings" },
  { id: "tp", label: "TP receipts" },
  { id: "sales", label: "Daily sales" },
  { id: "prices", label: "Brand prices" },
  { id: "return", label: "Monthly return" },
  { id: "register", label: "Stock register" },
  { id: "value", label: "Stock value" },
  { id: "opening", label: "Opening stock" },
  { id: "lowstock", label: "Low stock" },
  { id: "bulk", label: "Bulk sales" },
  { id: "stockcheck", label: "Stock check" },
  { id: "forecast", label: "Stock forecast" },
  { id: "report", label: "Sales report" },
  { id: "health", label: "Health check" },
  { id: "summary", label: "WhatsApp summary" },
] as const;

export default function ExciseTabsView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("brands");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              tab === t.id ? "bg-amber-500 text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "brands" && <ExciseView />}
      {tab === "tp" && <ExciseTpView />}
      {tab === "sales" && <ExciseSalesView />}
      {tab === "prices" && <ExciseBrandsManageView />}
      {tab === "return" && <ExciseFlr4View />}
      {tab === "register" && <ExciseRegisterView />}
      {tab === "value" && <ExciseValueView />}
      {tab === "opening" && <ExciseOpeningStockView />}
      {tab === "lowstock" && <ExciseLowStockView />}
      {tab === "bulk" && <ExciseBulkSalesView />}
      {tab === "stockcheck" && <ExciseStockCheckView />}
      {tab === "forecast" && <ExciseForecastView />}
      {tab === "report" && <ExciseSalesReportView />}
      {tab === "health" && <ExciseHealthCheckView />}
      {tab === "summary" && <ExciseSummaryView />}
    </div>
  );
}
