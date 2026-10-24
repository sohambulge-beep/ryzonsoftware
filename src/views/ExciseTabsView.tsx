import { useEffect, useState } from "react";
import ExciseView from "@/views/ExciseView";
import ExciseTpView from "@/views/ExciseTpView";
import ExciseSalesView from "@/views/ExciseSalesView";
import ExciseBrandsManageView from "@/views/ExciseBrandsManageView";
import ExciseFlr4View from "@/views/ExciseFlr4View";
import ExciseBulkLitreView from "@/views/ExciseBulkLitreView";
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
import DayCloseView from "@/views/DayCloseView";
import ExciseCounterView from "@/views/ExciseCounterView";
import ExciseOrderView from "@/views/ExciseOrderView";
import CustomerLoginView from "@/components/CustomerLoginView";
import CloudBackupView from "@/components/CloudBackupView";
import PosReportView from "@/components/PosReportView";
import AdminPanelView from "@/components/AdminPanelView";
import AdminCustomerDataView from "@/components/AdminCustomerDataView";
import { checkIsAdmin } from "@/lib/adminCheck";

const TABS = [
  { id: "brands", label: "Brands & settings" },
  { id: "tp", label: "TP receipts" },
  { id: "sales", label: "Daily sales" },
  { id: "prices", label: "Brand prices" },
  { id: "return", label: "Monthly return" },
  { id: "bulklitre", label: "Bulk litre" },
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
  { id: "dayclose", label: "Day close" },
  { id: "counter", label: "Liquor counter" },
  { id: "order", label: "Order on WhatsApp" },
  { id: "account", label: "My account" },
  { id: "cloud", label: "Cloud backup" },
  { id: "posreport", label: "POS report" },
] as const;

type TabId = (typeof TABS)[number]["id"] | "admin" | "custdata";

const ADMIN_TABS = [
  { id: "admin", label: "Admin" },
  { id: "custdata", label: "Customer data" },
] as const;

export default function ExciseTabsView() {
  const [tab, setTab] = useState<TabId>("brands");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    checkIsAdmin()
      .then((ok) => {
        if (alive) setIsAdmin(ok);
      })
      .catch(() => {
        if (alive) setIsAdmin(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visible: readonly { id: TabId; label: string }[] = isAdmin ? [...TABS, ...ADMIN_TABS] : TABS;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {visible.map(t => (
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
      {tab === "bulklitre" && <ExciseBulkLitreView />}
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
      {tab === "dayclose" && <DayCloseView />}
      {tab === "counter" && <ExciseCounterView />}
      {tab === "order" && <ExciseOrderView />}
      {tab === "account" && <CustomerLoginView />}
      {tab === "cloud" && <CloudBackupView />}
      {tab === "posreport" && <PosReportView />}
      {tab === "admin" && isAdmin && <AdminPanelView />}
      {tab === "custdata" && isAdmin && <AdminCustomerDataView />}
    </div>
  );
}
