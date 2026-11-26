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
  no_sales: 'There is no sales data yet, so break-even cannot be worked out.',
  few_days: 'There is less than 7 days of data, so this estimate is not reliable yet. It will be more accurate after a few more days.',
  no_expenses: 'No expenses have been added yet, so break-even shows 0. Add rent, electricity and salaries in the Expenses screen (use Auto expenses).',
  low_cost: 'The beer cost (cost per litre) is almost 0, so the margin looks too high. Please check the beer cost in Stock & Kegs.',
  low_margin: 'The margin on beer is very low, so break-even cannot be worked out. Please check the beer price or cost.',
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
          <i className="fa-solid fa-scale-balanced text-amber-400" /> Break-even: sales needed
        </h3>
        <span className="text-[10px] font-mono text-zinc-500">{`Based on the last ${r.windowDays} days`}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-700/70 p-3">
          <div className="text-[10px] font-mono uppercase text-zinc-400">Daily running cost (estimate)</div>
          <div className="font-mono text-lg font-bold text-red-400 mt-1">{fmtMoney(r.fixedPerDay)}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Rent, salaries, electricity etc.</div>
        </div>
        <div className="rounded-lg border border-zinc-700/70 p-3">
          <div className="text-[10px] font-mono uppercase text-zinc-400">Margin on beer</div>
          <div className="font-mono text-lg font-bold text-emerald-400 mt-1">
            {r.margin === null ? '-' : `${(r.margin * 100).toFixed(1)}%`}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Sales minus beer cost</div>
        </div>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="text-[10px] font-mono uppercase text-amber-300">Break-even sales (daily)</div>
          <div className="font-mono text-lg font-bold text-amber-300 mt-1">{hasBE ? fmtMoney(r.breakEvenDaily as number) : '-'}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Selling less than this means a loss</div>
        </div>
      </div>

      {hasBE && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Today's sales</span>
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
              <span className="text-emerald-300">{`Today's costs are covered. Profit so far is about ${fmtMoney(r.todayProfit ?? 0)}.`}</span>
            ) : (
              <span className="text-zinc-400">
                {`${fmtMoney((r.breakEvenDaily as number) - r.soldToday)} more is needed to cover today's costs.`}
              </span>
            )}
          </div>
        </div>
      )}

      {r.month.breakEven !== null && r.month.breakEven > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">{`${r.month.label} break-even`}</span>
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
              ? "This month's costs are covered."
              : `About ${fmtMoney(r.month.needPerDay ?? 0)} needed per day for the remaining ${r.month.remainingDays} days.`}
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
        This is an estimate. All expenses are counted, so one-time large expenses (such as machinery) can make the break-even look higher.
      </p>
    </div>
  );
}
