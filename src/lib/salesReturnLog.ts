// The record of items returned by customers (credit notes), kept on this phone.
// Same idea as voidLog.ts: the record is saved FIRST, and only then does the bill change.

export interface ReturnLine {
  beerId: string;
  beerName: string;
  qty: number;
  unitPrice: number;
  amount: number; // pre-tax value of the returned qty
}

export interface SalesReturnEntry {
  id: string;
  creditNoteNo: string;
  invoiceId: string;
  invoiceNo: string;
  at: string;
  reason: string;
  by: string;
  customerName: string;
  paymentMethod: string; // payment method of the ORIGINAL bill
  lines: ReturnLine[];
  refundTotal: number; // tax included
}

export const RETURN_EVENT = "pt-sales-return-log";

const KEY = "pt_sales_returns";
const MAX = 500;

function clean(v: any): SalesReturnEntry | null {
  if (!v || typeof v !== "object" || typeof v.id !== "string" || !v.id) return null;
  const lines: ReturnLine[] = Array.isArray(v.lines)
    ? v.lines
        .filter((l: any) => l && typeof l === "object")
        .map((l: any) => ({
          beerId: String(l.beerId ?? "").slice(0, 80),
          beerName: String(l.beerName ?? "").slice(0, 100),
          qty: Number(l.qty) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          amount: Number(l.amount) || 0,
        }))
    : [];
  return {
    id: v.id.slice(0, 80),
    creditNoteNo: String(v.creditNoteNo ?? "").slice(0, 40),
    invoiceId: String(v.invoiceId ?? "").slice(0, 80),
    invoiceNo: String(v.invoiceNo ?? "").slice(0, 60),
    at: String(v.at ?? ""),
    reason: String(v.reason ?? "").slice(0, 200),
    by: String(v.by ?? "").slice(0, 80),
    customerName: String(v.customerName ?? "").slice(0, 100),
    paymentMethod: String(v.paymentMethod ?? "").slice(0, 30),
    lines,
    refundTotal: Number(v.refundTotal) || 0,
  };
}

// Newest first.
export function readReturnLog(): SalesReturnEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: SalesReturnEntry[] = [];
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
export function addReturnEntry(e: SalesReturnEntry): boolean {
  try {
    const list = readReturnLog();
    if (list.some((x) => x.id === e.id)) return true;
    list.unshift(e);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    try {
      window.dispatchEvent(new Event(RETURN_EVENT));
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}
