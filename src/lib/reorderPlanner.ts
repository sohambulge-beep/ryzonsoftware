import type { Invoice, Supplier, Tap } from "@/types";

// Works out how fast each keg is selling, when it will run out, and how many kegs to order.
// It only reads your sales. It never changes any data.

export interface PlannerSettings {
  windowDays: number; // how many past days of sales to look at
  coverDays: number; // how many days of stock you want to have after the order arrives
  leadDays: number; // how many days the supplier takes to deliver
}

export const DEFAULT_SETTINGS: PlannerSettings = { windowDays: 14, coverDays: 10, leadDays: 2 };

export type Urgency = "urgent" | "soon" | "ok" | "nosales";

export interface PlanRow {
  tap: Tap;
  soldL: number;
  perDay: number; // litres sold per day
  daysLeft: number | null; // null when nothing was sold
  runOut: Date | null;
  urgency: Urgency;
  kegL: number; // litres in one keg (the tap's capacity)
  kegs: number; // kegs to order (0 when no order is needed)
  needL: number;
  cost: number;
  supplierName: string;
  supplierPhone: string;
}

const DAY = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

const rank: Record<Urgency, number> = { urgent: 0, soon: 1, ok: 2, nosales: 3 };

export function computePlan(
  taps: Tap[],
  invoices: Invoice[],
  suppliers: Supplier[],
  settings: PlannerSettings,
  now: Date = new Date()
): { rows: PlanRow[]; activeDays: number; hasSales: boolean } {
  const nowMs = now.getTime();
  const cutoff = nowMs - settings.windowDays * DAY;

  // If the software is new, only count the days that really had a chance to sell.
  let firstMs = Infinity;
  for (const inv of invoices) {
    const t = new Date(inv.timestamp).getTime();
    if (Number.isFinite(t) && t < firstMs) firstMs = t;
  }
  const daysSinceFirst = Number.isFinite(firstMs) ? Math.max(1, Math.ceil((nowMs - firstMs) / DAY)) : settings.windowDays;
  const activeDays = Math.max(1, Math.min(settings.windowDays, daysSinceFirst));

  const sold = new Map<string, number>();
  let hasSales = false;
  for (const inv of invoices) {
    const t = new Date(inv.timestamp).getTime();
    if (!Number.isFinite(t) || t < cutoff || t > nowMs + DAY) continue;
    for (const it of inv.items) {
      const l = Number(it.litersTotal) || 0;
      if (l <= 0) continue;
      sold.set(it.beerId, (sold.get(it.beerId) ?? 0) + l);
      hasSales = true;
    }
  }

  const rows: PlanRow[] = taps.map((tap) => {
    const level = Math.max(0, Number(tap.currentLiters) || 0);
    const soldL = sold.get(tap.id) ?? 0;
    const perDay = soldL / activeDays;
    const kegL = Math.max(0, Number(tap.capacityLiters) || 0);
    const sup = suppliers.find((s) => s.id === tap.supplierId);

    let urgency: Urgency;
    let daysLeft: number | null = null;
    let needL = 0;

    if (perDay > 0) {
      daysLeft = level / perDay;
      urgency = daysLeft <= settings.leadDays ? "urgent" : daysLeft <= settings.leadDays + 3 ? "soon" : "ok";
      if (urgency !== "ok") needL = Math.max(0, perDay * (settings.coverDays + settings.leadDays) - level);
    } else if (level <= 0) {
      urgency = "urgent";
      needL = kegL; // empty keg and no recent sales: one keg is the least that makes sense
    } else {
      urgency = "nosales";
    }

    const kegs = needL > 0 && kegL > 0 ? Math.ceil(needL / kegL) : 0;
    return {
      tap,
      soldL: r1(soldL),
      perDay: r2(perDay),
      daysLeft: daysLeft === null ? null : r1(daysLeft),
      runOut: daysLeft === null ? null : new Date(nowMs + daysLeft * DAY),
      urgency,
      kegL,
      kegs,
      needL: r1(needL),
      cost: r2(kegs * kegL * (Number(tap.costPerLiter) || 0)),
      supplierName: sup?.name ?? "",
      supplierPhone: sup?.phone ?? "",
    };
  });

  rows.sort((a, b) => rank[a.urgency] - rank[b.urgency] || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  return { rows, activeDays, hasSales };
}

export interface SupplierOrder {
  key: string;
  supplierName: string;
  phone: string;
  lines: { name: string; kegs: number; kegL: number }[];
  cost: number;
  message: string;
}

// One order message per supplier, for the taps that need kegs.
export function buildSupplierOrders(rows: PlanRow[], barName: string): SupplierOrder[] {
  const groups = new Map<string, PlanRow[]>();
  for (const r of rows) {
    if (r.kegs <= 0) continue;
    const key = r.tap.supplierId || "none";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: SupplierOrder[] = [];
  for (const [key, list] of groups) {
    const supplierName = list[0].supplierName;
    const lines = list.map((r) => ({ name: r.tap.name, kegs: r.kegs, kegL: r.kegL }));
    const body = lines.map((l) => `- ${l.name}: ${l.kegs} keg (${l.kegL} L each)`).join("\n");
    const hello = supplierName ? `Namaste ${supplierName},` : "Namaste,";
    const sign = barName.trim() ? `\n${barName.trim()}` : "";
    out.push({
      key,
      supplierName,
      phone: list[0].supplierPhone,
      lines,
      cost: r2(list.reduce((s, r) => s + r.cost, 0)),
      message: `${hello}\nMujhe ye kegs chahiye:\n${body}\nKripya jaldi bhej dein. Dhanyavad.${sign}`,
    });
  }
  return out;
}

const KEY = "pt_reorder_settings";

function pick(v: unknown, allowed: number[], fallback: number): number {
  const n = Number(v);
  return allowed.includes(n) ? n : fallback;
}

export const WINDOW_OPTIONS = [7, 14, 30];
export const COVER_OPTIONS = [7, 10, 14, 21];
export const LEAD_OPTIONS = [1, 2, 3, 5];

export function readSettings(): PlannerSettings {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : {};
    return {
      windowDays: pick(p.windowDays, WINDOW_OPTIONS, DEFAULT_SETTINGS.windowDays),
      coverDays: pick(p.coverDays, COVER_OPTIONS, DEFAULT_SETTINGS.coverDays),
      leadDays: pick(p.leadDays, LEAD_OPTIONS, DEFAULT_SETTINGS.leadDays),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: PlannerSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage can be blocked; the choice is just not remembered
  }
}
