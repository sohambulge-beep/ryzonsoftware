import { useState } from 'react';
import { useStore } from '@/store';
import { fmtMoney, todayStr, monthStr } from '@/utils';

export function ProfitLossView() {
  const { db } = useStore();
  const [filter, setFilter] = useState('all');

  const today = todayStr();
  const month = monthStr();

  let invoices = db.invoices;
  let expenses = db.expenses;

  if (filter === 'today') {
    invoices = invoices.filter(i => (i.timestamp || '').startsWith(today));
    expenses = expenses.filter(e => (e.date || '').startsWith(today));
  } else if (filter === 'month') {
    invoices = invoices.filter(i => (i.timestamp || '').startsWith(month));
    expenses = expenses.filter(e => (e.date || '').startsWith(month));
  }

  const revenue = invoices.reduce((s, i) => s + i.total, 0);
  let cogs = 0;
  invoices.forEach(inv => inv.items.forEach(item => { cogs += item.costTotal; }));
  const grossProfit = revenue - cogs;
  const grossMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : '0';
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - totalExpenses;
  const netMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0';

  const catTotals: Record<string, number> = {};
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });

  const cards = [
    { label: '1. Total Revenue', value: fmtMoney(revenue), class: 'text-amber-400', sub: 'Gross sales from all orders' },
    { label: '2. Cost of Goods (COGS)', value: fmtMoney(cogs), class: 'text-orange-400', sub: 'Keg & beer pour base costs' },
    { label: '3. Gross Profit', value: fmtMoney(grossProfit), class: 'text-emerald-400', sub: <>Gross Margin: <span className="text-emerald-400 font-mono">{grossMargin}%</span></> },
    { label: '4. Net Profit', value: fmtMoney(netProfit), class: 'text-cyan-400', sub: <>Net Margin: <span className="text-cyan-400 font-mono">{netMargin}%</span></> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-chart-line text-cyan-400" /> Profit & Loss Financial Statement
          </h2>
          <p className="text-xs text-zinc-400">Real-time product cost (COGS), gross margin, operating expenses and net profit</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-36">
          <option value="all">All-Time</option>
          <option value="today">Today</option>
          <option value="month">This Month</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">{c.label}</div>
            <div className={`text-2xl font-bold mt-1 font-mono ${c.class}`}>{c.value}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-2 flex items-center justify-between">
            <span>Income & COGS Statement</span>
            <span className="text-xs font-mono text-zinc-500">Summary</span>
          </h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
              <span className="text-zinc-300 font-medium">Gross Beer & Tap Sales</span>
              <span className="font-mono text-zinc-100">{fmtMoney(revenue)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-zinc-800/60 text-red-300">
              <span>Less: Cost of Goods Sold (Keg Purchase Costs)</span>
              <span className="font-mono">-{fmtMoney(cogs)}</span>
            </div>
            <div className="flex justify-between py-2 font-bold bg-zinc-800/40 px-3 rounded text-emerald-400">
              <span>= Total Gross Profit</span>
              <span className="font-mono text-sm">{fmtMoney(grossProfit)}</span>
            </div>
            <div className="pt-2">
              <div className="text-zinc-400 font-medium mb-1 uppercase font-mono text-[10px]">Operating Expenses Breakdown</div>
              <div className="space-y-1 pl-2">
                {Object.keys(catTotals).length === 0 ? (
                  <div className="text-zinc-500 text-[11px]">No operational expenses in selected period.</div>
                ) : Object.entries(catTotals).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between text-zinc-400 text-[11px]">
                    <span>&bull; {cat}</span>
                    <span className="font-mono">{fmtMoney(amt)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between py-1.5 border-t border-zinc-800/80 text-red-300">
              <span className="font-medium">Total Operating Expenses</span>
              <span className="font-mono">-{fmtMoney(totalExpenses)}</span>
            </div>
            <div className="flex justify-between py-3 font-bold bg-zinc-800/90 border border-zinc-700/80 px-3 rounded text-white text-sm">
              <span>= Net Operating Profit (EBITDA)</span>
              <span className="font-mono text-cyan-400 text-base">{fmtMoney(netProfit)}</span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-2 flex items-center justify-between">
            <span>Beer Tap Profitability Analysis</span>
            <span className="text-xs font-mono text-amber-400">Margin / Pint</span>
          </h3>
          <div className="overflow-x-auto max-h-80 overflow-y-auto scrollbar-thin">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-400 font-mono text-[10px] uppercase border-b border-zinc-800">
                <tr>
                  <th className="pb-2">Beer Style</th>
                  <th className="pb-2 text-right">Cost/Pt</th>
                  <th className="pb-2 text-right">Sell/Pt</th>
                  <th className="pb-2 text-right">Profit/Pt</th>
                  <th className="pb-2 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {db.taps.map(t => {
                  const costPerPint = t.costPerLiter * 0.5;
                  const profitPerPint = t.pricePerPint - costPerPint;
                  const margin = ((profitPerPint / t.pricePerPint) * 100).toFixed(1);
                  return (
                    <tr key={t.id} className="hover:bg-zinc-800/40">
                      <td className="py-2 text-zinc-200 font-medium">
                        <div className="font-bold text-white">{t.name}</div>
                        <div className="text-[10px] text-zinc-500">Tap #{t.tapNumber} &bull; {t.style}</div>
                      </td>
                      <td className="py-2 text-right font-mono text-zinc-400">{fmtMoney(costPerPint)}</td>
                      <td className="py-2 text-right font-mono text-zinc-200">{fmtMoney(t.pricePerPint)}</td>
                      <td className="py-2 text-right font-mono font-bold text-emerald-400">+{fmtMoney(profitPerPint)}</td>
                      <td className="py-2 text-right font-mono font-bold text-cyan-400">{margin}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
