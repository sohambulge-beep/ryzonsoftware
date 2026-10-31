import * as dataModule from "../data";

// Looked up by name at run time, so a missing export can never break the build.
const FN_NAMES = { load: "loadState", save: "saveState" };
const CHECKED_KEY = "pt_fresh_checked";
const SAFETY_KEY = "pt_wipe_safety";
// Lists of business records. Anything else (settings, plan and so on) is left alone.
const LISTS = ["taps", "customers", "invoices", "payments", "expenses", "purchases", "suppliers", "kegs"];
const NOTE_KEYS = [
  "pt_cash_closings",
  "pt_bookings",
  "pt_wastage_log",
  "pt_club_redeemed",
  "pt_udhaar_reminded",
  "pt_alerts_reviewed",
];
const SYNC_PREFIXES = ["pt_bill_sync_map:", "pt_stock_sync_map:", "pt_sync_review:"];
const DEMO_NAMES = ["elena rostova", "liam o'connor", "michael vance"];

export interface Counts {
  bills: number;
  customers: number;
  taps: number;
  expenses: number;
  payments: number;
}

function fns(): { load: () => any; save: ((s: any) => void) | null } {
  const mod: any = dataModule;
  const load = mod[FN_NAMES.load];
  if (typeof load !== "function") throw new Error("The app data could not be read.");
  const save = mod[FN_NAMES.save];
  return { load, save: typeof save === "function" ? save : null };
}

export function countData(): Counts {
  const db = fns().load();
  const n = (k: string) => (Array.isArray(db?.[k]) ? db[k].length : 0);
  return {
    bills: n("invoices"),
    customers: n("customers"),
    taps: n("taps"),
    expenses: n("expenses"),
    payments: n("payments"),
  };
}

// True only when the data is exactly the sample data the app comes with.
function isPristineDemo(db: any): boolean {
  const customers: any[] = Array.isArray(db?.customers) ? db.customers : [];
  const names = customers
    .map((c) => String(c?.name ?? "").replace(/\u2019/g, "'").trim().toLowerCase())
    .sort();
  if (names.length !== DEMO_NAMES.length) return false;
  if (!names.every((n, i) => n === DEMO_NAMES[i])) return false;
  const bills = Array.isArray(db?.invoices) ? db.invoices.length : -1;
  const exp = Array.isArray(db?.expenses) ? db.expenses.length : -1;
  return bills === 3 && exp === 3;
}

function emptied(db: any): any {
  const copy = JSON.parse(JSON.stringify(db));
  for (const k of LISTS) if (Array.isArray(copy[k])) copy[k] = [];
  return copy;
}

function isEmpty(db: any): boolean {
  return LISTS.every((k) => !Array.isArray(db?.[k]) || db[k].length === 0);
}

function removeSyncKeys() {
  try {
    const kill: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && SYNC_PREFIXES.some((p) => k.startsWith(p))) kill.push(k);
    }
    kill.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export function hasSafety(): boolean {
  try {
    return !!localStorage.getItem(SAFETY_KEY);
  } catch {
    return false;
  }
}

// Empties bills, customers, stock, expenses and so on on this phone. Keeps a safety copy first.
export function wipeNow(alsoNotes: boolean): void {
  const f = fns();
  const save = f.save;
  if (!save) throw new Error("This version of the app cannot clear data by itself.");
  const original = f.load();
  const before = JSON.stringify(original);
  try {
    localStorage.setItem(SAFETY_KEY, before);
  } catch {
    throw new Error("Could not make a safety copy on this phone, so nothing was cleared.");
  }
  const next = emptied(original);
  save(next);
  if (!isEmpty(f.load())) {
    try {
      save(JSON.parse(before));
    } catch {
      // ignore
    }
    throw new Error("The data could not be cleared safely, so nothing was changed.");
  }
  if (alsoNotes) {
    for (const k of NOTE_KEYS) {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
  }
  removeSyncKeys();
  setTimeout(() => {
    try {
      if (!isEmpty(f.load())) save(next); // the app wrote its old copy back; put the empty one again
    } catch {
      // ignore
    }
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  }, 600);
}

// Brings back the data that was on this phone just before the last clear.
export function restoreSafety(): void {
  const f = fns();
  const save = f.save;
  if (!save) throw new Error("This version of the app cannot restore data by itself.");
  const raw = localStorage.getItem(SAFETY_KEY);
  if (!raw) throw new Error("There is no saved copy to bring back.");
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The saved copy is damaged.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("The saved copy is damaged.");
  save(parsed);
  const check = f.load();
  const len = (o: any, k: string) => (Array.isArray(o?.[k]) ? o[k].length : 0);
  if (len(check, "invoices") !== len(parsed, "invoices") || len(check, "customers") !== len(parsed, "customers")) {
    throw new Error("The data could not be brought back. Use Cloud backup restore instead.");
  }
  try {
    localStorage.removeItem(SAFETY_KEY);
  } catch {
    // ignore
  }
  setTimeout(() => {
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  }, 600);
}

// For a brand new phone: if the data is still the untouched sample, empty it once.
export function autoFreshCheck(): boolean {
  try {
    if (localStorage.getItem(CHECKED_KEY)) return false;
    localStorage.setItem(CHECKED_KEY, "1"); // set first, so this check can never repeat or loop
  } catch {
    return false;
  }
  const f = fns();
  if (!isPristineDemo(f.load())) return false;
  wipeNow(false);
  return true;
}
