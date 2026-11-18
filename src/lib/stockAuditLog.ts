// Physical stock audit for taps/kegs: compare the litres really left in each keg with what the software says.
// Records are kept on this phone (same idea as voidLog.ts).

import type { Tap } from "../types";

export interface AuditRow {
  tapId: string;
  tapName: string;
  systemL: number;
  actualL: number;
  diffL: number; // actual - system (negative = shortage)
  costValue: number; // diffL x cost per litre (negative = loss)
  pints: number; // diffL expressed in pints (0.5 L each, same as the POS)
}

export interface StockAuditEntry {
  id: string;
  at: string;
  by: string;
  note: string;
  adjusted: boolean; // true if stock in the app was set to the counted litres
  rows: AuditRow[];
  netCostValue: number;
}

export const AUDIT_EVENT = "pt-stock-audit-log";
const KEY = "pt_stock_audits";
const MAX = 200;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

// Works out the difference for every tap that was counted. Blank boxes are skipped.
// Returns an error text if any typed value is not a valid number.
export function buildAuditRows(
  taps: Tap[],
  inputs: Record<string, string>
): { rows: AuditRow[]; error: string } {
  const rows: AuditRow[] = [];
  for (const t of taps) {
    const raw = (inputs[t.id] ?? "").trim().replace(",", ".");
    if (raw === "") continue;
    const actual = Number(raw);
    if (!Number.isFinite(actual) || actual < 0 || actual > 10000) {
      return { rows: [], error: `Tap #${t.tapNumber} ${t.name}: please enter litres as a number (0 or more).` };
    }
    const systemL = Number(t.currentLiters) || 0;
    const diffL = r3(actual - systemL);
    rows.push({
      tapId: t.id,
      tapName: t.name,
      systemL: r3(systemL),
      actualL: r3(actual),
      diffL,
      costValue: r2(diffL * (Number(t.costPerLiter) || 0)),
      pints: r2(diffL / 0.5),
    });
  }
  return { rows, error: "" };
}

function clean(v: any): StockAuditEntry | null {
  if (!v || typeof v !== "object" || typeof v.id !== "string" || !v.id) return null;
  const rows: AuditRow[] = Array.isArray(v.rows)
    ? v.rows
        .filter((r: any) => r && typeof r === "object")
        .map((r: any) => ({
          tapId: String(r.tapId ?? "").slice(0, 80),
          tapName: String(r.tapName ?? "").slice(0, 100),
          systemL: Number(r.systemL) || 0,
          actualL: Number(r.actualL) || 0,
          diffL: Number(r.diffL) || 0,
          costValue: Number(r.costValue) || 0,
          pints: Number(r.pints) || 0,
        }))
    : [];
  return {
    id: v.id.slice(0, 80),
    at: String(v.at ?? ""),
    by: String(v.by ?? "").slice(0, 80),
    note: String(v.note ?? "").slice(0, 200),
    adjusted: v.adjusted === true,
    rows,
    netCostValue: Number(v.netCostValue) || 0,
  };
}

// Newest first.
export function readAuditLog(): StockAuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: StockAuditEntry[] = [];
    for (const v of parsed) {
      const c = clean(v);
      if (c) out.push(c);
    }
    return out;
  } catch {
    return [];
  }
}

// Returns false if the phone refused to keep the record.
export function addAuditEntry(e: StockAuditEntry): boolean {
  try {
    const list = readAuditLog();
    if (list.some((x) => x.id === e.id)) return true;
    list.unshift(e);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    try {
      window.dispatchEvent(new Event(AUDIT_EVENT));
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}
