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
import CashClosingView from "@/components/CashClosingView";
import UdhaarReminderView from "@/components/UdhaarReminderView";
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
  { id: "cashclose", label: "Cash closing" },
  { id: "udhaar", label: "Udhaar reminder" },
  { id: "counter", label: "Liquor counter" },
  { id: "order", label: "Order on WhatsApp" },
  { id: "account", label: "My account" },
  { id: "cloud", label: "Cloud backup" },
  { id: "posreport", label: "POS report" },
] as const;

const ADMIN_TABS = [
  { id: "admin", label: "Admin" },
  { id: "custdata", label: "Customer data" },
] as const;

type TabId = (typeof TABS)[number]["id"] | (typeof ADMIN_TABS)[number]["id"];

const ALL_TABS: readonly { id: TabId; label: string }[] = [...TABS, ...ADMIN_TABS];
const ALL_IDS: TabId[] = ALL_TABS.map((t) => t.id);

const RECENT_KEY = "pt_excise_recent_tabs";
const HIDDEN_KEY = "pt_excise_hidden_tabs";
const MAX_RECENT = 30;

const isAdminTab = (id: TabId) => id === "admin" || id === "custdata";
const labelOf = (id: TabId) => ALL_TABS.find((t) => t.id === id)?.label ?? id;

// Reads a saved list of tab ids and drops anything unknown or repeated.
function readIds(key: string): TabId[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: TabId[] = [];
    for (const x of parsed) {
      if (typeof x === "string" && !seen.has(x) && (ALL_IDS as string[]).includes(x)) {
        seen.add(x);
        out.push(x as TabId);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function saveIds(key: string, ids: TabId[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // storage can be blocked; the order just will not be remembered
  }
}

// Recently used tabs first (latest first), then all the other tabs in their normal order.
function orderFrom(recent: TabId[]): TabId[] {
  return [...recent, ...ALL_IDS.filter((id) => !recent.includes(id))];
}

export default function ExciseTabsView() {
  const [tab, setTab] = useState<TabId>("brands");
  const [order, setOrder] = useState<TabId[]>(ALL_IDS);
  const [hidden, setHidden] = useState<TabId[]>([]);
  const [editing, setEditing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Saved order and hidden tabs are read only after the page has opened (keeps server and browser the same).
  useEffect(() => {
    const recent = readIds(RECENT_KEY);
    if (recent.length > 0) {
      setOrder(orderFrom(recent));
      const first = recent.find((id) => !isAdminTab(id));
      if (first) setTab(first);
    }
    setHidden(readIds(HIDDEN_KEY));
  }, []);

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

  // Keeps the active tab in view in the scrolling bar.
  useEffect(() => {
    try {
      document.getElementById(`excise-tab-${tab}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
    } catch {
      // ignore
    }
  }, [tab, order]);

  // The saved order is not changed on screen now, only remembered for the next visit,
  // so the buttons do not move under the finger.
  function pick(id: TabId) {
    setTab(id);
    saveIds(RECENT_KEY, [id, ...readIds(RECENT_KEY).filter((x) => x !== id)].slice(0, MAX_RECENT));
  }

  function toggleHidden(id: TabId) {
    setHidden((prev) => {
      const available = ALL_TABS.filter((t) => isAdmin || !isAdminTab(t.id)).map((t) => t.id);
      let next: TabId[];
      if (prev.includes(id)) {
        next = prev.filter((x) => x !== id);
      } else {
        next = [...prev, id];
        const stillShown = available.filter((x) => !next.includes(x));
        if (stillShown.length === 0) return prev; // at least one tab must stay
      }
      saveIds(HIDDEN_KEY, next);
      return next;
    });
  }

  function resetTabs() {
    try {
      localStorage.removeItem(RECENT_KEY);
      localStorage.removeItem(HIDDEN_KEY);
    } catch {
      // ignore
    }
    setOrder(ALL_IDS);
    setHidden([]);
  }

  const shown = order.filter((id) => {
    if (isAdminTab(id) && !isAdmin) return false;
    if (hidden.includes(id) && id !== tab) return false;
    return true;
  });

  const customizable = ALL_TABS.filter((t) => isAdmin || !isAdminTab(t.id));

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {shown.map((id) => (
          <button
            key={id}
            id={`excise-tab-${id}`}
            type="button"
            onClick={() => pick(id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              tab === id ? "bg-amber-500 text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {labelOf(id)}
          </button>
        ))}
      </div>

      <div className="flex gap-4 text-xs text-zinc-400">
        <button type="button" className="underline" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Customize tabs"}
        </button>
        <button type="button" className="underline" onClick={resetTabs}>
          Reset tabs
        </button>
      </div>

      {editing && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs space-y-2">
          <p className="text-zinc-400">Tick the tabs you want to see. Untick the ones you do not use.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {customizable.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-zinc-200">
                <input type="checkbox" checked={!hidden.includes(t.id)} onChange={() => toggleHidden(t.id)} />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      )}

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
      {tab === "cashclose" && <CashClosingView />}
      {tab === "udhaar" && <UdhaarReminderView />}
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
