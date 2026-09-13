import { useStore } from '@/store';
import { fmtMoney } from '@/utils';
import { useInsights } from '@/hooks/useInsights';

export function InsightsView() {
  const { db } = useStore();
  const { topSelling, leastPerforming, bestDay, topCustomers, topProducts, hasData } = useInsights(db);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <i className="fa-solid fa-lightbulb text-5xl text-zinc-700 mb-4" />
        <h2 className="text-lg font-bold text-zinc-400 mb-1">No Insights Yet</h2>
        <p className="text-sm text-zinc-500">Jab sales records banenge tab yahan automatic insights dikhenge.</p>
      </div>
    );
  }

  const maxRevenue = topProducts[0]?.revenue ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-lightbulb text-amber-400 text-lg" />
        <h2 className="text-base font-bold text-white">Automatic Business Insights</h2>
        <span className="text-[10px] font-mono text-zinc-500">Real-time analysis</span>
      </div>

      {/* Highlight cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Selling Product */}
        <div className="bg-gradient-to-br from-emerald-950/60 to-zinc-900/70 border border-emerald-800/40 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <i className="fa-solid fa-trophy text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Top Selling Product</h3>
              <p className="text-[10px] text-zinc-500 font-mono">Sabse zyada bikne wala</p>
            </div>
          </div>
          {topSelling ? (
            <div>
              <div className="text-xl font-bold text-emerald-400">{topSelling.name}</div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-2xl font-mono font-bold text-white">{topSelling.qty}</span>
                <span className="text-xs text-zinc-400">pints sold</span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs">
                <span className="text-zinc-400">Revenue: <strong className="text-amber-400">{fmtMoney(topSelling.revenue)}</strong></span>
                <span className="text-zinc-400">Profit: <strong className="text-emerald-400">{fmtMoney(topSelling.profit)}</strong></span>
              </div>
            </div>
          ) : <p className="text-zinc-500 text-xs">No data</p>}
        </div>

        {/* Least Performing Product */}
        <div className="bg-gradient-to-br from-red-950/60 to-zinc-900/70 border border-red-800/40 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center">
              <i className="fa-solid fa-arrow-trend-down text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Least Performing Product</h3>
              <p className="text-[10px] text-zinc-500 font-mono">Sabse kam bikne wala</p>
            </div>
          </div>
          {leastPerforming ? (
            <div>
              <div className="text-xl font-bold text-red-400">{leastPerforming.name}</div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-2xl font-mono font-bold text-white">{leastPerforming.qty}</span>
                <span className="text-xs text-zinc-400">pints sold</span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs">
                <span className="text-zinc-400">Revenue: <strong className="text-amber-400">{fmtMoney(leastPerforming.revenue)}</strong></span>
                <span className="text-zinc-400">{leastPerforming.profit < 0 ? 'Loss' : 'Profit'}: <strong className={leastPerforming.profit < 0 ? 'text-red-400' : 'text-emerald-400'}>{fmtMoney(leastPerforming.profit)}</strong></span>
              </div>
            </div>
          ) : <p className="text-zinc-500 text-xs">No data</p>}
        </div>
      </div>

      {/* Best Sales Day + Top Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Best Sales Day */}
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <i className="fa-solid fa-calendar-star text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Best Sales Day</h3>
              <p className="text-[10px] text-zinc-500 font-mono">Sabse zyada sales wala din</p>
            </div>
          </div>
          {bestDay ? (
            <div>
              <div className="text-xl font-bold text-amber-400">{bestDay.label}</div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-2xl font-mono font-bold text-white">{fmtMoney(bestDay.revenue)}</span>
                <span className="text-xs text-zinc-400">from {bestDay.orders} order{bestDay.orders === 1 ? '' : 's'}</span>
              </div>
            </div>
          ) : <p className="text-zinc-500 text-xs">No data</p>}
        </div>

        {/* Top Customers */}
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/20 flex items-center justify-center">
              <i className="fa-solid fa-users text-sky-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Top Customers</h3>
              <p className="text-[10px] text-zinc-500 font-mono">Sabse zyada business dene wale</p>
            </div>
          </div>
          {topCustomers.length > 0 ? (
            <div className="space-y-2">
              {topCustomers.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/70">
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold font-mono ${
                    i === 0 ? 'bg-amber-500/20 text-amber-400' : i === 1 ? 'bg-zinc-700 text-zinc-300' : i === 2 ? 'bg-orange-900/50 text-orange-400' : 'bg-zinc-800 text-zinc-500'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{c.name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{c.orders} order{c.orders === 1 ? '' : 's'}</div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400">{fmtMoney(c.totalSpent)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-zinc-500 text-xs">No customer data</p>}
        </div>
      </div>

      {/* Product Performance Bar Chart */}
      {topProducts.length > 0 && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <i className="fa-solid fa-chart-column text-amber-400" />
            <h3 className="font-bold text-white text-sm">Product Revenue Ranking</h3>
          </div>
          <div className="space-y-3">
            {topProducts.map((p, i) => (
              <div key={p.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-medium truncate">{i + 1}. {p.name}</span>
                  <span className="text-zinc-400 font-mono flex-shrink-0 ml-2">{fmtMoney(p.revenue)} &bull; {p.qty}pt</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                    style={{ width: `${Math.max(2, (p.revenue / maxRevenue) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
