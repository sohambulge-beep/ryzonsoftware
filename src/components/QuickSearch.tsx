import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store';
import { usePlan, type FeatureId } from '@/lib/plan';
import { useRole, filterItemsForRole } from '@/components/RoleGuard';
import { fmtMoney } from '@/utils';

interface Hit {
  key: string;
  group: string;
  title: string;
  sub?: string;
  icon: string;
  run: () => void;
  extra?: { label: string; run: () => void };
}

interface Entry {
  id: string; // same id the sidebar uses, so the role rules are the same
  label: string;
  icon: string;
  words: string;
}

const SCREENS: Entry[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high', words: 'home overview' },
  { id: 'pos', label: 'Point of Sale', icon: 'fa-cash-register', words: 'sale bill billing pour register new' },
  { id: 'billing', label: 'Invoices & Sales', icon: 'fa-receipt', words: 'bills invoice ledger receipt print' },
  { id: 'returns', label: 'Sales Returns', icon: 'fa-rotate-left', words: 'refund credit note return wapas' },
  { id: 'gst', label: 'GST & e-Invoice', icon: 'fa-file-invoice', words: 'tax gst einvoice' },
  { id: 'customers', label: 'Customers & Tabs', icon: 'fa-users', words: 'customer tab udhaar patron' },
  { id: 'expenses', label: 'Expenses', icon: 'fa-money-bill-wave', words: 'kharcha expense cost' },
  { id: 'inventory', label: 'Stock & Kegs', icon: 'fa-boxes-stacked', words: 'stock keg tap beer litres' },
  { id: 'stockaudit', label: 'Stock Audit', icon: 'fa-clipboard-check', words: 'count variance shortage check' },
  { id: 'tableskot', label: 'Tables & KOT', icon: 'fa-chair', words: 'table kot dine order' },
  { id: 'excise', label: 'Excise', icon: 'fa-wine-bottle', words: 'excise licence tp register' },
  { id: 'bank', label: 'Bank', icon: 'fa-building-columns', words: 'bank statement transfer' },
  { id: 'export', label: 'Export', icon: 'fa-file-export', words: 'csv download data' },
  { id: 'activity', label: 'Activity log', icon: 'fa-clock-rotate-left', words: 'history log audit changes' },
  { id: 'staff', label: 'Staff', icon: 'fa-user-tie', words: 'employee salary attendance shift' },
  { id: 'owner', label: 'Owner Dashboard', icon: 'fa-store', words: 'owner summary' },
  { id: 'insights', label: 'Business Insights', icon: 'fa-lightbulb', words: 'analytics trends top selling' },
  { id: 'suppliers', label: 'Suppliers & Purchases', icon: 'fa-truck', words: 'supplier purchase buy keg' },
  { id: 'payments', label: 'Customer Payments', icon: 'fa-hand-holding-dollar', words: 'payment collect tab ledger' },
  { id: 'profitloss', label: 'Profit & Loss', icon: 'fa-chart-line', words: 'profit loss margin cogs' },
  { id: 'reports', label: 'Reports & Analytics', icon: 'fa-clipboard-list', words: 'report analytics monthly' },
  { id: 'backup', label: 'Backup & Restore', icon: 'fa-database', words: 'backup restore data' },
  { id: 'settings', label: 'Settings & Plan', icon: 'fa-gear', words: 'settings plan subscription tax bar name' },
];

// Same names as the tabs inside the Excise page.
const EXCISE_TABS: [string, string][] = [
  ['brands', 'Brands & settings'], ['brandimport', 'Import brands'], ['tp', 'TP receipts'],
  ['sales', 'Daily sales'], ['prices', 'Brand prices'], ['return', 'Monthly return'],
  ['bulklitre', 'Bulk litre'], ['register', 'Stock register'], ['value', 'Stock value'],
  ['opening', 'Opening stock'], ['lowstock', 'Low stock'], ['bulk', 'Bulk sales'],
  ['stockcheck', 'Stock check'], ['forecast', 'Stock forecast'], ['wastage', 'Wastage log'],
  ['report', 'Sales report'], ['billdesk', 'Bill desk'], ['alerts', 'Bill alerts'],
  ['activity', 'Activity log'], ['itemprofit', 'Item profit'], ['rush', 'Rush hours'],
  ['health', 'Health check'], ['summary', 'WhatsApp summary'], ['dayclose', 'Day close'],
  ['cashclose', 'Cash closing'], ['udhaar', 'Udhaar reminder'], ['payables', 'Bills to pay'],
  ['club', 'Customer club'], ['bookings', 'Bookings'], ['counter', 'Liquor counter'],
  ['takings', 'Counter takings'], ['order', 'Order on WhatsApp'], ['account', 'My account'],
  ['help', 'Help'], ['setupcheck', 'Setup check'], ['offlinequeue', 'Offline queue'],
  ['merge', 'Two-phone merge'], ['syncreview', 'Sync review'], ['cloud', 'Cloud backup'],
  ['posreport', 'POS report'],
];
const STAFF_EXCISE = ['sales', 'tp', 'counter', 'billdesk', 'lowstock', 'stockcheck', 'wastage', 'bookings', 'udhaar', 'order', 'help', 'offlinequeue'];
const EXCISE_RECENT_KEY = 'pt_excise_recent_tabs';

const FEATURE_OF: Record<string, FeatureId> = {
  expenses: 'expenses',
  profitloss: 'profit',
  insights: 'insights',
};

const norm = (s: string) => s.toLowerCase();
const matches = (hay: string, tokens: string[]) => tokens.every(t => hay.includes(t));

export function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, currentView, navigate, openModal } = useStore();
  const { hasFeature } = usePlan();
  const { role, permissions, loading: roleLoading } = useRole();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const allowed = (id: string) => {
    if (roleLoading) return true;
    if (filterItemsForRole([{ id }], role, permissions).length === 0) return false;
    const f = FEATURE_OF[id];
    return !f || hasFeature(f);
  };

  function openExciseTab(tabId: string) {
    try {
      const raw = localStorage.getItem(EXCISE_RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const rest = Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string' && x !== tabId) : [];
      localStorage.setItem(EXCISE_RECENT_KEY, JSON.stringify([tabId, ...rest].slice(0, 30)));
    } catch {
      // storage can be blocked; the Excise page then opens on its usual tab
    }
    if (currentView === 'excise') {
      // The Excise page reads the saved tab only when it opens, so open it fresh.
      navigate('dashboard');
      window.setTimeout(() => navigate('excise'), 80);
    } else {
      navigate('excise');
    }
  }

  const hits = useMemo<Hit[]>(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    const has = tokens.length > 0;
    const out: Hit[] = [];

    const actions: (Hit & { gate: string })[] = [
      { gate: 'pos', key: 'a-sale', group: 'Quick actions', title: 'New sale', sub: 'Open the billing screen', icon: 'fa-cash-register', run: () => navigate('pos') },
      { gate: 'expenses', key: 'a-exp', group: 'Quick actions', title: 'Add expense', icon: 'fa-money-bill-wave', run: () => openModal('expense') },
      { gate: 'payments', key: 'a-pay', group: 'Quick actions', title: 'Collect tab payment', icon: 'fa-hand-holding-dollar', run: () => openModal('payment') },
      { gate: 'customers', key: 'a-cust', group: 'Quick actions', title: 'Add customer', icon: 'fa-user-plus', run: () => openModal('customer') },
      { gate: 'inventory', key: 'a-beer', group: 'Quick actions', title: 'Add beer / tap', icon: 'fa-beer-mug-empty', run: () => openModal('beer') },
      { gate: 'suppliers', key: 'a-buy', group: 'Quick actions', title: 'Record keg purchase', icon: 'fa-truck', run: () => openModal('purchase') },
      { gate: 'returns', key: 'a-ret', group: 'Quick actions', title: 'Take back items (return)', icon: 'fa-rotate-left', run: () => navigate('returns') },
    ];
    for (const a of actions) {
      if (!allowed(a.gate)) continue;
      if (has && !matches(norm(`${a.title} ${a.sub ?? ''}`), tokens)) continue;
      const { gate: _g, ...hit } = a;
      out.push(hit);
    }

    const screens = SCREENS.filter(s => allowed(s.id) && (!has || matches(norm(`${s.label} ${s.words}`), tokens)));
    for (const s of screens.slice(0, has ? 8 : 6)) {
      out.push({ key: `s-${s.id}`, group: 'Go to', title: s.label, icon: s.icon, run: () => navigate(s.id as never) });
    }

    if (has) {
      if (allowed('excise')) {
        const ownerAll = roleLoading || role === 'owner';
        const tabs = EXCISE_TABS.filter(([id, label]) => (ownerAll || STAFF_EXCISE.includes(id)) && matches(norm(`excise ${label}`), tokens));
        for (const [id, label] of tabs.slice(0, 6)) {
          out.push({ key: `x-${id}`, group: 'Excise tabs', title: label, sub: 'Excise', icon: 'fa-wine-bottle', run: () => openExciseTab(id) });
        }
      }
      if (allowed('customers')) {
        let n = 0;
        for (const c of db.customers) {
          if (n >= 5) break;
          if (!matches(norm(`${c.name} ${c.phone}`), tokens)) continue;
          n++;
          out.push({
            key: `c-${c.id}`,
            group: 'Customers',
            title: c.name,
            sub: `${c.phone || 'No phone'} • Due ${fmtMoney(c.currentBalance)}`,
            icon: 'fa-user',
            run: () => openModal('customer', c.id),
            extra: c.currentBalance > 0 && allowed('payments') ? { label: 'Collect', run: () => openModal('payment', c.id) } : undefined,
          });
        }
      }
      if (allowed('billing')) {
        let n = 0;
        for (let i = db.invoices.length - 1; i >= 0 && n < 5; i--) {
          const inv = db.invoices[i];
          if (!matches(norm(`${inv.invoiceNo} ${inv.customerName}`), tokens)) continue;
          n++;
          out.push({
            key: `b-${inv.id}`,
            group: 'Bills',
            title: inv.invoiceNo,
            sub: `${inv.customerName} • ${fmtMoney(inv.total)} • ${inv.status}`,
            icon: 'fa-receipt',
            run: () => openModal('invoiceView', inv.id),
          });
        }
      }
      if (allowed('inventory')) {
        let n = 0;
        for (const t of db.taps) {
          if (n >= 5) break;
          if (!matches(norm(`${t.name} ${t.brewery} ${t.style}`), tokens)) continue;
          n++;
          out.push({
            key: `t-${t.id}`,
            group: 'Beers',
            title: t.name,
            sub: `${(Number(t.currentLiters) || 0).toFixed(1)} L left • ${fmtMoney(t.pricePerPint)} per pint`,
            icon: 'fa-beer-mug-empty',
            run: () => navigate('inventory'),
          });
        }
      }
      if (allowed('suppliers')) {
        let n = 0;
        for (const s of db.suppliers) {
          if (n >= 3) break;
          if (!matches(norm(`${s.name} ${s.phone}`), tokens)) continue;
          n++;
          out.push({ key: `p-${s.id}`, group: 'Suppliers', title: s.name, sub: s.phone, icon: 'fa-truck', run: () => navigate('suppliers') });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, db, currentView, role, permissions, roleLoading]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open || typeof document === 'undefined') return null;

  const choose = (h: Hit) => {
    onClose();
    h.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(hits.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = hits[active];
      if (h) choose(h);
    }
  };

  let lastGroup = '';
  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center px-3 pt-16 sm:pt-24"
      style={{ zIndex: 200, background: 'rgba(3, 1, 12, .72)' }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, rgba(24,12,56,.98), rgba(10,5,28,.98))',
          border: '1px solid rgba(255,255,255,.16)',
          borderRadius: 20,
          boxShadow: '0 30px 80px rgba(0,0,0,.65), 0 0 40px rgba(168,85,247,.18)',
        }}
      >
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,.10)' }}>
          <i className="fa-solid fa-magnifying-glass text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search customers, bills, beers, screens or actions..."
            className="flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-zinc-500"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={onClose} className="text-xs text-zinc-400 px-2 py-1" style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 8 }}>
            Esc
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin p-2">
          {hits.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">Nothing found. Try a name, phone number or bill number.</div>
          )}
          {hits.map((h, i) => {
            const heading = h.group !== lastGroup ? h.group : '';
            lastGroup = h.group;
            const isActive = i === active;
            return (
              <div key={h.key}>
                {heading && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-amber-400/80">{heading}</div>
                )}
                <div
                  ref={isActive ? el => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                  className="flex items-center gap-1 rounded-lg"
                  style={{ background: isActive ? 'rgba(168,85,247,.22)' : 'transparent' }}
                  onMouseEnter={() => setActive(i)}
                >
                  <button type="button" onClick={() => choose(h)} className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 text-left">
                    <i className={`fa-solid ${h.icon} w-5 text-center text-amber-400`} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm text-white">{h.title}</span>
                      {h.sub && <span className="block truncate text-[11px] text-zinc-400">{h.sub}</span>}
                    </span>
                  </button>
                  {h.extra && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        h.extra!.run();
                      }}
                      className="mr-2 rounded-md px-2.5 py-1 text-[11px] font-semibold text-emerald-300"
                      style={{ border: '1px solid rgba(16,185,129,.5)' }}
                    >
                      {h.extra.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2 text-[10px] text-zinc-500" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
          Enter = open • ↑ ↓ = choose • Esc = close • Ctrl+K opens this from anywhere
        </div>
      </div>
    </div>,
    document.body
  );
}
