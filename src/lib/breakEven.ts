import type { Expense, Invoice } from "@/types";

// Break-even: how much you must sell each day so that sales cover the cost of the beer AND the running costs.
// It only reads your bills and expenses. It never changes any data.

export type Warning = "no_sales" | "few_days" | "no_expenses" | "low_cost" | "low_margin";

export interface BreakEvenResult {
  today: string;
  windowDays: number; // days of data used (at most 30)
  revenue: number;
  cogs: number;
  expenses: number;
  margin: number | null; // gross margin, 0 to 1
  fixedPerDay: number; // running costs per day
  breakEvenDaily: number | null; // sales needed per day
  soldToday: number;
  todayPct: number | null;
  todayProfit: number | null; // estimate: sales x margin - running cost of one day
  month: {
    label: string;
    sold: number;
    breakEven: number | null; // for the whole month
    pct: number | null;
    remainingDays: number; // including today
    needPerDay: number | null;
  };
  warnings: Warning[];
}

const HOUR = 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const r2 = (n: number) => Math.round(n * 100) / 100;

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A bar open past midnight counts those sales in the same business day.
export function businessDay(ts: Date, startHour: number): string {
  return dateStr(new Date(ts.getTime() - startHour * HOUR));
}

// A whole number per calendar day, so days can be counted without clock or daylight-saving problems.
function dayNumber(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

interface Row {
  day: string;
  n: number;
  total: number; // sales for a bill, amount for an expense
  cogs: number;
}

export function computeBreakEven(
  invoices: Invoice[],
  expenses: Expense[],
  now: Date = new Date(),
  startHour = 5
): BreakEvenResult {
  const today = businessDay(now, startHour);
  const todayN = dayNumber(today);

  const bills: Row[] = [];
  for (const inv of invoices) {
    const t = new Date(inv.timestamp);
    const total = Number(inv.total);
    if (Number.isNaN(t.getTime()) || !Number.isFinite(total) || total <= 0) continue;
    const day = businessDay(t, startHour);
    const n = dayNumber(day);
    if (!(n <= todayN)) continue;
    let cogs = 0;
    for (const it of inv.items ?? []) {
      const c = Number(it.costTotal);
      if (Number.isFinite(c) && c > 0) cogs += c;
    }
    bills.push({ day, n, total, cogs });
  }

  const costs: Row[] = [];
  for (const e of expenses) {
    const amount = Number(e.amount);
    const day = String(e.date ?? "").slice(0, 10);
    const n = dayNumber(day);
    if (!Number.isFinite(amount) || amount <= 0 || !(n <= todayN)) continue;
    costs.push({ day, n, total: amount, cogs: 0 });
  }

  let firstN = todayN;
  for (const r of bills) if (r.n < firstN) firstN = r.n;
  for (const r of costs) if (r.n < firstN) firstN = r.n;
  const startN = Math.max(todayN - 29, firstN);
  const windowDays = todayN - startN + 1;

  let revenue = 0;
  let cogs = 0;
  let spent = 0;
  let soldToday = 0;
  const monthPrefix = today.slice(0, 7);
  let soldMonth = 0;
  for (const r of bills) {
    if (r.n >= startN) {
      revenue += r.total;
      cogs += r.cogs;
    }
    if (r.n === todayN) soldToday += r.total;
    if (r.day.startsWith(monthPrefix)) soldMonth += r.total;
  }
  for (const r of costs) if (r.n >= startN) spent += r.total;

  const margin = revenue > 0 ? (revenue - cogs) / revenue : null;
  const fixedPerDay = spent / windowDays;
  const breakEvenDaily = margin !== null && margin > 0.05 ? fixedPerDay / margin : null;

  const [yy, mm] = today.split("-").map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const dayOfMonth = Number(today.slice(8, 10));
  const remainingDays = daysInMonth - dayOfMonth + 1;
  const monthBreakEven = breakEvenDaily !== null ? breakEvenDaily * daysInMonth : null;

  const warnings: Warning[] = [];
  if (revenue <= 0) warnings.push("no_sales");
  else {
    if (windowDays < 7) warnings.push("few_days");
    if (cogs / revenue < 0.05) warnings.push("low_cost");
    if (margin !== null && margin <= 0.05) warnings.push("low_margin");
  }
  if (spent <= 0) warnings.push("no_expenses");

  return {
    today,
    windowDays,
    revenue: r2(revenue),
    cogs: r2(cogs),
    expenses: r2(spent),
    margin,
    fixedPerDay: r2(fixedPerDay),
    breakEvenDaily: breakEvenDaily === null ? null : r2(breakEvenDaily),
    soldToday: r2(soldToday),
    todayPct: breakEvenDaily !== null && breakEvenDaily > 0 ? (soldToday / breakEvenDaily) * 100 : null,
    todayProfit: margin === null ? null : r2(soldToday * margin - fixedPerDay),
    month: {
      label: `${MONTHS[mm - 1]} ${yy}`,
      sold: r2(soldMonth),
      breakEven: monthBreakEven === null ? null : r2(monthBreakEven),
      pct: monthBreakEven !== null && monthBreakEven > 0 ? (soldMonth / monthBreakEven) * 100 : null,
      remainingDays,
      needPerDay: monthBreakEven === null ? null : Math.max(0, r2((monthBreakEven - soldMonth) / remainingDays)),
    },
    warnings,
  };
}
