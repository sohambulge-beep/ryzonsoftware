import { useStore } from '@/store';
import { fmtMoney, todayStr } from '@/utils';

export function OwnerDashboardView() {
  const { db, navigate } = useStore();
  const today = todayStr();

  // Today's Sales
  const todayInvoices = db.invoices.filter(i => (i.timestamp || '').startsWith(today));
  const todaySales = todayInvoices.reduce((s, i) => s + i.total, 0);
  const todayPints = todayInvoices.reduce((s, i) => s + i.items.reduce((sum, item) => sum + item.qty, 0), 0);

  // Total Expenses
  const totalExpenses = db.expenses.reduce((s, e) => s + e.amount, 0);

  // Total Profit (all-time: revenue - COGS - expenses)
  const totalRevenue = db.invoices.reduce((s, i) => s + i.total, 0);
  let totalCogs = 0;
  db.invoices.forEach(inv => inv.items.forEach(item => { totalCogs += item.costTotal; }));
  const totalProfit = totalRevenue - totalCogs - totalExpenses;

  // Pending Payments
  const pendingPayments = db.customers.reduce((s, c) => s + c.currentBalance, 0);
  const pendingCustomers = db.customers.filter(c => c.currentBalance > 0).length;

  // Current Stock Summary
  const totalStockLiters = db.taps.reduce((s, t) => s + t.currentLiters, 0);
  const totalCapacityLiters = db.taps.reduce((s, t) => s + t.capacityLiters, 0);
  const stockPct = totalCapacityLiters > 0 ? Math.round((totalStockLiters / totalCapacityLiters) * 100) : 0;
  const stockPints = Math.floor(totalStockLiters / 0.5);
  const stockValue = db.taps.reduce((s, t) => s + t.currentLiters * t.costPerLiter, 0);
  const lowStockTaps = db.taps.filter(t => t.currentLiters < 10);

  const cards = [
    {
      label: "Today's Sales",
      value: fmtMoney(todaySales),
      icon: 'fa-solid fa-coins',
      iconBg: 'bg-amber-500/10 border border-amber-500/30',
      iconColor: 'text-amber-400',
      valueClass: 'text-amber-400',
      details: [
        `${todayInvoices.length} invoices today`,
        `${todayPints} pints poured`,
      ],
    },
    {
      label: 'Total Profit',
      value: fmtMoney(totalProfit),
      icon: 'fa-solid fa-chart-line',
      iconBg: 'bg-emerald-500/10 border border-emerald-500/30',
      iconColor: 'text-emerald-400',
      valueClass: totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400',
      details: [
        `Revenue: ${fmtMoney(totalRevenue)}`,
        `COGS: ${fmtMoney(totalCogs)}`,
      ],
    },
    {
      label: 'Total Expenses',
      value: fmtMoney(totalExpenses),
      icon: 'fa-solid fa-money-bill-wave',
      iconBg: 'bg-red-500/10 border border-red-500/30',
      iconColor: 'text-red-400',
      valueClass: 'text-red-400',
      details: [
        `${db.expenses.length} expense records`,
        `Categories: ${new Set(db.expenses.map(e => e.category)).size}`,
      ],
    },
    {
      label: 'Pending Payments',
      value: fmtMoney(pendingPayments),
      icon: 'fa-solid fa-hand-holding-dollar',
      iconBg: 'bg-cyan-500/10 border border-cyan-500/30',
      iconColor: 'text-cyan-400',
      valueClass: 'text-cyan-400',
      details: [
        `${pendingCustomers} customer${pendingCustomers === 1 ? '' : 's'} with tabs`,
        pendingPayments > 0 ? 'Action required' : 'All settled',
      ],
    },
    {
      label: 'Current Stock',
      value: `${totalStockLiters.toFixed(1)} L`,
      icon: 'fa-solid fa-boxes-stacked',
      iconBg: 'bg-indigo-500/10 border border-indigo-500/30',
      iconColor: 'text-indigo-400',
      valueClass: 'text-indigo-400',
      details: [
        `${stockPints} pints available`,
        `Stock value: ${fmtMoney(stockValue)}`,
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-amber-950/30 border border-zinc-800 rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-zinc-950 shadow-lg shadow-amber-500/20">
            <i className="fa-solid fa-store text-xl" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Owner Dashboard</h2>
            <p className="text-xs text-zinc-400">One-glance business summary for {db.settings.barName}</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(card => (
          <div
            key={card.label}
            className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 transition-all hover:border-zinc-700 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                <i className={`${card.icon} ${card.iconColor} text-lg`} />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{card.label}</span>
            </div>
            <div>
              <div className={`text-3xl font-bold font-mono ${card.valueClass}`}>{card.value}</div>
            </div>
            <div className="pt-2 border-t border-zinc-800/60 space-y-1">
              {card.details.map((d, i) => (
                <div key={i} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-zinc-600" />
                  {d}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Stock fill card — visual bar */}
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 transition-all hover:border-zinc-700 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
              <i className="fa-solid fa-gauge text-violet-400 text-lg" />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Keg Fill Level</span>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono text-white">{stockPct}%</div>
            <div className="text-xs text-zinc-500 mt-0.5">{totalStockLiters.toFixed(1)} / {totalCapacityLiters.toFixed(1)} L total capacity</div>
          </div>
          <div className="pt-2 border-t border-zinc-800/60">
            <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-700 ${stockPct < 25 ? 'bg-red-500' : stockPct < 50 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ width: `${stockPct}%` }}
              />
            </div>
            {lowStockTaps.length > 0 ? (
              <div className="text-[11px] text-red-400 mt-2 flex items-center gap-1.5">
                <i className="fa-solid fa-triangle-exclamation" />
                {lowStockTaps.length} tap{lowStockTaps.length === 1 ? '' : 's'} running low
              </div>
            ) : (
              <div className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-check" />
                All taps well stocked
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <i className="fa-solid fa-bolt text-amber-400" /> Quick Actions
        </h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('pos')} className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg py-2 px-4 text-xs flex items-center gap-2 transition">
            <i className="fa-solid fa-cash-register text-amber-400" /> Open POS
          </button>
          <button onClick={() => navigate('inventory')} className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg py-2 px-4 text-xs flex items-center gap-2 transition">
            <i className="fa-solid fa-boxes-stacked text-indigo-400" /> Check Inventory
          </button>
          <button onClick={() => navigate('profitloss')} className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg py-2 px-4 text-xs flex items-center gap-2 transition">
            <i className="fa-solid fa-chart-line text-cyan-400" /> View P&L
          </button>
          <button onClick={() => navigate('payments')} className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg py-2 px-4 text-xs flex items-center gap-2 transition">
            <i className="fa-solid fa-hand-holding-dollar text-emerald-400" /> Collect Tabs
          </button>
          <button onClick={() => navigate('reports')} className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg py-2 px-4 text-xs flex items-center gap-2 transition">
            <i className="fa-solid fa-clipboard-list text-indigo-400" /> Generate Reports
          </button>
        </div>
      </div>
    </div>
  );
}
