import type { Invoice } from "@/types";

// Today's sales target, this month's target, the pace and the streak.
// It only reads your bills. It never changes any data.

export interface TargetSettings {
  daily: number; // target for one day (0 = not set)
  monthly: number; // target for the month (0 = use daily x days in the month)
  dayStartHour: number; // the business day starts at this hour (a bar open past midnight counts those sales in the same day)
}

export const DEFAULT_SETTINGS: TargetSettings = { daily: 0, monthly: 0, dayStartHour: 5 };

export interface TargetResult {
  today: string;
  soldToday: number;
  dailyTarget: number;
  pct: number; // 0 to 100+
  remaining: number;
  projected: number | null; // estimate for the end of today, from the last 14 days' pattern
  month: {
    label: string;
    sold: number;
    target: number;
    pct: number;
    daysInMonth: number;
    dayOfMonth: number;
    remainingDays: number; // including today
    neededPerDay: number;
    projectedEnd: number;
    onTrack: boolean | null;
  };
  streak: number; // days in a row the daily target was met
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const r2 = (n: number) => Math.round(n * 100) / 100;

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The business day a moment belongs to, and when that business day started.
export function businessDay(ts: Date, startHour: number): { day: string; start: Date } {
  const shifted = new Date(ts.getTime() - startHour * HOUR);
  const start = new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(), startHour);
  return { day: dateStr(shifted), start };
}

interface Entry {
  day: string;
  offset: number; // ms since the business day started
  total: number;
}

function entries(invoices: Invoice[], startHour: number): Entry[] {
  const out: Entry[] = [];
  for (const inv of invoices) {
    const t = new Date(inv.timestamp);
    const total = Number(inv.total);
    if (Number.isNaN(t.getTime()) || !Number.isFinite(total) || total <= 0) continue;
    const { day, start } = businessDay(t, startHour);
    out.push({ day, offset: t.getTime() - start.getTime(), total });
  }
  return out;
}

export function computeTarget(invoices: Invoice[], settings: TargetSettings, now: Date = new Date()): TargetResult {
  const sh = settings.dayStartHour;
  const list = entries(invoices, sh);
  const { day: today, start: todayStart } = businessDay(now, sh);
  const elapsed = now.getTime() - todayStart.getTime();

  const byDay = new Map<string, number>();
  for (const e of list) byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.total);

  const soldToday = r2(byDay.get(today) ?? 0);
  const dailyTarget = settings.daily > 0 ? settings.daily : 0;
  const pct = dailyTarget > 0 ? (soldToday / dailyTarget) * 100 : 0;

  // End-of-day estimate: how much of a normal day's sales is usually done by this time of day.
  let projected: number | null = null;
  const days: string[] = [];
  for (let i = 1; i <= 14; i++) days.push(dateStr(new Date(todayStart.getTime() - i * DAY + 12 * HOUR)));
  let upToNow = 0;
  let fullDays = 0;
  let full = 0;
  for (const d of days) {
    const total = byDay.get(d) ?? 0;
    if (total <= 0) continue;
    fullDays++;
    full += total;
    for (const e of list) if (e.day === d && e.offset <= elapsed) upToNow += e.total;
  }
  if (fullDays >= 3 && full > 0 && soldToday > 0) {
    const fraction = upToNow / full;
    if (fraction >= 0.995) projected = soldToday;
    else if (fraction >= 0.08) projected = r2(soldToday / fraction);
  }

  // This month (by business day).
  const [yy, mm] = today.split("-").map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const dayOfMonth = Number(today.slice(8, 10));
  const monthPrefix = today.slice(0, 7);
  let soldMonth = 0;
  for (const [d, v] of byDay) if (d.startsWith(monthPrefix)) soldMonth += v;
  soldMonth = r2(soldMonth);
  const monthTarget = settings.monthly > 0 ? settings.monthly : dailyTarget > 0 ? dailyTarget * daysInMonth : 0;
  const remainingDays = daysInMonth - dayOfMonth + 1;
  const neededPerDay = monthTarget > 0 ? Math.max(0, r2((monthTarget - soldMonth) / remainingDays)) : 0;
  const projectedEnd = r2((soldMonth / dayOfMonth) * daysInMonth);

  // Streak: days in a row the target was met. Today counts only once it is met; until then it is not a miss.
  let streak = 0;
  if (dailyTarget > 0) {
    let cursor = new Date(todayStart.getTime() + 12 * HOUR);
    if (soldToday < dailyTarget) cursor = new Date(cursor.getTime() - DAY);
    for (let i = 0; i < 366; i++) {
      const total = byDay.get(dateStr(cursor)) ?? 0;
      if (total >= dailyTarget) streak++;
      else break;
      cursor = new Date(cursor.getTime() - DAY);
    }
  }

  return {
    today,
    soldToday,
    dailyTarget,
    pct,
    remaining: dailyTarget > 0 ? Math.max(0, r2(dailyTarget - soldToday)) : 0,
    projected,
    month: {
      label: `${MONTHS[mm - 1]} ${yy}`,
      sold: soldMonth,
      target: monthTarget,
      pct: monthTarget > 0 ? (soldMonth / monthTarget) * 100 : 0,
      daysInMonth,
      dayOfMonth,
      remainingDays,
      neededPerDay,
      projectedEnd,
      onTrack: monthTarget > 0 ? projectedEnd >= monthTarget : null,
    },
    streak,
  };
}

const KEY = "pt_sales_target";

export function cleanSettings(v: any): TargetSettings {
  const num = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 && n < 1e9 ? Math.round(n) : 0;
  };
  const h = Math.floor(Number(v?.dayStartHour));
  return {
    daily: num(v?.daily),
    monthly: num(v?.monthly),
    dayStartHour: Number.isFinite(h) && h >= 0 && h <= 8 ? h : DEFAULT_SETTINGS.dayStartHour,
  };
}

export function readSettings(): TargetSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return cleanSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: TargetSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cleanSettings(s)));
  } catch {
    // storage can be blocked; the choice is just not remembered
  }
}
