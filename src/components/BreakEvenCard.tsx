import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';
import { computeBreakEven, type Warning } from '@/lib/breakEven';

// The business day starts at the hour chosen in the Sales Target card (5 am if it was never set).
function readStartHour(): number {
  try {
    const raw = localStorage.getItem('pt_sales_target');
    const h = Math.floor(Number(raw ? JSON.parse(raw).dayStartHour : NaN));
    return Number.isFinite(h) && h >= 0 && h <= 8 ? h : 5;
  } catch {
    return 5;
  }
}

const WARNING_TEXT: Record<Warning, string> = {
  no_sales: 'Abhi bikri ka data nahi hai, isliye break-even nahi nikal sakta.',
  few_days: 'Abhi 7 din se kam ka data hai, isliye andaaza pakka nahi hai. Kuch din baad zyada sahi hoga.',
  no_expenses: 'Kharche abhi daale hi nahi hain, isliye break-even 0 dikh raha hai. Rent, bijli, salary Expenses screen mein daalo (Auto kharche use karo).',
  low_cost: 'Beer ka cost (cost per litre) lagbhag 0 hai, isliye margin bahut zyada dikh raha hai. Stock & Kegs mein beer ka cost check karo.',
  low_margin: 'Beer pe margin bahut kam hai, isliye break-even nikalna mumkin nahi. Beer ka daam ya cost check karo.',
};

export function BreakEvenCard() {
  const { db } = useStore();
  const [startHour, setStartHour] = useState(5);
  const [now, setNow] = useState(() => new Date());

  // Read after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setStartHour(readStartHour());
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const r = useMemo(() => computeBreakEven(db.invoices, db.expenses, now, startHour), [db.invoices, db.expenses, now, startHour]);

  const hasBE = r.breakEvenDaily !== null && r.breakEvenDaily > 0;
  const crossed = hasBE && r.soldToday >= (r.breakEvenDaily as number);
  const pct = r.todayPct === null ? 0 : Math.min(100, r.todayPct);

  return (
    <div className="pt-glass pt-panel bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <i className="fa-solid fa-scale-balanced text-amber-400" /> Break-even: kitni bikri chahiye
        </h3>
        <span className="text-[10px] font-mono text-zinc-500">Pichle {r.windowDays} din ke hisaab se</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-700/70 p-3">
          <div className="text-[10px] font-mono uppercase text-zinc-400">Roz ka kharcha (andaaza)</div>
          <div className="font-mono text-lg font-bold text-red-400 mt-1">{fmtMoney(r.fixedPerDay)}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Rent, salary, bijli aadi</div>
        </div>
        <div className="rounded-lg border border-zinc-700/70 p-3">
          <div className="text-[10px] font-mono uppercase text-zinc-400">Beer pe margin</div>
          <div className="font-mono text-lg font-bold text-emerald-400 mt-1">
            {r.margin === null ? '-' : `${(r.margin * 100).toFixed(1)}%`}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Bikri minus beer ka cost</div>
        </div>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="text-[10px] font-mono uppercase text-amber-300">Break-even bikri (roz)</div>
          <div className="font-mono text-lg font-bold text-amber-300 mt-1">{hasBE ? fmtMoney(r.breakEvenDaily as number) : '-'}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Isse kam bika toh nuksan</div>
        </div>
      </div>

      {hasBE && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Aaj ki bikri</span>
            <span className="font-mono text-zinc-200">
              {fmtMoney(r.soldToday)} / {fmtMoney(r.breakEvenDaily as number)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: crossed ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f59e0b)',
              }}
            />
          </div>
          <div className="text-[11px]">
            {crossed ? (
              <span className="text-emerald-300">Aaj kharcha nikal gaya. Abhi tak lagbhag {fmtMoney(r.todayProfit ?? 0)} ka nafa.</span>
            ) : (
              <span className="text-zinc-400">
                Kharcha nikalne ke liye aur <strong className="font-mono text-zinc-200">{fmtMoney((r.breakEvenDaily as number) - r.soldToday)}</strong> chahiye.
              </span>
            )}
          </div>
        </div>
      )}

      {r.month.breakEven !== null && r.month.breakEven > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">{r.month.label} ka break-even</span>
            <span className="font-mono text-zinc-200">
              {fmtMoney(r.month.sold)} / {fmtMoney(r.month.breakEven)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, r.month.pct ?? 0)}%`,
                background: (r.month.pct ?? 0) >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#a855f7,#f59e0b)',
              }}
            />
          </div>
          <div className="text-[11px] text-zinc-500">
            {(r.month.pct ?? 0) >= 100
              ? 'Is mahine ka kharcha nikal gaya.'
              : `Baaki ${r.month.remainingDays} din mein roz lagbhag ${fmtMoney(r.month.needPerDay ?? 0)} chahiye.`}
          </div>
        </div>
      )}

      {r.warnings.length > 0 && (
        <div className="space-y-1">
          {r.warnings.map(w => (
            <div key={w} className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-2.5 text-[11px] text-amber-200">
              {WARNING_TEXT[w]}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-500">
        Ye andaaza hai. Isme saare kharche gine jaate hain, toh ek-baar ke bade kharche (jaise machine) break-even ko bada dikha sakte hain.
      </p>
    </div>
  );
}
