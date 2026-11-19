import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';
import { normalizePhone } from '@/lib/whatsapp';
import {
  COVER_OPTIONS,
  DEFAULT_SETTINGS,
  LEAD_OPTIONS,
  WINDOW_OPTIONS,
  buildSupplierOrders,
  computePlan,
  readSettings,
  saveSettings,
  type PlannerSettings,
  type Urgency,
} from '@/lib/reorderPlanner';

const BADGE: Record<Urgency, { text: string; cls: string }> = {
  urgent: { text: 'Abhi order karo', cls: 'bg-red-950/80 border border-red-800/60 text-red-300' },
  soon: { text: 'Jaldi order karo', cls: 'bg-amber-950/70 border border-amber-700/60 text-amber-300' },
  ok: { text: 'Stock theek', cls: 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-300' },
  nosales: { text: 'Bikri nahi', cls: 'bg-zinc-800 border border-zinc-700 text-zinc-400' },
};

const fmtDate = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });

export function SmartReorderPanel() {
  const { db, openModal } = useStore();
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState('');

  // The saved choice is read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setSettings(readSettings());
  }, []);

  const change = (patch: Partial<PlannerSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const plan = useMemo(
    () => computePlan(db.taps, db.invoices, db.suppliers, settings),
    [db.taps, db.invoices, db.suppliers, settings]
  );
  const orders = useMemo(() => buildSupplierOrders(plan.rows, db.settings?.barName ?? ''), [plan.rows, db.settings?.barName]);

  if (db.taps.length === 0) return null;

  const urgent = plan.rows.filter(r => r.urgency === 'urgent').length;
  const soon = plan.rows.filter(r => r.urgency === 'soon').length;
  const spend = plan.rows.reduce((s, r) => s + r.cost, 0);
  const shown = showAll ? plan.rows : plan.rows.filter(r => r.urgency === 'urgent' || r.urgency === 'soon');

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };

  const select = 'bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500';

  return (
    <div className="pt-glass pt-panel bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-wand-magic-sparkles text-amber-400" />
          <h2 className="text-sm font-bold text-white">Smart Reorder: kya order karna hai</h2>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">Pichle {plan.activeDays} din ki bikri se andaaza</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <label className="space-y-1">
          <span className="text-zinc-400">Bikri ka data</span>
          <select className={`${select} w-full`} value={settings.windowDays} onChange={e => change({ windowDays: Number(e.target.value) })}>
            {WINDOW_OPTIONS.map(n => <option key={n} value={n}>Pichle {n} din</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-400">Kitne din ka stock chahiye</span>
          <select className={`${select} w-full`} value={settings.coverDays} onChange={e => change({ coverDays: Number(e.target.value) })}>
            {COVER_OPTIONS.map(n => <option key={n} value={n}>{n} din</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-400">Supplier kitne din mein deta hai</span>
          <select className={`${select} w-full`} value={settings.leadDays} onChange={e => change({ leadDays: Number(e.target.value) })}>
            {LEAD_OPTIONS.map(n => <option key={n} value={n}>{n} din</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 ${BADGE.urgent.cls}`}>Abhi order: {urgent}</span>
        <span className={`rounded-full px-3 py-1 ${BADGE.soon.cls}`}>Jaldi order: {soon}</span>
        <span className="rounded-full px-3 py-1 bg-zinc-800 border border-zinc-700 text-zinc-200">
          Andaaza kharcha: <strong className="font-mono">{fmtMoney(spend)}</strong>
        </span>
      </div>

      {!plan.hasSales && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-xs text-zinc-300">
          Abhi bikri ka data nahi hai, isliye sahi andaaza nahi ban sakta. Kuch din bills banne ke baad ye apne aap kaam karega.
          Tab tak jin kegs mein bilkul litre nahi bache wahi "Abhi order karo" mein dikhenge.
        </div>
      )}

      <div className="space-y-2">
        {shown.length === 0 && (
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3 text-xs text-emerald-200">
            Abhi kisi keg ko order ki zaroorat nahi hai.
          </div>
        )}
        {shown.map(r => (
          <div key={r.tap.id} className="rounded-lg border border-zinc-700/70 p-3 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-sm text-white">
                #{r.tap.tapNumber} {r.tap.name}
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${BADGE[r.urgency].cls}`}>{BADGE[r.urgency].text}</span>
            </div>
            <div className="text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>Bacha: <strong className="text-zinc-200 font-mono">{(Number(r.tap.currentLiters) || 0).toFixed(1)} L</strong></span>
              <span>Roz ka use: <strong className="text-zinc-200 font-mono">{r.perDay} L</strong></span>
              {r.daysLeft !== null && r.runOut && (
                <span>
                  Khatam hoga: <strong className="text-zinc-200">{r.daysLeft} din mein ({fmtDate(r.runOut)})</strong>
                </span>
              )}
            </div>
            {r.kegs > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-amber-300">
                  Order karo: <strong className="font-mono">{r.kegs} keg</strong> ({r.kegL} L each) • andaaza{' '}
                  <strong className="font-mono">{fmtMoney(r.cost)}</strong>
                  {r.supplierName ? ` • ${r.supplierName}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => openModal('purchase', r.tap.id)}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg py-1.5 px-3 text-xs hover:brightness-110 transition"
                >
                  Keg kharidi darj karo
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {orders.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400/80">Supplier ko bhejne ka message</div>
          {orders.map(o => {
            const phone = normalizePhone(o.phone);
            return (
              <div key={o.key} className="rounded-lg border border-zinc-700/70 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{o.supplierName || 'Supplier set nahi hai'}</span>
                  <span className="font-mono text-zinc-300">{fmtMoney(o.cost)}</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-zinc-300">{o.message}</pre>
                <div className="flex flex-wrap gap-2">
                  {phone && (
                    <a
                      href={`https://wa.me/${phone}?text=${encodeURIComponent(o.message)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"
                    >
                      WhatsApp pe bhejo
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => copy(o.key, o.message)}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-zinc-200"
                  >
                    {copied === o.key ? 'Copy ho gaya' : 'Message copy karo'}
                  </button>
                </div>
                {!phone && <div className="text-zinc-500">Is supplier ka phone number Suppliers screen mein daalo, tab WhatsApp button aayega.</div>}
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={() => setShowAll(v => !v)} className="text-xs text-amber-400 hover:underline">
        {showAll ? 'Sirf order wale taps dikhao' : 'Saare taps dikhao'}
      </button>
    </div>
  );
}
