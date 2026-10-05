import { useStore } from '@/store';
import type { ViewId } from '@/types';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { usePlan, type FeatureId } from '@/lib/plan';
import { useRole, filterItemsForRole } from '@/components/RoleGuard';

const NAV_ITEMS: {
  section: string;
  items: { id: ViewId; label: string; icon: string; iconClass?: string; badge?: string }[];
}[] = [
  {
    section: 'Core Management',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high' },
      { id: 'pos', label: 'Point of Sale', icon: 'fa-solid fa-cash-register', iconClass: 'text-amber-400' },
      { id: 'billing', label: 'Invoices & Sales', icon: 'fa-solid fa-receipt' },
      { id: 'gst', label: 'GST & e-Invoice', icon: 'fa-solid fa-file-invoice', iconClass: 'text-emerald-400' },
      { id: 'customers', label: 'Customers & Tabs', icon: 'fa-solid fa-users' },
      { id: 'expenses', label: 'Expenses', icon: 'fa-solid fa-money-bill-wave' },
      { id: 'inventory', label: 'Stock & Kegs', icon: 'fa-solid fa-boxes-stacked' },
      { id: 'tableskot', label: 'Tables & KOT', icon: 'fa-solid fa-chair', iconClass: 'text-amber-400' },
      { id: 'excise', label: 'Excise', icon: 'fa-solid fa-wine-bottle', iconClass: 'text-amber-400' },
      { id: 'bank', label: 'Bank', icon: 'fa-solid fa-building-columns', iconClass: 'text-emerald-400' },
      { id: 'export', label: 'Export', icon: 'fa-solid fa-file-export', iconClass: 'text-cyan-400' },
      { id: 'staff', label: 'Staff', icon: 'fa-solid fa-user-tie', iconClass: 'text-amber-400' },
    ],
  },
  {
    section: 'Business Tracker',
    items: [
      { id: 'owner', label: 'Owner Dashboard', icon: 'fa-solid fa-store', iconClass: 'text-amber-300' },
      { id: 'insights', label: 'Business Insights', icon: 'fa-solid fa-lightbulb', iconClass: 'text-amber-400' },
      { id: 'suppliers', label: 'Suppliers & Purchases', icon: 'fa-solid fa-truck', iconClass: 'text-amber-400' },
      { id: 'payments', label: 'Customer Payments', icon: 'fa-solid fa-hand-holding-dollar', iconClass: 'text-emerald-400' },
      { id: 'profitloss', label: 'Profit & Loss', icon: 'fa-solid fa-chart-line', iconClass: 'text-cyan-400' },
      { id: 'reports', label: 'Reports & Analytics', icon: 'fa-solid fa-clipboard-list', iconClass: 'text-indigo-400' },
      { id: 'backup', label: 'Backup & Restore', icon: 'fa-solid fa-database', iconClass: 'text-rose-400' },
    ],
  },
];

const VIEW_FEATURE: Partial<Record<ViewId, FeatureId>> = {
  expenses: 'expenses',
  profitloss: 'profit',
  insights: 'insights',
};

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, currentView, navigate } = useStore();
  const { hasFeature, plan } = usePlan();
  const { role, permissions, loading: roleLoading } = useRole();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const update = () => {
      setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const totalExpenses = db.expenses.reduce((s, e) => s + e.amount, 0);
  const totalDue = db.customers.reduce((s, c) => s + c.currentBalance, 0);
  const lowStock = db.taps.filter(t => t.currentLiters < 10).length;

  const badges: Partial<Record<ViewId, string>> = {
    pos: 'Live',
    billing: String(db.invoices.length),
    customers: String(db.customers.length),
    expenses: `₹${Math.round(totalExpenses)}`,
    inventory: `${lowStock} Taps`,
    payments: `₹${Math.round(totalDue)}`,
  };

  return (
    <>
      {open && <button type="button" aria-label="Close menu" className="fixed inset-0 w-full h-full bg-black/60 z-40 md:hidden cursor-default" onClick={onClose} />}
      <aside
        className={`w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col z-50 flex-shrink-0 fixed md:static top-0 bottom-0 transition-transform duration-300 ${
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-zinc-800/80 flex items-center justify-between">
          <button type="button" className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('dashboard')}>
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20 text-zinc-950 font-bold">
              <i className="fa-solid fa-beer-mug-empty text-xl" />
            </div>
            <div>
              <div className="flex items-center leading-none">
                <span className="font-display text-2xl font-bold tracking-tight text-amber-400">TAP</span>
                <span className="font-display text-2xl font-bold tracking-tight text-white">TRACK</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">Bar OS & Tracker</span>
            </div>
          </button>
          <button className="md:hidden text-zinc-400 hover:text-white p-2" onClick={onClose}>
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>

        {/* Navigation */}
        <div className="px-3 py-4 flex-1 overflow-y-auto scrollbar-thin space-y-5">
          {NAV_ITEMS.map(group => (
            <div key={group.section}>
              <div
                className={`text-[11px] font-mono uppercase tracking-wider px-3 mb-2 font-semibold ${
                  group.section === 'Business Tracker' ? 'text-amber-400/90 flex items-center gap-1.5' : 'text-zinc-500'
                }`}
              >
                {group.section === 'Business Tracker' && <i className="fa-solid fa-bolt text-[10px]" />}
                {group.section}
              </div>
              <nav className="space-y-1">
                {(roleLoading ? group.items : filterItemsForRole(group.items, role, permissions)).filter(item => {
                  const feature = VIEW_FEATURE[item.id];
                  return !feature || hasFeature(feature);
                }).map(item => {
                  const feature = VIEW_FEATURE[item.id];
                  return (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.id); onClose();
                    }}
                    type="button"
                    className={`nav-link w-full flex items-center gap-x-3 px-3.5 py-3.5 rounded-lg text-sm cursor-pointer transition-colors duration-150 touch-manipulation text-left ${
                      currentView === item.id
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800'
                    }`}
                  >
                    <i className={`${item.icon} w-5 text-center ${currentView === item.id ? 'text-zinc-950' : item.iconClass ?? 'text-zinc-400'}`} />
                    <span className="flex-1">{item.label}</span>
                    {item.id === 'pos' && (
                      <span className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        currentView === item.id ? 'bg-zinc-900/30 text-zinc-900' : 'bg-amber-500/20 text-amber-400'
                      }`}>Live</span>
                    )}
                    {badges[item.id] && item.id !== 'pos' && (
                      <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        item.id === 'expenses' ? 'bg-red-950/80 border border-red-900/40 text-red-300' :
                        item.id === 'inventory' ? 'bg-amber-500/20 text-amber-300' :
                        item.id === 'payments' ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400' :
                        'bg-zinc-800 text-zinc-300'
                      }`}>{badges[item.id]}</span>
                    )}
                  </button>
                  );
                })}
              </nav>
            </div>
          ))}

          {/* Pricing Link */}
          <div className="mt-5">
            <div className="text-[11px] font-mono uppercase tracking-wider px-3 mb-2 font-semibold text-zinc-500">
              Account
            </div>
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => { navigate('settings'); onClose(); }}
                className={`nav-link w-full flex items-center gap-x-3 px-3.5 py-3.5 rounded-lg text-sm cursor-pointer transition-colors duration-150 touch-manipulation text-left ${
                  currentView === 'settings' ? 'bg-amber-500 text-zinc-950 font-semibold' : 'text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800'
                }`}
              >
                <i className={`fa-solid fa-gear w-5 text-center ${currentView === 'settings' ? 'text-zinc-950' : 'text-zinc-400'}`} />
                <span className="flex-1">Settings & Plan</span>
              </button>
              <Link
                to="/pricing"
                className="nav-link w-full flex items-center gap-x-3 px-3.5 py-3.5 rounded-lg text-sm cursor-pointer transition-colors duration-150 touch-manipulation text-left text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800"
              >
                <i className="fa-solid fa-tag w-5 text-center text-amber-400" />
                <span className="flex-1">Pricing</span>
              </Link>
            </nav>
          </div>
        </div>

        {/* System Status */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Taphouse Mode
            </span>
            <span className="font-mono text-amber-400 text-[11px]">{clock}</span>
          </div>
          <div className="text-[11px] text-zinc-500 truncate">TapTrack v2.4 &bull; {plan === 'premium' ? 'All Modules Active' : `${plan === 'pro' ? 'Pro' : 'Basic'} Plan Active`}</div>
        </div>
      </aside>
    </>
  );
}
