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
import WastageLogView from "@/components/WastageLogView";
import BookingsView from "@/components/BookingsView";
import BillAlertsView from "@/components/BillAlertsView";
import BillDeskView from "@/components/BillDeskView";
import ActivityLogView from "@/components/ActivityLogView";
import HelpView from "@/components/HelpView";
import SetupCheckView from "@/components/SetupCheckView";
import ItemProfitView from "@/components/ItemProfitView";
import RushHoursView from "@/components/RushHoursView";
import CustomerClubView from "@/components/CustomerClubView";
import CashClosingView from "@/components/CashClosingView";
import UdhaarReminderView from "@/components/UdhaarReminderView";
import PayablesView from "@/components/PayablesView";
import CustomerLoginView from "@/components/CustomerLoginView";
import OfflineQueueView from "@/components/OfflineQueueView";
import EventMergeView from "@/components/EventMergeView";
import SyncReviewView from "@/components/SyncReviewView";
import CloudBackupView from "@/components/CloudBackupView";
import PosReportView from "@/components/PosReportView";
import AdminOverviewView from "@/components/AdminOverviewView";
import AdminPanelView from "@/components/AdminPanelView";
import AdminCustomerDataView from "@/components/AdminCustomerDataView";
import AdminBillsView from "@/components/AdminBillsView";
import AdminStockView from "@/components/AdminStockView";
import { checkIsAdmin } from "@/lib/adminCheck";
import { useOwnerAccess } from "@/lib/ownerAccess";

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
  { id: "wastage", label: "Wastage log" },
  { id: "report", label: "Sales report" },
  { id: "billdesk", label: "Bill desk" },
  { id: "alerts", label: "Bill alerts" },
  { id: "activity", label: "Activity log" },
  { id: "itemprofit", label: "Item profit" },
  { id: "rush", label: "Rush hours" },
  { id: "health", label: "Health check" },
  { id: "summary", label: "WhatsApp summary" },
  { id: "dayclose", label: "Day close" },
  { id: "cashclose", label: "Cash closing" },
  { id: "udhaar", label: "Udhaar reminder" },
  { id: "payables", label: "Bills to pay" },
  { id: "club", label: "Customer club" },
  { id: "bookings", label: "Bookings" },
  { id: "counter", label: "Liquor counter" },
  { id: "order", label: "Order on WhatsApp" },
  { id: "account", label: "My account" },
  { id: "help", label: "Help" },
  { id: "setupcheck", label: "Setup check" },
  { id: "offlinequeue", label: "Offline queue" },
  { id: "merge", label: "Two-phone merge" },
  { id: "syncreview", label: "Sync review" },
  { id: "cloud", label: "Cloud backup" },
  { id: "posreport", label: "POS report" },
] as const;

const ADMIN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "admin", label: "Admin" },
  { id: "custdata", label: "Customer data" },
  { id: "cloudbills", label: "Cloud bills" },
  { id: "cloudstock", label: "Cloud stock" },
] as const;

type TabId = (typeof TABS)[number]["id"] | (typeof ADMIN_TABS)[number]["id"];

const ALL_TABS: readonly { id: TabId; label: string }[] = [...TABS, ...ADMIN_TABS];
const ALL_IDS: TabId[] = ALL_TABS.map((t) => t.id);

// The tabs a staff member (anyone who is not the owner) can see. The owner sees every tab.
const STAFF_TABS: TabId[] = [
  "sales",
  "tp",
  "counter",
  "billdesk",
  "lowstock",
  "stockcheck",
  "wastage",
  "bookings",
  "udhaar",
  "order",
  "help",
  "offlinequeue",
];
const FALLBACK_TAB: TabId = "sales";

const RECENT_KEY = "pt_excise_recent_tabs";
const HIDDEN_KEY = "pt_excise_hidden_tabs";
const MAX_RECENT = 30;

const isAdminTab = (id: TabId) =>
  id === "overview" || id === "admin" || id === "custdata" || id === "cloudbills" || id === "cloudstock";
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
  const { isOwner } = useOwnerAccess();

  // A staff member sees only the staff tabs. The owner sees all tabs.
  const canSee = (id: TabId) => isOwner || STAFF_TABS.includes(id);
  const current: TabId = canSee(tab) ? tab : FALLBACK_TAB;

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
      document.getElementById(`excise-tab-${current}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
    } catch {
      // ignore
    }
  }, [current, order]);

  // The saved order is not changed on screen now, only remembered for the next visit,
  // so the buttons do not move under the finger.
  function pick(id: TabId) {
    setTab(id);
    saveIds(RECENT_KEY, [id, ...readIds(RECENT_KEY).filter((x) => x !== id)].slice(0, MAX_RECENT));
  }

  function toggleHidden(id: TabId) {
    setHidden((prev) => {
      const available = ALL_TABS.filter((t) => canSee(t.id) && (isAdmin || !isAdminTab(t.id))).map((t) => t.id);
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
    if (!canSee(id)) return false;
    if (isAdminTab(id) && !isAdmin) return false;
    if (hidden.includes(id) && id !== current) return false;
    return true;
  });

  const customizable = ALL_TABS.filter((t) => canSee(t.id) && (isAdmin || !isAdminTab(t.id)));

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
              current === id ? "bg-amber-500 text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
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

      {current === "brands" && <ExciseView />}
      {current === "tp" && <ExciseTpView />}
      {current === "sales" && <ExciseSalesView />}
      {current === "prices" && <ExciseBrandsManageView />}
      {current === "return" && <ExciseFlr4View />}
      {current === "bulklitre" && <ExciseBulkLitreView />}
      {current === "register" && <ExciseRegisterView />}
      {current === "value" && <ExciseValueView />}
      {current === "opening" && <ExciseOpeningStockView />}
      {current === "lowstock" && <ExciseLowStockView />}
      {current === "bulk" && <ExciseBulkSalesView />}
      {current === "stockcheck" && <ExciseStockCheckView />}
      {current === "forecast" && <ExciseForecastView />}
      {current === "wastage" && <WastageLogView />}
      {current === "report" && <ExciseSalesReportView />}
      {current === "billdesk" && <BillDeskView />}
      {current === "alerts" && <BillAlertsView />}
      {current === "activity" && <ActivityLogView />}
      {current === "itemprofit" && <ItemProfitView />}
      {current === "rush" && <RushHoursView />}
      {current === "health" && <ExciseHealthCheckView />}
      {current === "summary" && <ExciseSummaryView />}
      {current === "dayclose" && <DayCloseView />}
      {current === "cashclose" && <CashClosingView />}
      {current === "udhaar" && <UdhaarReminderView />}
      {current === "payables" && <PayablesView />}
      {current === "club" && <CustomerClubView />}
      {current === "bookings" && <BookingsView />}
      {current === "counter" && <ExciseCounterView />}
      {current === "order" && <ExciseOrderView />}
      {current === "account" && <CustomerLoginView />}
      {current === "help" && <HelpView />}
      {current === "setupcheck" && <SetupCheckView />}
      {current === "offlinequeue" && <OfflineQueueView />}
      {current === "merge" && <EventMergeView />}
      {current === "syncreview" && <SyncReviewView />}
      {current === "cloud" && <CloudBackupView />}
      {current === "posreport" && <PosReportView />}
      {current === "overview" && isAdmin && <AdminOverviewView />}
      {current === "admin" && isAdmin && <AdminPanelView />}
      {current === "custdata" && isAdmin && <AdminCustomerDataView />}
      {current === "cloudbills" && isAdmin && <AdminBillsView />}
      {current === "cloudstock" && isAdmin && <AdminStockView />}
    </div>
  );
}
