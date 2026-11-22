import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';
import { useRole } from '@/components/RoleGuard';
import {
  DEFAULT_SETTINGS,
  cleanSettings,
  computeTarget,
  readSettings,
  saveSettings,
  type TargetSettings,
} from '@/lib/salesTarget';

const inputClass = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500';
const labelClass = 'block text-[10px] uppercase tracking-wider text-zinc-400 mb-1 font-semibold font-mono';

export function SalesTargetCard() {
  const { db } = useStore();
  const { role } = useRole();
  const isOwner = role === 'owner';

  const [settings, setSettings] = useState<TargetSettings>(DEFAULT_SETTINGS);
  const [editing, setEditing] = useState(false);
  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');
  const [startHour, setStartHour] = useState(5);
  const [now, setNow] = useState(() => new Date());

  // Read after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setSettings(readSettings());
  }, []);

  // The estimate follows the clock.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const r = useMemo(() => computeTarget(db.invoices, settings, now), [db.invoices, settings, now]);

  const openEdit = () => {
    setDaily(settings.daily ? String(settings.daily) : '');
    setMonthly(settings.monthly ? String(settings.monthly) : '');
    setStartHour(settings.dayStartHour);
    setEditing(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const next = cleanSettings({ daily, monthly, dayStartHour: startHour });
    setSettings(next);
    saveSettings(next);
    setEditing(false);
  };

  const hit = r.dailyTarget > 0 && r.soldToday >= r.dailyTarget;
  const ringPct = Math.min(100, r.pct);
  const C = 2 * Math.PI * 42;
  const ringColor = hit ? '#34d399' : r.pct >= 60 ? '#fbbf24' : '#f59e0b';

  return (
    <div className="pt-glass pt-panel bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-bullseye text-amber-400" />
          <h2 className="text-sm font-bold text-white">Aaj ka target</h2>
          {r.streak > 0 && (
            <span className="text-[10px] font-mono rounded-full px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-300">
              Lagataar {r.streak} din
            </span>
          )}
        </div>
        {isOwner && !editing && (
          <button type="button" onClick={openEdit} className="text-xs text-amber-400 hover:underline">
            {r.dailyTarget > 0 ? 'Target badlo' : 'Target set karo'}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="rounded-lg border border-zinc-700/70 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Roz ka target (₹)</label>
              <input type="number" min={0} step={1} value={daily} onChange={e => setDaily(e.target.value)} className={inputClass} placeholder="e.g. 25000" />
            </div>
            <div>
              <label className={labelClass}>Mahine ka target (₹, optional)</label>
              <input type="number" min={0} step={1} value={monthly} onChange={e => setMonthly(e.target.value)} className={inputClass} placeholder="khali = roz x din" />
            </div>
            <div>
              <label className={labelClass}>Din kab shuru hota hai</label>
              <select value={startHour} onChange={e => setStartHour(Number(e.target.value))} className={inputClass}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                  <option key={h} value={h}>{h === 0 ? 'Raat 12 baje' : `Subah ${h} baje`}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Jaise bar raat 1 baje band hota hai toh "Subah 5 baje" rakho, taaki raat 12 ke baad ki bikri usi din mein jude.
            Ye target sirf is phone pe yaad rehta hai.
          </p>
          <div className="flex gap-2">
            <button type="submit" className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-xs">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg py-2 px-4 text-xs">Cancel</button>
          </div>
        </form>
      )}

      {r.dailyTarget <= 0 ? (
        <div className="text-xs text-zinc-400">
          {isOwner
            ? 'Roz ka sales target set karo, phir yahan dikhega aaj kitna ho gaya aur kitna baaki hai.'
            : 'Is phone pe abhi sales target set nahi hai.'}
          <div className="mt-1 font-mono text-zinc-300">Aaj ki bikri: {fmtMoney(r.soldToday)}</div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0" style={{ width: 104, height: 104 }}>
            <svg viewBox="0 0 100 100" width="104" height="104" className="-rotate-90" style={{ overflow: 'visible' }}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={ringColor}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${(ringPct / 100) * C} ${C}`}
                style={{ filter: `drop-shadow(0 0 6px ${ringColor})`, transition: 'stroke-dasharray .6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-lg font-bold text-white">{Math.round(r.pct)}%</span>
              <span className="text-[9px] font-mono uppercase text-zinc-400">{hit ? 'pura' : 'ho gaya'}</span>
            </div>
          </div>
          <div className="min-w-0 space-y-1 text-xs">
            <div className="font-mono text-base font-bold text-amber-300">
              {fmtMoney(r.soldToday)} <span className="text-zinc-500 text-xs font-normal">/ {fmtMoney(r.dailyTarget)}</span>
            </div>
            {hit ? (
              <div className="text-emerald-300 font-semibold">Aaj ka target pura ho gaya 🎉</div>
            ) : (
              <div className="text-zinc-300">Baaki: <strong className="font-mono text-white">{fmtMoney(r.remaining)}</strong></div>
            )}
            {r.projected !== null && !hit && (
              <div className="text-zinc-400">
                Is raftaar se din ke end tak lagbhag <strong className="font-mono text-zinc-200">{fmtMoney(r.projected)}</strong>
                {r.projected >= r.dailyTarget ? ' (target pura hoga)' : ' (target se kam)'}
              </div>
            )}
          </div>
        </div>
      )}

      {r.month.target > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">{r.month.label} ka target</span>
            <span className="font-mono text-zinc-200">
              {fmtMoney(r.month.sold)} / {fmtMoney(r.month.target)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, r.month.pct)}%`,
                background: r.month.pct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#a855f7,#f59e0b)',
              }}
            />
          </div>
          <div className="text-[11px] text-zinc-500">
            {r.month.pct >= 100
              ? 'Mahine ka target pura ho gaya.'
              : `Baaki ${r.month.remainingDays} din mein roz lagbhag ${fmtMoney(r.month.neededPerDay)} chahiye.`}
            {r.month.onTrack !== null && r.month.pct < 100 && (r.month.onTrack ? ' Raftaar theek hai.' : ' Raftaar thodi dheemi hai.')}
          </div>
        </div>
      )}
    </div>
  );
}
