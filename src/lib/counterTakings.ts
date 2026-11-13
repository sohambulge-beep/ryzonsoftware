// Day totals of the liquor counter, built from the slips kept on this phone.
const SLIPS_KEY = "taptrack_recent_slips";
const DAYS_KEY = "pt_counter_days";
const SEEN_KEY = "pt_counter_seen";
const MAX_SEEN = 3000;

export const TAKINGS_EVENT = "pt-counter-takings";

// All money is in paise (whole numbers).
export interface DayTotals {
  n: number; // slips counted
  cancelled: number; // slips cancelled after they were counted
  cash: number;
  upi: number;
  card: number;
  tab: number;
}
export type DayMap = Record<string, DayTotals>;
type ModeKey = "cash" | "upi" | "card" | "tab";
// "ok" = the slip was added to its day, "x" = it must not be added (cancelled, or cleared)
type SeenMap = Record<string, "ok" | "x">;

const emptyDay = (): DayTotals => ({ n: 0, cancelled: 0, cash: 0, upi: 0, card: 0, tab: 0 });
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);

export const totalOf = (d: DayTotals) => d.cash + d.upi + d.card + d.tab;
export const receivedOf = (d: DayTotals) => d.cash + d.upi + d.card;

function modeKey(mode: string): ModeKey {
  const k = mode.trim().toLowerCase();
  if (k === "upi") return "upi";
  if (k === "card") return "card";
  if (k === "tab") return "tab";
  return "cash";
}

export function readDays(): DayMap {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    const p: any = raw ? JSON.parse(raw) : null;
    const out: DayMap = {};
    if (p && typeof p === "object" && !Array.isArray(p)) {
      for (const [date, v] of Object.entries<any>(p)) {
        if (!isDate(date) || !v || typeof v !== "object") continue;
        out[date] = {
          n: num(v.n),
          cancelled: num(v.cancelled),
          cash: num(v.cash),
          upi: num(v.upi),
          card: num(v.card),
          tab: num(v.tab),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function readSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const p: any = raw ? JSON.parse(raw) : null;
    const out: SeenMap = {};
    if (p && typeof p === "object" && !Array.isArray(p)) {
      for (const [k, v] of Object.entries<any>(p)) {
        if (v === "ok" || v === "x") out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(days: DayMap, seen: SeenMap): boolean {
  try {
    const keys = Object.keys(seen);
    let keep: SeenMap = seen;
    if (keys.length > MAX_SEEN) {
      keep = {};
      for (const k of keys.slice(keys.length - MAX_SEEN)) keep[k] = seen[k] as "ok" | "x";
    }
    localStorage.setItem(DAYS_KEY, JSON.stringify(days));
    localStorage.setItem(SEEN_KEY, JSON.stringify(keep));
    try {
      window.dispatchEvent(new Event(TAKINGS_EVENT));
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}

function apply(days: DayMap, date: string, mode: string, amountP: number, sign: 1 | -1) {
  const d = days[date] ?? emptyDay();
  const k = modeKey(mode);
  d[k] += sign * amountP;
  d.n += sign;
  if (sign === -1) d.cancelled += 1;
  days[date] = d;
}

// Looks at the slips on this phone and adds the new ones to their day. A slip cancelled later is taken off again.
// Returns how many slips changed the numbers.
export function runCounterTakingsCheck(): number {
  let slips: any[] = [];
  try {
    const raw = localStorage.getItem(SLIPS_KEY);
    const p = raw ? JSON.parse(raw) : [];
    slips = Array.isArray(p) ? p : [];
  } catch {
    return 0;
  }
  if (slips.length === 0) return 0;

  const days = readDays();
  const seen = readSeen();
  let changed = 0;
  for (const s of slips) {
    if (
      !s ||
      typeof s.no !== "string" ||
      typeof s.when !== "string" ||
      typeof s.mode !== "string" ||
      typeof s.totalP !== "number" ||
      !Number.isFinite(s.totalP)
    ) {
      continue;
    }
    const date = s.when.slice(0, 10);
    if (!isDate(date)) continue;
    const id = `${s.no}|${s.when}`;
    const state = seen[id];
    const cancelled = s.cancelled === true;
    if (state === undefined) {
      if (cancelled) {
        seen[id] = "x"; // it was cancelled before it was ever counted
      } else {
        apply(days, date, s.mode, Math.round(s.totalP), 1);
        seen[id] = "ok";
      }
      changed += 1;
    } else if (state === "ok" && cancelled) {
      apply(days, date, s.mode, Math.round(s.totalP), -1);
      seen[id] = "x";
      changed += 1;
    }
  }
  if (changed > 0 && !writeAll(days, seen)) return 0;
  return changed;
}

// Clears the numbers. The slips on this phone are marked so they are not counted again.
export function resetTakings(): boolean {
  const seen: SeenMap = {};
  try {
    const raw = localStorage.getItem(SLIPS_KEY);
    const p = raw ? JSON.parse(raw) : [];
    if (Array.isArray(p)) {
      for (const s of p) {
        if (s && typeof s.no === "string" && typeof s.when === "string") seen[`${s.no}|${s.when}`] = "x";
      }
    }
  } catch {
    // ignore
  }
  return writeAll({}, seen);
}
