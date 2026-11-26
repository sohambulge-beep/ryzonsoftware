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
  urgent: { text: 'Order now', cls: 'bg-red-950/80 border border-red-800/60 text-red-300' },
  soon: { text: 'Order soon', cls: 'bg-amber-950/70 border border-amber-700/60 text-amber-300' },
  ok: { text: 'Stock is fine', cls: 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-300' },
  nosales: { text: 'No sales', cls: 'bg-zinc-800 border border-zinc-700 text-zinc-400' },
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
          <h2 className="text-sm font-bold text-white">Smart Reorder: what to order</h2>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">{`Estimate from the last ${plan.activeDays} days of sales`}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <label className="space-y-1">
          <span className="text-zinc-400">Sales data</span>
          <select className={`${select} w-full`} value={settings.windowDays} onChange={e => change({ windowDays: Number(e.target.value) })}>
            {WINDOW_OPTIONS.map(n => <option key={n} value={n}>{`Last ${n} days`}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-400">Days of stock wanted</span>
          <select className={`${select} w-full`} value={settings.coverDays} onChange={e => change({ coverDays: Number(e.target.value) })}>
            {COVER_OPTIONS.map(n => <option key={n} value={n}>{`${n} days`}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-400">Supplier delivery time</span>
          <select className={`${select} w-full`} value={settings.leadDays} onChange={e => change({ leadDays: Number(e.target.value) })}>
            {LEAD_OPTIONS.map(n => <option key={n} value={n}>{`${n} days`}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 ${BADGE.urgent.cls}`}>{`Order now: ${urgent}`}</span>
        <span className={`rounded-full px-3 py-1 ${BADGE.soon.cls}`}>{`Order soon: ${soon}`}</span>
        <span className="rounded-full px-3 py-1 bg-zinc-800 border border-zinc-700 text-zinc-200">
          {`Estimated spend: ${fmtMoney(spend)}`}
        </span>
      </div>

      {!plan.hasSales && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-xs text-zinc-300">
          There is no sales data yet, so an accurate estimate is not possible. It will start working automatically after a few days of billing. Until then, only kegs with no litres left are shown as "Order now".
        </div>
      )}

      <div className="space-y-2">
        {shown.length === 0 && (
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3 text-xs text-emerald-200">
            No keg needs to be ordered right now.
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
              <span>{`Left: ${(Number(r.tap.currentLiters) || 0).toFixed(1)} L`}</span>
              <span>{`Daily use: ${r.perDay} L`}</span>
              {r.daysLeft !== null && r.runOut && (
                <span>
                  {`Runs out in ${r.daysLeft} days (${fmtDate(r.runOut)})`}
                </span>
              )}
            </div>
            {r.kegs > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-amber-300">
                  <span>{`Order ${r.kegs} keg(s) (${r.kegL} L each), estimate ${fmtMoney(r.cost)}`}</span>
                  {r.supplierName ? <span>{` • ${r.supplierName}`}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => openModal('purchase', r.tap.id)}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg py-1.5 px-3 text-xs hover:brightness-110 transition"
                >
                  Record keg purchase
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {orders.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400/80">Message to send to the supplier</div>
          {orders.map(o => {
            const phone = normalizePhone(o.phone);
            return (
              <div key={o.key} className="rounded-lg border border-zinc-700/70 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{o.supplierName || 'Supplier not set'}</span>
                  <span className="font-mono text-zinc-300">{fmtMoney(o.cost)}</span>
                </div>
                <pre translate="no" className="whitespace-pre-wrap font-sans text-zinc-300">{o.message}</pre>
                <div className="flex flex-wrap gap-2">
                  {phone && (
                    <a
                      href={`https://wa.me/${phone}?text=${encodeURIComponent(o.message)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"
                    >
                      Send on WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => copy(o.key, o.message)}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-zinc-200"
                  >
                    {copied === o.key ? 'Copied' : 'Copy message'}
                  </button>
                </div>
                {!phone && <div className="text-zinc-500">Add this supplier's phone number in the Suppliers screen to get the WhatsApp button.</div>}
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={() => setShowAll(v => !v)} className="text-xs text-amber-400 hover:underline">
        {showAll ? 'Show only taps to order' : 'Show all taps'}
      </button>
    </div>
  );
}
