import type { Invoice } from '@/types';
import type { VoidEntry } from '@/lib/voidLog';
import type { SalesReturnEntry } from '@/lib/salesReturnLog';

// "Leakage watch": where money slips away on a bar counter. It only reads what is already saved
// (cancelled bills, returns and discounts) and adds it up. It never changes a bill.

export type LeakageKind = 'void' | 'return' | 'discount' | 'free';
export type PeriodId = 'today' | '7d' | '30d' | 'all';

/** A staff login is flagged when it has this many cancelled bills in the period. */
export const MANY_VOIDS = 3;
/** The name shown when a record has no login saved. */
export const UNKNOWN_STAFF = 'Unknown login';

export interface LeakageEvent {
  kind: LeakageKind;
  at: string;
  by: string;
  invoiceNo: string;
  amount: number;
  reason: string;
}

export interface StaffRow {
  by: string;
  voids: number;
  voidAmount: number;
  returns: number;
  returnAmount: number;
  discounts: number;
  discountAmount: number;
  free: number;
  total: number;
  watch: string[];
}

export interface LeakageReport {
  netSales: number;
  voidCount: number;
  voidAmount: number;
  returnCount: number;
  returnAmount: number;
  discountCount: number;
  discountAmount: number;
  freeCount: number;
  leakageAmount: number;
  /** Leakage as a percent of what the sales would have been without it. Null when there are no sales and no leakage. */
  leakagePct: number | null;
  staff: StaffRow[];
  events: LeakageEvent[];
}

const toPaise = (n: number): number => Math.round(((Number(n) || 0) + Number.EPSILON) * 100);

/** The start of the period (local time). Null means "from the beginning". */
export function periodStart(period: PeriodId, now: Date): Date | null {
  if (period === 'all') return null;
  const days = period === 'today' ? 1 : period === '7d' ? 7 : 30;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function inPeriod(iso: string, start: Date | null, now: Date): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (t > now.getTime() + 60_000) return false;
  return start === null || t >= start.getTime();
}

const nameOf = (by: string): string => (by && by.trim() ? by.trim() : UNKNOWN_STAFF);

export function buildLeakageReport(input: {
  voids: VoidEntry[];
  returns: SalesReturnEntry[];
  invoices: Invoice[];
  period: PeriodId;
  now?: Date;
}): LeakageReport {
  const now = input.now ?? new Date();
  const start = periodStart(input.period, now);

  const events: LeakageEvent[] = [];
  const staff = new Map<string, StaffRow>();
  const rowFor = (by: string): StaffRow => {
    const key = nameOf(by);
    let r = staff.get(key);
    if (!r) {
      r = { by: key, voids: 0, voidAmount: 0, returns: 0, returnAmount: 0, discounts: 0, discountAmount: 0, free: 0, total: 0, watch: [] };
      staff.set(key, r);
    }
    return r;
  };

  let voidPaise = 0;
  let voidCount = 0;
  for (const v of input.voids) {
    if (!inPeriod(v.at, start, now)) continue;
    const r = rowFor(v.by);
    r.voids += 1;
    r.voidAmount += toPaise(v.total);
    voidCount += 1;
    voidPaise += toPaise(v.total);
    events.push({ kind: 'void', at: v.at, by: nameOf(v.by), invoiceNo: v.invoiceNo, amount: v.total, reason: v.reason });
  }

  let returnPaise = 0;
  let returnCount = 0;
  for (const x of input.returns) {
    if (!inPeriod(x.at, start, now)) continue;
    const r = rowFor(x.by);
    r.returns += 1;
    r.returnAmount += toPaise(x.refundTotal);
    returnCount += 1;
    returnPaise += toPaise(x.refundTotal);
    events.push({ kind: 'return', at: x.at, by: nameOf(x.by), invoiceNo: x.invoiceNo, amount: x.refundTotal, reason: x.reason });
  }

  let discountPaise = 0;
  let discountCount = 0;
  let freeCount = 0;
  let salesPaise = 0;
  for (const inv of input.invoices) {
    if (!inPeriod(inv.timestamp, start, now)) continue;
    salesPaise += toPaise(inv.total);
    const d = Number(inv.discount) || 0;
    if (d <= 0) continue;
    const free = toPaise(inv.total) <= 0;
    const r = rowFor(inv.discountBy ?? '');
    r.discounts += 1;
    r.discountAmount += toPaise(d);
    if (free) {
      r.free += 1;
      freeCount += 1;
    }
    discountCount += 1;
    discountPaise += toPaise(d);
    events.push({
      kind: free ? 'free' : 'discount',
      at: inv.timestamp,
      by: nameOf(inv.discountBy ?? ''),
      invoiceNo: inv.invoiceNo,
      amount: d,
      reason: inv.discountReason ?? '',
    });
  }

  const rows: StaffRow[] = [];
  for (const r of staff.values()) {
    const total = r.voidAmount + r.returnAmount + r.discountAmount;
    const watch: string[] = [];
    if (r.free > 0) watch.push(`${r.free} free bill${r.free > 1 ? 's' : ''} (100% discount)`);
    if (r.voids >= MANY_VOIDS) watch.push(`${r.voids} cancelled bills`);
    rows.push({
      ...r,
      voidAmount: r.voidAmount / 100,
      returnAmount: r.returnAmount / 100,
      discountAmount: r.discountAmount / 100,
      total: total / 100,
      watch,
    });
  }
  rows.sort((a, b) => b.total - a.total || b.voids - a.voids || a.by.localeCompare(b.by));

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const leakagePaise = voidPaise + returnPaise + discountPaise;
  const grossPaise = salesPaise + leakagePaise;

  return {
    netSales: salesPaise / 100,
    voidCount,
    voidAmount: voidPaise / 100,
    returnCount,
    returnAmount: returnPaise / 100,
    discountCount,
    discountAmount: discountPaise / 100,
    freeCount,
    leakageAmount: leakagePaise / 100,
    leakagePct: grossPaise > 0 ? (leakagePaise / grossPaise) * 100 : null,
    staff: rows,
    events,
  };
}
