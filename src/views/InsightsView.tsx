import { useMemo, useState } from 'react';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';
import { useInsights, PERIOD_LABELS, PERIOD_PREV_LABELS, type PeriodId, type MetricDelta } from '@/hooks/useInsights';
import { useInsightHistory } from '@/hooks/useInsightHistory';

const PERIODS: PeriodId[] = ['day', 'week', 'month'];

function r1(n: number) {
  return Math.round(n * 10) / 10;
}

function DeltaBadge({ d, invert = false }: { d: MetricDelta; invert?: boolean }) {
  if (d.changePct === null) return <span className="text-[10px] text-zinc-600 font-mono">no comparison</span>;
  const up = d.changePct >= 0;
  const good = invert ? !up : up;
  return (
    <span
      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
        good ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
      }`}
    >
      <i className={`fa-solid ${up ? 'fa-arrow-up' : 'fa-arrow-down'} mr-1`} />
      {Math.abs(r1(d.changePct))}%
    </span>
  );
}

function StatCard({
  label,
  value,
  d,
  icon,
  invert,
  sub,
}: {
  label: string;
  value: string;
  d?: MetricDelta;
  icon: string;
  invert?: boolean;
  sub?: string;
}) {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{label}</span>
        <i className={`${icon} text-amber-400 text-xs`} />
      </div>
      <div className="text-lg font-mono font-bold text-white truncate">{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {d ? <DeltaBadge d={d} invert={invert ?? false} /> : null}
        {sub ? <span className="text-[10px] text-zinc-500 font-mono truncate">{sub}</span> : null}
      </div>
    </div>
  );
}

function SectionCard({ title, icon, hint, children }: { title: string; icon: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <i className={`${icon} text-amber-400`} />
        <h3 className="font-bold text-white text-sm">{title}</h3>
        {hint ? <span className="text-[10px] text-zinc-500 font-mono">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function InsightsView() {
  const { db } = useStore();
  const [period, setPeriod] = useState<PeriodId>('week');
  const [openSnapshot, setOpenSnapshot] = useState<string | null>(null);
  const ins = useInsights(db, period);

  const snapshotCandidate = useMemo(
    () =>
      ins.hasPeriodData
        ? {
            period,
            sales: ins.sales.value,
            orders: ins.orders.value,
            expenses: ins.expenses.value,
            profit: ins.profit.value,
            marginPct: ins.marginPct,
            sentences: ins.sentences,
          }
        : null,
    [ins, period]
  );

  const { history } = useInsightHistory(snapshotCandidate, ins.hasPeriodData);

  if (!ins.hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <i className="fa-solid fa-lightbulb text-5xl text-zinc-700 mb-4" />
        <h2 className="text-lg font-bold text-zinc-400 mb-1">No Insights Yet</h2>
        <p className="text-sm text-zinc-500">Jab sales records banenge tab yahan automatic insights dikhenge.</p>
      </div>
    );
  }

  const maxHourRevenue = Math.max(1, ...ins.hours.map(h => h.revenue));
  const maxWeekdayRevenue = Math.max(1, ...ins.weekdays.map(w => w.revenue));
  const maxProductRevenue = ins.topByRevenue[0]?.revenue ?? 1;
  const prevLabel = PERIOD_PREV_LABELS[period];

  return (
    <div className="space-y-6">
      {/* Header + period switcher */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-lightbulb text-amber-400 text-lg" />
          <h2 className="text-base font-bold text-white">Automatic Business Insights</h2>
          <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">Real-time analysis</span>
        </div>
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-1 gap-1">
          {PERIODS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                period === p ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Sales" value={fmtMoney(ins.sales.value)} d={ins.sales} icon="fa-solid fa-cash-register" sub={`vs ${prevLabel}`} />
        <StatCard label="Orders" value={String(ins.orders.value)} d={ins.orders} icon="fa-solid fa-receipt" />
        <StatCard label="Avg Bill" value={fmtMoney(ins.avgBill.value)} d={ins.avgBill} icon="fa-solid fa-indian-rupee-sign" />
        <StatCard label="Expenses" value={fmtMoney(ins.expenses.value)} d={ins.expenses} invert icon="fa-solid fa-arrow-down-wide-short" />
        <StatCard
          label="Net Profit"
          value={fmtMoney(ins.profit.value)}
          d={ins.profit}
          icon="fa-solid fa-sack-dollar"
          sub={`${r1(ins.marginPct)}% margin`}
        />
      </div>

      {/* 2. Plain-language report */}
      <SectionCard title={`Your ${PERIOD_LABELS[period]} Report`} icon="fa-solid fa-file-lines" hint="auto-generated">
        {ins.sentences.length ? (
          <ul className="space-y-2">
            {ins.sentences.map((s, i) => (
              <li
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border text-xs leading-relaxed ${
                  s.tone === 'good'
                    ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-100'
                    : s.tone === 'warning'
                      ? 'bg-amber-950/30 border-amber-800/40 text-amber-100'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-300'
                }`}
              >
                <i className={`${s.icon} mt-0.5 ${s.tone === 'good' ? 'text-emerald-400' : s.tone === 'warning' ? 'text-amber-400' : 'text-zinc-500'}`} />
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500 text-xs">Not enough activity in this period to generate a report yet.</p>
        )}
      </SectionCard>

      {/* 3. Best & worst performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Best Performers" icon="fa-solid fa-trophy" hint="top sellers">
          {ins.topByRevenue.length ? (
            <div className="space-y-3">
              {ins.topByRevenue.map((p, i) => (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-300 font-medium truncate">{i + 1}. {p.name}</span>
                    <span className="text-zinc-400 font-mono flex-shrink-0 ml-2">
                      {fmtMoney(p.revenue)} &bull; {p.qty}pt
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                      style={{ width: `${Math.max(2, (p.revenue / maxProductRevenue) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-xs">No sales in this period.</p>
          )}
        </SectionCard>

        <SectionCard title="Slow Movers & Low Profit" icon="fa-solid fa-arrow-trend-down" hint="needs attention">
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Slow moving items</div>
              {ins.slowMovers.length ? (
                <div className="space-y-1.5">
                  {ins.slowMovers.map(p => (
                    <div key={`slow-${p.name}`} className="flex items-center justify-between text-xs bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-3 py-2">
                      <span className="text-zinc-300 truncate">{p.name}</span>
                      <span className="font-mono text-zinc-500 flex-shrink-0 ml-2">{p.qty} pt</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-xs">Nothing slow — everything is selling.</p>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Least profitable</div>
              {ins.leastProfitable.length ? (
                <div className="space-y-1.5">
                  {ins.leastProfitable.map(p => (
                    <div key={`lp-${p.name}`} className="flex items-center justify-between text-xs bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-3 py-2">
                      <span className="text-zinc-300 truncate">{p.name}</span>
                      <span className={`font-mono flex-shrink-0 ml-2 ${p.profit < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                        {fmtMoney(p.profit)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-xs">No data.</p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* 4. Peak hours & days */}
      <SectionCard
        title="Peak Hours & Days"
        icon="fa-solid fa-clock"
        hint={ins.peakHour ? `busiest around ${ins.peakHour.label}` : 'from bill timestamps'}
      >
        {ins.hours.some(h => h.orders > 0) ? (
          <>
            <div className="flex items-end gap-[3px] h-24 mb-2">
              {ins.hours.map(h => (
                <div key={h.hour} className="flex-1 flex flex-col justify-end group relative" title={`${h.label}: ${fmtMoney(h.revenue)} (${h.orders} orders)`}>
                  <div
                    className={`rounded-t transition-all ${
                      ins.peakHour?.hour === h.hour ? 'bg-amber-400' : h.revenue > 0 ? 'bg-amber-600/70' : 'bg-zinc-800'
                    }`}
                    style={{ height: `${h.revenue > 0 ? Math.max(12, (h.revenue / maxHourRevenue) * 100) : 6}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-zinc-600 font-mono mb-4">
              <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
            </div>
          </>
        ) : (
          <p className="text-zinc-500 text-xs mb-4">No billing activity in this period.</p>
        )}

        <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Weekday pattern (all time)</div>
        <div className="space-y-2">
          {ins.weekdays.map(w => (
            <div key={w.weekday} className="flex items-center gap-3">
              <span className="w-16 text-[11px] text-zinc-400 flex-shrink-0">{w.label.slice(0, 3)}</span>
              <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full ${w.weekday === 0 || w.weekday === 6 ? 'bg-sky-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.max(1, (w.revenue / maxWeekdayRevenue) * 100)}%` }}
                />
              </div>
              <span className="w-24 text-right text-[10px] font-mono text-zinc-400 flex-shrink-0">{fmtMoney(w.revenue)}</span>
            </div>
          ))}
        </div>
        {ins.weekendVsWeekday !== null && (
          <p className="text-xs text-zinc-400 mt-3">
            Weekend days average{' '}
            <strong className={ins.weekendVsWeekday > 0 ? 'text-emerald-400' : 'text-red-400'}>
              {Math.abs(r1(ins.weekendVsWeekday))}% {ins.weekendVsWeekday > 0 ? 'higher' : 'lower'}
            </strong>{' '}
            than weekdays.
          </p>
        )}
      </SectionCard>

      {/* 5. Expense alerts */}
      <SectionCard title="Expense Pattern Alerts" icon="fa-solid fa-triangle-exclamation" hint="vs historical average">
        {ins.expenseAlerts.length ? (
          <div className="space-y-2">
            {ins.expenseAlerts.map(a => (
              <div
                key={a.category}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-xs ${
                  a.severity === 'warning'
                    ? 'bg-amber-950/30 border-amber-800/40'
                    : a.severity === 'good'
                      ? 'bg-emerald-950/20 border-emerald-800/30'
                      : 'bg-zinc-950/60 border-zinc-800/70'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-zinc-200 font-medium truncate">{a.category}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">avg {fmtMoney(a.average)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-zinc-200">{fmtMoney(a.amount)}</div>
                  {a.average > 0 && (
                    <div
                      className={`text-[10px] font-mono ${
                        a.severity === 'warning' ? 'text-amber-400' : a.severity === 'good' ? 'text-emerald-400' : 'text-zinc-500'
                      }`}
                    >
                      {a.changePct >= 0 ? '+' : ''}
                      {r1(a.changePct)}% vs average
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-xs">No expenses recorded yet.</p>
        )}
      </SectionCard>

      {/* 6. Profit margin insights */}
      <SectionCard title="Profit Margin vs Volume" icon="fa-solid fa-scale-balanced">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-emerald-400/80 mb-1">Highest margin</div>
            {ins.bestMargin ? (
              <div className="text-sm font-bold text-white">
                {ins.bestMargin.name} <span className="font-mono text-emerald-400">{r1(ins.bestMargin.margin)}%</span>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">No data</div>
            )}
          </div>
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-amber-400/80 mb-1">Highest volume</div>
            {ins.bestVolume ? (
              <div className="text-sm font-bold text-white">
                {ins.bestVolume.name} <span className="font-mono text-amber-400">{ins.bestVolume.qty} pt</span>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">No data</div>
            )}
          </div>
        </div>
        {ins.marginTable.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2 font-medium">Item</th>
                  <th className="text-right py-2 font-medium">Qty</th>
                  <th className="text-right py-2 font-medium">Revenue</th>
                  <th className="text-right py-2 font-medium">Profit</th>
                  <th className="text-right py-2 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {ins.marginTable.map(p => (
                  <tr key={`m-${p.name}`} className="border-b border-zinc-800/60 last:border-0">
                    <td className="py-2 text-zinc-300 truncate max-w-[140px]">{p.name}</td>
                    <td className="py-2 text-right font-mono text-zinc-400">{p.qty}</td>
                    <td className="py-2 text-right font-mono text-zinc-400">{fmtMoney(p.revenue)}</td>
                    <td className={`py-2 text-right font-mono ${p.profit < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{fmtMoney(p.profit)}</td>
                    <td className={`py-2 text-right font-mono font-bold ${p.margin < 0 ? 'text-red-400' : 'text-amber-400'}`}>{r1(p.margin)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-zinc-500 text-xs">No sales in this period.</p>
        )}
      </SectionCard>

      {/* Top customers */}
      <SectionCard title="Top Customers" icon="fa-solid fa-users" hint="this period">
        {ins.topCustomers.length ? (
          <div className="space-y-2">
            {ins.topCustomers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/70">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold font-mono ${
                    i === 0 ? 'bg-amber-500/20 text-amber-400' : i === 1 ? 'bg-zinc-700 text-zinc-300' : i === 2 ? 'bg-orange-900/50 text-orange-400' : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{c.name}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{c.orders} order{c.orders === 1 ? '' : 's'}</div>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400">{fmtMoney(c.totalSpent)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-xs">No customer sales in this period.</p>
        )}
      </SectionCard>

      {/* 7. Insight history */}
      <SectionCard title="Insight History" icon="fa-solid fa-clock-rotate-left" hint="saved automatically">
        {history.length ? (
          <div className="space-y-2">
            {history.map(s => {
              const open = openSnapshot === s.id;
              return (
                <div key={s.id} className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSnapshot(open ? null : s.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-900/60 transition"
                  >
                    <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'} text-[10px] text-zinc-500`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white">
                        {new Date(s.date + 'T00:00:00').toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                        <span className="ml-2 text-[10px] font-normal text-zinc-500 uppercase">{PERIOD_LABELS[s.period]}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">
                        Sales {fmtMoney(s.sales)} &bull; {s.orders} orders &bull; Profit {fmtMoney(s.profit)}
                      </div>
                    </div>
                    <span className={`text-xs font-mono font-bold flex-shrink-0 ${s.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r1(s.marginPct)}%
                    </span>
                  </button>
                  {open && (
                    <ul className="px-4 pb-3 space-y-1.5 border-t border-zinc-800/70 pt-3">
                      {s.sentences.map((t, i) => (
                        <li key={i} className="text-[11px] text-zinc-400 flex items-start gap-2">
                          <i className={`${t.icon} mt-0.5 text-zinc-600`} />
                          <span>{t.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-zinc-500 text-xs">Reports will be saved here as they are generated each day.</p>
        )}
      </SectionCard>
    </div>
  );
}
