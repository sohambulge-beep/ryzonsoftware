import { useStore } from '@/store';
import { fmtMoney, fmtTime } from '@/utils';
import { TapCard } from '@/components/TapCard';
import { SalesChart } from '@/components/SalesChart';
import { useAlerts } from '@/hooks/useAlerts';
import { useInsights } from '@/hooks/useInsights';
import type { AlertSeverity } from '@/hooks/useAlerts';
import { usePlan } from '@/lib/plan';

const SEVERITY_STYLES: Record<AlertSeverity, { dot: string; bg: string; border: string; icon: string }> = {
  critical: { dot: 'bg-red-500', bg: 'bg-red-950/40', border: 'border-red-800/50', icon: 'text-red-400' },
  warning: { dot: 'bg-amber-500', bg: 'bg-amber-950/30', border: 'border-amber-800/40', icon: 'text-amber-400' },
  info: { dot: 'bg-sky-500', bg: 'bg-sky-950/30', border: 'border-sky-800/40', icon: 'text-sky-400' },
};

export function DashboardView() {
  const { db, quickPour, navigate } = useStore();
  const alerts = useAlerts(db);
  const insights = useInsights(db);
  const { hasFeature } = usePlan();
  const financialsEnabled = hasFeature('profit');
  const alertsEnabled = hasFeature('alerts');
  const insightsEnabled = hasFeature('insights');

  const totalRev = db.invoices.reduce((s, i) => s + i.total, 0);
  let totalCogs = 0;
  db.invoices.forEach(inv => inv.items.forEach(item => { totalCogs += item.costTotal; }));
  const totalExp = db.expenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = totalRev - totalCogs;
  const netProfit = grossProfit - totalExp;
  const marginPct = totalRev > 0 ? ((netProfit / totalRev) * 100).toFixed(1) : '0';
  const totalDue = db.customers.reduce((s, c) => s + c.currentBalance, 0);
  const customersWithDue = db.customers.filter(c => c.currentBalance > 0).length;

  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
    const daySales = db.invoices.filter(inv => (inv.timestamp || '').startsWith(dateStr)).reduce((s, inv) => s + inv.total, 0);
    const dayExpenses = db.expenses.filter(exp => (exp.date || '').startsWith(dateStr)).reduce((s, exp) => s + exp.amount, 0);
    chartData.push({ label, sales: daySales, expenses: dayExpenses });
  }

  const recent = [...db.invoices].reverse().slice(0, 6);

  const kpis = [
    { label: 'Gross Revenue', value: fmtMoney(totalRev), class: 'text-amber-400', sub: <><i className="fa-solid fa-chart-simple text-amber-400" /> Total from orders & bills</> },
    ...(financialsEnabled ? [
      { label: 'Net Profit', value: fmtMoney(netProfit), class: 'text-emerald-400', sub: <><span className="text-emerald-400 font-mono">{marginPct}%</span> profit margin</> },
      { label: 'Total Expenses', value: fmtMoney(totalExp), class: 'text-red-400', sub: <><span className="text-zinc-400 font-mono">COGS: {fmtMoney(totalCogs)}</span></> },
    ] : []),
    { label: 'Uncollected Tabs / Due', value: fmtMoney(totalDue), class: 'text-amber-300', sub: <><span className="text-amber-400">{customersWithDue} customer{customersWithDue === 1 ? '' : 's'}</span> with balance</> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 relative overflow-hidden">
            <div className="text-xs font-mono text-zinc-400 uppercase">{k.label}</div>
            <div className={`text-2xl font-bold mt-1 font-mono ${k.class}`}>{k.value}</div>
            <div className="text-xs text-zinc-500 mt-1 flex items-center gap-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Smart Alerts Panel */}
      {alertsEnabled && alerts.length > 0 && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-bell text-amber-400" />
              <h2 className="text-sm font-bold text-white">Smart Alerts</h2>
              <span className="text-[10px] font-mono text-zinc-500">{alerts.length} active</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.slice(0, 6).map(alert => {
              const s = SEVERITY_STYLES[alert.severity];
              return (
                <div key={alert.id} className={`rounded-lg border p-3 ${s.bg} ${s.border} flex items-start gap-2.5`}>
                  <i className={`${alert.icon} ${s.icon} text-sm mt-0.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`w-2 h-2 rounded-full ${s.dot} flex-shrink-0`} />
                      <h4 className="text-xs font-bold text-white truncate">{alert.title}</h4>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{alert.message}</p>
                    {alert.actionLabel && alert.actionView && (
                      <button
                        type="button"
                        onClick={() => navigate(alert.actionView as never)}
                        className="mt-1.5 text-[10px] font-bold text-amber-400 hover:text-amber-300 transition touch-manipulation"
                      >
                        {alert.actionLabel} &rarr;
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Business Insights Summary */}
      {insightsEnabled && insights.hasData && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-lightbulb text-amber-400" />
              <h2 className="text-sm font-bold text-white">Business Insights</h2>
              <span className="text-[10px] font-mono text-zinc-500">Auto-generated</span>
            </div>
            <button type="button" onClick={() => navigate('insights')} className="text-xs text-amber-400 hover:underline">Full Insights &rarr;</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {insights.topSelling && (
              <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/30 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <i className="fa-solid fa-trophy text-emerald-400 text-xs" />
                  <span className="text-[10px] font-mono uppercase text-zinc-400">Top Seller</span>
                </div>
                <div className="text-xs font-bold text-emerald-400 truncate">{insights.topSelling.name}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{insights.topSelling.qty} pints &bull; {fmtMoney(insights.topSelling.revenue)}</div>
              </div>
            )}
            {insights.leastPerforming && (
              <div className="rounded-lg border border-red-800/40 bg-red-950/30 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <i className="fa-solid fa-arrow-trend-down text-red-400 text-xs" />
                  <span className="text-[10px] font-mono uppercase text-zinc-400">Least Seller</span>
                </div>
                <div className="text-xs font-bold text-red-400 truncate">{insights.leastPerforming.name}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{insights.leastPerforming.qty} pints &bull; {fmtMoney(insights.leastPerforming.revenue)}</div>
              </div>
            )}
            {insights.bestDay && (
              <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <i className="fa-solid fa-calendar-star text-amber-400 text-xs" />
                  <span className="text-[10px] font-mono uppercase text-zinc-400">Best Day</span>
                </div>
                <div className="text-xs font-bold text-amber-400 truncate">{insights.bestDay.label}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{fmtMoney(insights.bestDay.revenue)} &bull; {insights.bestDay.orders} orders</div>
              </div>
            )}
            {insights.topCustomers.length > 0 && (
              <div className="rounded-lg border border-sky-800/40 bg-sky-950/30 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <i className="fa-solid fa-crown text-sky-400 text-xs" />
                  <span className="text-[10px] font-mono uppercase text-zinc-400">Top Customer</span>
                </div>
                <div className="text-xs font-bold text-sky-400 truncate">{insights.topCustomers[0].name}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{fmtMoney(insights.topCustomers[0].totalSpent)} &bull; {insights.topCustomers[0].orders} orders</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <h2 className="text-base font-bold text-white">Live Tap Lines & Keg Capacities</h2>
          </div>
          <button onClick={() => navigate('inventory')} className="text-xs text-amber-400 hover:underline">Manage All Kegs &rarr;</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {db.taps.map(t => <TapCard key={t.id} tap={t} onPour={() => quickPour(t.id)} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-zinc-900/70 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
              <i className="fa-solid fa-chart-area text-amber-400" /> {financialsEnabled ? 'Sales vs Expenses Overview' : 'Sales Overview'}
            </h3>
            <span className="text-xs font-mono text-zinc-500">Current Period</span>
          </div>
          <SalesChart data={financialsEnabled ? chartData : chartData.map(day => ({ ...day, expenses: 0 }))} />
          <div className="flex items-center gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1.5 text-zinc-400"><span className="w-3 h-1.5 rounded bg-amber-500" /> Sales Revenue</span>
            {financialsEnabled && <span className="flex items-center gap-1.5 text-zinc-400"><span className="w-3 h-1.5 rounded bg-red-500" /> Operating Expenses</span>}
          </div>
        </div>

        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 flex flex-col">
          <h3 className="font-bold text-sm text-zinc-200 mb-3 flex items-center gap-2">
            <i className="fa-solid fa-clock-rotate-left text-amber-400" /> Recent Sales
          </h3>
          <div className="space-y-2.5 flex-1 overflow-y-auto scrollbar-thin max-h-64">
            {recent.length === 0 ? (
              <div className="text-zinc-500 text-xs text-center py-6">No sales recorded yet.</div>
            ) : recent.map(inv => (
              <div key={inv.id} className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/70 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-zinc-200">{inv.invoiceNo} &bull; <span className="text-amber-400">{inv.customerName || 'Walk-in'}</span></div>
                  <div className="text-[10px] text-zinc-400 font-mono">{fmtTime(inv.timestamp)} &bull; {inv.paymentMethod}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-white">{fmtMoney(inv.total)}</div>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${inv.status === 'Paid' ? 'text-emerald-400 bg-emerald-950/50' : 'text-amber-400 bg-amber-950/50'}`}>{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
