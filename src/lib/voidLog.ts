// The record of cancelled (void) bills, kept on this phone.

export interface VoidEntry {
  id: string;
  invoiceNo: string;
  at: string;
  reason: string;
  by: string;
  total: number;
  paymentMethod: string;
  customerName: string;
  local: boolean; // true when the bill was cancelled on this phone
}

export const VOID_EVENT = "pt-void-log";

const KEY = "pt_void_log";
const MAX = 500;
const SESSION_KEY = "pt-cloud-backup-auth";

function clean(v: any): VoidEntry | null {
  if (!v || typeof v !== "object" || typeof v.id !== "string" || !v.id) return null;
  return {
    id: v.id.slice(0, 80),
    invoiceNo: String(v.invoiceNo ?? "").slice(0, 60),
    at: String(v.at ?? ""),
    reason: String(v.reason ?? "").slice(0, 200),
    by: String(v.by ?? "").slice(0, 80),
    total: Number(v.total) || 0,
    paymentMethod: String(v.paymentMethod ?? "").slice(0, 30),
    customerName: String(v.customerName ?? "").slice(0, 100),
    local: v.local === true,
  };
}

// Newest first.
export function readVoidLog(): VoidEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: VoidEntry[] = [];
    for (const v of parsed) {
      const c = clean(v);
      if (c) out.push(c);
    }
    return out;
  } catch {
    return [];
  }
}

// Returns false if the phone refused to keep the record. A record that is already there counts as saved.
export function addVoidEntry(e: VoidEntry): boolean {
  try {
    const list = readVoidLog();
    if (list.some((x) => x.id === e.id)) return true;
    list.unshift(e);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    try {
      window.dispatchEvent(new Event(VOID_EVENT));
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}

// The email of the login saved on this phone (empty if there is none).
export function whoAmI(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const p = raw ? JSON.parse(raw) : null;
    const email = p?.user?.email ?? p?.currentSession?.user?.email;
    return typeof email === "string" ? email.slice(0, 80) : "";
  } catch {
    return "";
  }
}
