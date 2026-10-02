import { useStore } from '@/store';
import type { ViewId } from '@/types';
import { AlertBell } from '@/components/AlertBell';
import { usePlan } from '@/lib/plan';
import { AccountMenu } from '@/components/AccountMenu';

const TITLES: Record<ViewId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard Overview', subtitle: 'Real-time business performance and craft tap line tracker' },
  owner: { title: 'Owner Dashboard', subtitle: 'One-glance business summary for the bar owner' },
  insights: { title: 'Business Insights & Analytics', subtitle: 'Automatic product performance, sales trends, and top customers' },
  pos: { title: 'Point of Sale (Tap Register)', subtitle: 'Tap to pour, manage tickets, cash out or add to customer tab' },
  billing: { title: 'Invoices & Sales Ledger', subtitle: 'Full transaction record with invoice printing and receipt generation' },
  gst: { title: 'GST & e-Invoice Ready', subtitle: 'Tax invoices, CGST/SGST/IGST breakdown and e-Invoice Ready status' },
  customers: { title: 'Customer Directory & Tabs', subtitle: 'Patron balances, credit limits, and purchase histories' },
  expenses: { title: 'Bar Operating Expenses', subtitle: 'Log maintenance, CO2, utilities, and venue expenditures' },
  inventory: { title: 'Stock & Keg Line Management', subtitle: 'Live keg levels, draft calibration and pour monitoring' },
    tableskot: { title: 'Tables & KOT', subtitle: 'Table-wise orders, KOT printing and bill settlement for dine-in' },
    excise: { title: 'Excise', subtitle: 'Licence details and brand register' },
  suppliers: { title: 'Suppliers & Purchases', subtitle: 'Record keg purchases with automatic inventory restock and cost tracking' },
  payments: { title: 'Customer Payments & Credit Ledger', subtitle: 'Record tab payments, track balances, and inspect transaction logs' },
  profitloss: { title: 'Profit & Loss Statement', subtitle: 'Gross margin, product cost (COGS), operating expenses and net profit' },
  reports: { title: 'Business Reports & Analytics', subtitle: 'Sales, profit, expense, and stock reports with daily/monthly filters' },
  settings: { title: 'Settings', subtitle: 'Manage your subscription plan and feature access' },
  staff: { title: 'Staff Management', subtitle: 'Profiles, attendance, shift roster, salary, approvals and activity log' },
  backup: { title: 'Backup & Restore', subtitle: 'Export or restore complete TapTrack database and JSON configuration' },
};

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { currentView, navigate, openModal } = useStore();
  const { hasFeature } = usePlan();
  const info = TITLES[currentView];

  return (
    <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-6 bg-zinc-950/80 md:backdrop-blur z-10 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button className="md:hidden text-zinc-300 p-2.5 hover:bg-zinc-800 rounded-lg" onClick={onMenuClick}>
          <i className="fa-solid fa-bars text-lg" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base md:text-lg font-bold text-white truncate">{info.title}</h1>
          <p className="text-xs text-zinc-400 truncate hidden sm:block">{info.subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
        {hasFeature('alerts') && <AlertBell />}
        <button
          onClick={() => navigate('pos')}
          className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-3 text-xs md:text-sm hover:brightness-110 transition flex items-center gap-2"
        >
          <i className="fa-solid fa-plus" />
          <span className="hidden sm:inline">Quick Pour / Sale</span>
        </button>
        <button
          onClick={() => openModal('payment')}
          className="bg-zinc-800 border border-zinc-700 text-emerald-400 border-emerald-900/50 hover:bg-emerald-950/30 font-medium rounded-lg py-2 px-3 text-xs md:text-sm transition flex items-center gap-2"
        >
          <i className="fa-solid fa-hand-holding-dollar" />
          <span className="hidden sm:inline">Collect Tab</span>
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
