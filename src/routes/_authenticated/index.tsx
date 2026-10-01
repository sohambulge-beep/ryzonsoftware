import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { StoreProvider, useStore } from "@/store";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { IntroAnimation } from "@/components/IntroAnimation";
import { AIAssistant } from "@/components/AIAssistant";
import { DashboardView } from "@/views/DashboardView";
import { PosView } from "@/views/PosView";
import { BillingView } from "@/views/BillingView";
import { CustomersView } from "@/views/CustomersView";
import { ExpensesView } from "@/views/ExpensesView";
import { InventoryView } from "@/views/InventoryView";
import { SuppliersView } from "@/views/SuppliersView";
import { PaymentsView } from "@/views/PaymentsView";
import { ProfitLossView } from "@/views/ProfitLossView";
import { ReportsView } from "@/views/ReportsView";
import { BackupView } from "@/views/BackupView";
import { OwnerDashboardView } from "@/views/OwnerDashboardView";
import { InsightsView } from "@/views/InsightsView";
import { SettingsView } from "@/views/SettingsView";
import { StaffView } from "@/views/StaffView";
import { GstView } from "@/views/GstView";
import { TablesKotView } from "@/views/TablesKotView";
import { PlanProvider, usePlan, UpgradeDialog, LockedFeature, type FeatureId } from "@/lib/plan";
import { CustomerModal } from "@/modals/CustomerModal";
import { BeerModal } from "@/modals/BeerModal";
import { SupplierModal } from "@/modals/SupplierModal";
import { PaymentModal } from "@/modals/PaymentModal";
import { ExpenseModal } from "@/modals/ExpenseModal";
import { PurchaseModal } from "@/modals/PurchaseModal";
import { InvoiceViewModal } from "@/modals/InvoiceViewModal";
import { GstInvoiceSync } from "@/components/gst/GstInvoiceSync";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "TapTrack • Beer Bar POS, Billing & Business Tracker" },
      {
        name: "description",
        content:
          "TapTrack runs your beer bar: POS, GST billing, keg inventory, customers, expenses, payments, profit & loss and insights in one dashboard.",
      },
      { property: "og:title", content: "TapTrack • Beer Bar POS, Billing & Business Tracker" },
      {
        property: "og:description",
        content:
          "POS, GST invoices, keg inventory, customer tabs, expenses and profit tracking for your beer bar — all in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const VIEW_FEATURE: Partial<Record<string, FeatureId>> = {
  expenses: "expenses",
  profitloss: "profit",
  insights: "insights",
};

function AppContent() {
  const { currentView, navigate } = useStore();
  const { hasFeature } = usePlan();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const feature = VIEW_FEATURE[currentView];
    if (feature && !hasFeature(feature)) navigate('dashboard');
  }, [currentView, hasFeature, navigate]);

  const views: Record<string, React.ReactNode> = {
    dashboard: <DashboardView />,
    pos: <PosView />,
    billing: <BillingView />,
    customers: <CustomersView />,
    expenses: <ExpensesView />,
    inventory: <InventoryView />,
    suppliers: <SuppliersView />,
    payments: <PaymentsView />,
    profitloss: <ProfitLossView />,
    reports: <ReportsView />,
    backup: <BackupView />,
    owner: <OwnerDashboardView />,
    insights: <InsightsView />,
    settings: <SettingsView />,
    staff: <StaffView />,
    gst: <GstView />,
        tableskot: <TablesKotView />,
  };

  const gate = VIEW_FEATURE[currentView];
  const content = gate && !hasFeature(gate) ? <LockedFeature feature={gate} /> : views[currentView];

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-200">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden relative z-0 isolate">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6 overscroll-contain">
          {content}
        </main>
      </div>

      <CustomerModal />
      <BeerModal />
      <SupplierModal />
      <PaymentModal />
      <ExpenseModal />
      <PurchaseModal />
      <InvoiceViewModal />
      <AIAssistant />
      <UpgradeDialog />
      <GstInvoiceSync />
    </div>
  );
}

function Index() {
  const [mounted, setMounted] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (!sessionStorage.getItem("introPlayed")) {
        setShowIntro(true);
      }
    } catch {
      setShowIntro(true);
    }
  }, []);

  const handleIntroFinish = () => {
    try {
      sessionStorage.setItem("introPlayed", "1");
    } catch {
      /* noop */
    }
    setShowIntro(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-zinc-950" />;
  }

  return (
    <PlanProvider>
    <StoreProvider>
      {showIntro && <IntroAnimation onFinish={handleIntroFinish} />}
      <AppContent />
    </StoreProvider>
    </PlanProvider>
  );
}
