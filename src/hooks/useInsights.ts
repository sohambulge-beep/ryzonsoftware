import { useMemo } from 'react';
import type { AppData, Invoice } from '@/types';
import { fmtMoney } from '@/utils';

export type PeriodId = 'day' | 'week' | 'month';

export interface ProductInsight {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number; // percent
}

export interface DayInsight {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}

export interface CustomerInsight {
  id: string;
  name: string;
  totalSpent: number;
  orders: number;
  currentBalance: number;
}

export interface HourBucket {
  hour: number;
  label: string;
  revenue: number;
  orders: number;
}

export interface WeekdayBucket {
  weekday: number;
  label: string;
  revenue: number;
  orders: number;
}

export interface ExpenseAlert {
  category: string;
  amount: number;
  average: number;
  changePct: number;
  severity: 'warning' | 'good' | 'neutral';
}

export interface Sentence {
  text: string;
  tone: 'good' | 'warning' | 'neutral';
  icon: string;
}

export interface MetricDelta {
  value: number;
  previous: number;
  changePct: number | null;
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const PERIOD_LABELS: Record<PeriodId, string> = {
  day: 'Today',
  week: 'This Week',
  month: 'This Month',
};

export const PERIOD_PREV_LABELS: Record<PeriodId, string> = {
  day: 'yesterday',
  week: 'last week',
  month: 'last month',
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Returns [currentStart, currentEnd, prevStart, prevEnd) for the period. */
export function periodRanges(period: PeriodId, now = new Date()) {
  const today = startOfDay(now);
  let start: Date;
  let end: Date;
  if (period === 'day') {
    start = today;
    end = new Date(today.getTime() + 86400000);
  } else if (period === 'week') {
    const dow = today.getDay();
    const diff = (dow + 6) % 7; // week starts Monday
    start = new Date(today.getTime() - diff * 86400000);
    end = new Date(start.getTime() + 7 * 86400000);
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  }
  let prevStart: Date;
  if (period === 'month') {
    prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  } else {
    prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
  }
  return { start, end, prevStart, prevEnd: start };
}

function inRange(ts: string, start: Date, end: Date) {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  return !Number.isNaN(t) && t >= start.getTime() && t < end.getTime();
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function delta(value: number, previous: number): MetricDelta {
  return { value, previous, changePct: pctChange(value, previous) };
}

function aggregateProducts(invoices: Invoice[]): ProductInsight[] {
  const map = new Map<string, { qty: number; revenue: number; cost: number }>();
  invoices.forEach(inv => {
    inv.items.forEach(item => {
      const e = map.get(item.beerName) ?? { qty: 0, revenue: 0, cost: 0 };
      e.qty += item.qty;
      e.revenue += item.total;
      e.cost += item.costTotal;
      map.set(item.beerName, e);
    });
  });
  return Array.from(map.entries()).map(([name, v]) => ({
    name,
    qty: v.qty,
    revenue: v.revenue,
    cost: v.cost,
    profit: v.revenue - v.cost,
    margin: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0,
  }));
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

export function useInsights(db: AppData, period: PeriodId = 'week') {
  return useMemo(() => {
    const { start, end, prevStart, prevEnd } = periodRanges(period);

    const periodInvoices = db.invoices.filter(i => inRange(i.timestamp, start, end));
    const prevInvoices = db.invoices.filter(i => inRange(i.timestamp, prevStart, prevEnd));
    const periodExpenses = db.expenses.filter(e => inRange(`${e.date}T00:00:00`, start, end));
    const prevExpenses = db.expenses.filter(e => inRange(`${e.date}T00:00:00`, prevStart, prevEnd));

    const sum = (arr: Invoice[]) => arr.reduce((s, i) => s + i.total, 0);
    const cost = (arr: Invoice[]) =>
      arr.reduce((s, i) => s + i.items.reduce((c, it) => c + it.costTotal, 0), 0);
    const expSum = (arr: typeof db.expenses) => arr.reduce((s, e) => s + e.amount, 0);

    const sales = delta(sum(periodInvoices), sum(prevInvoices));
    const orders = delta(periodInvoices.length, prevInvoices.length);
    const avgBill = delta(
      periodInvoices.length ? sales.value / periodInvoices.length : 0,
      prevInvoices.length ? sales.previous / prevInvoices.length : 0
    );
    const expenses = delta(expSum(periodExpenses), expSum(prevExpenses));
    const grossProfit = sales.value - cost(periodInvoices);
    const prevGrossProfit = sales.previous - cost(prevInvoices);
    const profit = delta(grossProfit - expenses.value, prevGrossProfit - expenses.previous);
    const marginPct = sales.value > 0 ? (profit.value / sales.value) * 100 : 0;

    // Products (period + all time for slow movers)
    const periodProducts = aggregateProducts(periodInvoices);
    const allProducts = aggregateProducts(db.invoices);
    const soldNames = new Set(periodProducts.map(p => p.name));
    const neverSold: ProductInsight[] = db.taps
      .filter(t => !soldNames.has(t.name))
      .map(t => ({ name: t.name, qty: 0, revenue: 0, cost: 0, profit: 0, margin: 0 }));

    const byRevenue = [...periodProducts].sort((a, b) => b.revenue - a.revenue);
    const byQty = [...periodProducts].sort((a, b) => b.qty - a.qty);
    const byMargin = [...periodProducts].filter(p => p.revenue > 0).sort((a, b) => b.margin - a.margin);
    const slowMovers = [...neverSold, ...[...periodProducts].sort((a, b) => a.qty - b.qty)].slice(0, 5);
    const leastProfitable = [...periodProducts].sort((a, b) => a.profit - b.profit).slice(0, 5);

    const topSelling = byRevenue[0] ?? null;
    const leastPerforming = byRevenue.length > 1 ? byRevenue[byRevenue.length - 1] : null;
    const bestMargin = byMargin[0] ?? null;
    const bestVolume = byQty[0] ?? null;

    // Peak hours
    const hourMap = new Map<number, { revenue: number; orders: number }>();
    periodInvoices.forEach(inv => {
      const h = new Date(inv.timestamp).getHours();
      if (Number.isNaN(h)) return;
      const e = hourMap.get(h) ?? { revenue: 0, orders: 0 };
      e.revenue += inv.total;
      e.orders += 1;
      hourMap.set(h, e);
    });
    const hours: HourBucket[] = Array.from({ length: 24 }, (_, h) => {
      const v = hourMap.get(h) ?? { revenue: 0, orders: 0 };
      const suffix = h < 12 ? 'AM' : 'PM';
      const display = h % 12 === 0 ? 12 : h % 12;
      return { hour: h, label: `${display} ${suffix}`, revenue: v.revenue, orders: v.orders };
    });
    const peakHour = hours.reduce<HourBucket | null>(
      (best, h) => (h.revenue > 0 && (!best || h.revenue > best.revenue) ? h : best),
      null
    );

    // Weekdays (whole history for reliability)
    const wdMap = new Map<number, { revenue: number; orders: number }>();
    db.invoices.forEach(inv => {
      const d = new Date(inv.timestamp);
      const wd = d.getDay();
      if (Number.isNaN(wd)) return;
      const e = wdMap.get(wd) ?? { revenue: 0, orders: 0 };
      e.revenue += inv.total;
      e.orders += 1;
      wdMap.set(wd, e);
    });
    const weekdays: WeekdayBucket[] = Array.from({ length: 7 }, (_, i) => {
      const wd = (i + 1) % 7; // Mon..Sun
      const v = wdMap.get(wd) ?? { revenue: 0, orders: 0 };
      return { weekday: wd, label: WEEKDAY_LABELS[wd]!, revenue: v.revenue, orders: v.orders };
    });
    const active = weekdays.filter(w => w.revenue > 0);
    const busiestDay = active.length ? [...active].sort((a, b) => b.revenue - a.revenue)[0]! : null;
    const quietestDay = active.length > 1 ? [...active].sort((a, b) => a.revenue - b.revenue)[0]! : null;

    const weekendRev = weekdays.filter(w => w.weekday === 0 || w.weekday === 6).reduce((s, w) => s + w.revenue, 0);
    const weekendDays = weekdays.filter(w => (w.weekday === 0 || w.weekday === 6) && w.revenue > 0).length;
    const weekdayRev = weekdays.filter(w => w.weekday > 0 && w.weekday < 6).reduce((s, w) => s + w.revenue, 0);
    const weekdayDays = weekdays.filter(w => w.weekday > 0 && w.weekday < 6 && w.revenue > 0).length;
    const weekendAvg = weekendDays ? weekendRev / weekendDays : 0;
    const weekdayAvg = weekdayDays ? weekdayRev / weekdayDays : 0;
    const weekendVsWeekday = weekdayAvg > 0 && weekendAvg > 0 ? ((weekendAvg - weekdayAvg) / weekdayAvg) * 100 : null;

    // Expense alerts: category spend this period vs historical monthly-equivalent average
    const catPeriod = new Map<string, number>();
    periodExpenses.forEach(e => catPeriod.set(e.category, (catPeriod.get(e.category) ?? 0) + e.amount));

    const catHistory = new Map<string, Map<string, number>>();
    db.expenses.forEach(e => {
      const bucketKey =
        period === 'month'
          ? (e.date || '').substring(0, 7)
          : period === 'day'
            ? (e.date || '').substring(0, 10)
            : weekKeyOf(e.date);
      if (!bucketKey) return;
      const m = catHistory.get(e.category) ?? new Map<string, number>();
      m.set(bucketKey, (m.get(bucketKey) ?? 0) + e.amount);
      catHistory.set(e.category, m);
    });

    const expenseAlerts: ExpenseAlert[] = Array.from(
      new Set([...catPeriod.keys(), ...catHistory.keys()])
    )
      .map(category => {
        const amount = catPeriod.get(category) ?? 0;
        const buckets = Array.from(catHistory.get(category)?.values() ?? []);
        const past = buckets.length > 1 ? buckets : [];
        const average = past.length ? past.reduce((s, v) => s + v, 0) / past.length : 0;
        const changePct = average > 0 ? ((amount - average) / average) * 100 : null;
        const severity: ExpenseAlert['severity'] =
          changePct === null ? 'neutral' : changePct >= 25 ? 'warning' : changePct <= -25 ? 'good' : 'neutral';
        return { category, amount, average, changePct: changePct ?? 0, severity };
      })
      .filter(a => a.amount > 0 || a.average > 0)
      .sort((a, b) => b.changePct - a.changePct);

    // Top customers (period)
    const customerMap = new Map<string, { totalSpent: number; orders: number }>();
    periodInvoices.forEach(inv => {
      if (!inv.customerId) return;
      const e = customerMap.get(inv.customerId) ?? { totalSpent: 0, orders: 0 };
      e.totalSpent += inv.total;
      e.orders += 1;
      customerMap.set(inv.customerId, e);
    });
    const topCustomers: CustomerInsight[] = db.customers
      .map(c => ({
        id: c.id,
        name: c.name,
        totalSpent: customerMap.get(c.id)?.totalSpent ?? 0,
        orders: customerMap.get(c.id)?.orders ?? 0,
        currentBalance: c.currentBalance,
      }))
      .filter(c => c.orders > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    // Best day inside the period
    const dayMap = new Map<string, { revenue: number; orders: number }>();
    periodInvoices.forEach(inv => {
      const dateStr = (inv.timestamp || '').split('T')[0];
      if (!dateStr) return;
      const e = dayMap.get(dateStr) ?? { revenue: 0, orders: 0 };
      e.revenue += inv.total;
      e.orders += 1;
      dayMap.set(dateStr, e);
    });
    const bestDay: DayInsight | null = dayMap.size
      ? Array.from(dayMap.entries())
          .map(([date, v]) => ({
            date,
            label: new Date(date + 'T00:00:00').toLocaleDateString([], {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }),
            revenue: v.revenue,
            orders: v.orders,
          }))
          .sort((a, b) => b.revenue - a.revenue)[0]!
      : null;

    // Plain-language sentences
    const prevLabel = PERIOD_PREV_LABELS[period];
    const sentences: Sentence[] = [];

    if (sales.changePct !== null && Math.abs(sales.changePct) >= 1) {
      const up = sales.changePct > 0;
      sentences.push({
        text: `Sales are ${up ? 'up' : 'down'} ${Math.abs(round(sales.changePct))}% compared to ${prevLabel} (${fmtMoney(sales.value)} vs ${fmtMoney(sales.previous)}).`,
        tone: up ? 'good' : 'warning',
        icon: up ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-arrow-trend-down',
      });
    } else if (sales.value > 0) {
      sentences.push({
        text: `You made ${fmtMoney(sales.value)} from ${orders.value} order${orders.value === 1 ? '' : 's'} this period.`,
        tone: 'neutral',
        icon: 'fa-solid fa-receipt',
      });
    }

    if (avgBill.value > 0) {
      const c = avgBill.changePct;
      sentences.push({
        text:
          c !== null && Math.abs(c) >= 5
            ? `Average bill is ${fmtMoney(avgBill.value)}, ${c > 0 ? 'up' : 'down'} ${Math.abs(round(c))}% vs ${prevLabel}.`
            : `Average bill value is ${fmtMoney(avgBill.value)}.`,
        tone: c !== null && c < -5 ? 'warning' : 'neutral',
        icon: 'fa-solid fa-indian-rupee-sign',
      });
    }

    if (weekendVsWeekday !== null && Math.abs(weekendVsWeekday) >= 10) {
      sentences.push({
        text: `Weekend sales are ${Math.abs(round(weekendVsWeekday))}% ${weekendVsWeekday > 0 ? 'higher' : 'lower'} than weekdays on average.`,
        tone: weekendVsWeekday > 0 ? 'good' : 'neutral',
        icon: 'fa-solid fa-calendar-week',
      });
    }

    if (topSelling) {
      sentences.push({
        text: `${topSelling.name} brought the most revenue: ${topSelling.qty} pints, ${fmtMoney(topSelling.revenue)}.`,
        tone: 'good',
        icon: 'fa-solid fa-trophy',
      });
    }

    if (bestMargin && bestVolume && bestMargin.name !== bestVolume.name) {
      sentences.push({
        text: `${bestMargin.name} has your best profit margin (${round(bestMargin.margin)}%), while ${bestVolume.name} sells the most units (${bestVolume.qty}).`,
        tone: 'neutral',
        icon: 'fa-solid fa-scale-balanced',
      });
    }

    if (peakHour) {
      sentences.push({
        text: `Your busiest hour is around ${peakHour.label} with ${peakHour.orders} order${peakHour.orders === 1 ? '' : 's'}.`,
        tone: 'neutral',
        icon: 'fa-solid fa-clock',
      });
    }

    if (busiestDay) {
      sentences.push({
        text: `${busiestDay.label} is your strongest day overall${quietestDay ? `, and ${quietestDay.label} the quietest` : ''}.`,
        tone: 'neutral',
        icon: 'fa-solid fa-calendar-day',
      });
    }

    const spiking = expenseAlerts.filter(a => a.severity === 'warning');
    spiking.slice(0, 2).forEach(a => {
      sentences.push({
        text: `Spending on ${a.category} is ${round(a.changePct)}% above your usual average (${fmtMoney(a.amount)} vs ${fmtMoney(a.average)}).`,
        tone: 'warning',
        icon: 'fa-solid fa-triangle-exclamation',
      });
    });

    const lossMakers = periodProducts.filter(p => p.profit < 0);
    if (lossMakers.length) {
      sentences.push({
        text: `${lossMakers.map(p => p.name).join(', ')} sold at a loss this period — check pricing or cost.`,
        tone: 'warning',
        icon: 'fa-solid fa-circle-exclamation',
      });
    }

    if (sales.value > 0) {
      sentences.push({
        text: `Net profit for this period is ${fmtMoney(profit.value)} (${round(marginPct)}% margin) after ${fmtMoney(expenses.value)} of expenses.`,
        tone: profit.value >= 0 ? 'good' : 'warning',
        icon: 'fa-solid fa-sack-dollar',
      });
    }

    return {
      period,
      range: { start, end },
      sales,
      orders,
      avgBill,
      expenses,
      profit,
      marginPct,
      sentences,
      topSelling,
      leastPerforming,
      bestMargin,
      bestVolume,
      topByRevenue: byRevenue.slice(0, 5),
      topByQty: byQty.slice(0, 5),
      slowMovers,
      leastProfitable,
      marginTable: [...periodProducts].sort((a, b) => b.margin - a.margin),
      hours,
      peakHour,
      weekdays,
      busiestDay,
      quietestDay,
      weekendVsWeekday,
      expenseAlerts,
      topCustomers,
      bestDay,
      topProducts: byRevenue.slice(0, 5),
      allTimeProducts: allProducts,
      hasData: db.invoices.length > 0,
      hasPeriodData: periodInvoices.length > 0,
    };
  }, [db, period]);
}

export type InsightsResult = ReturnType<typeof useInsights>;

function weekKeyOf(date: string): string {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const diff = (d.getDay() + 6) % 7;
  const monday = new Date(d.getTime() - diff * 86400000);
  return monday.toISOString().split('T')[0] ?? '';
}
