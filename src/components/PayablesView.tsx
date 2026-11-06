import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const KEY = "pt_payables";
const MAX_KEEP = 2000;
const METHODS = ["UPI", "Cash", "Bank", "Cheque"];
const MAX_AMOUNT_P = 99999999999;

type Filter = "unpaid" | "overdue" | "paid" | "all";

interface Pay {
  id: string;
  date: string;
  amountP: number;
  method: string;
}
interface Bill {
  id: string;
  date: string;
  due: string;
  supplier: string;
  ref: string;
  amountP: number;
  note: string;
  pays: Pay[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const localToday = () => {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
// Whole days from a to b (positive when b is later).
const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) => {
  if (!isRealDate(iso)) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

function cleanMoney(v: string): string {
  const t = v.replace(/[^\d.]/g, "");
  const i = t.indexOf(".");
  if (i === -1) return t.slice(0, 9);
  return `${t.slice(0, i).slice(0, 9)}.${t.slice(i + 1).replace(/\./g, "").slice(0, 2)}`;
}
function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function cell(v: string | number): string {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const paidOf = (b: Bill) => b.pays.reduce((s, p) => s + p.amountP, 0);
const dueOf = (b: Bill) => b.amountP - paidOf(b);

function cleanPay(v: any): Pay | null {
  if (!v || typeof v !== "object") return null;
  const date = String(v.date ?? "");
  const amountP = Number(v.amountP);
  if (!isRealDate(date) || !Number.isInteger(amountP) || amountP < 1 || amountP > MAX_AMOUNT_P) return null;
  return {
    id: String(v.id || newId()).slice(0, 40),
    date,
    amountP,
    method: METHODS.includes(v.method) ? String(v.method) : "Cash",
  };
}

function cleanBill(v: any): Bill | null {
  if (!v || typeof v !== "object") return null;
  const date = String(v.date ?? "");
  const due = String(v.due ?? "");
  const supplier = String(v.supplier ?? "").trim().slice(0, 60);
  const amountP = Number(v.amountP);
  if (!supplier || !isRealDate(date) || (due !== "" && !isRealDate(due))) return null;
  if (!Number.isInteger(amountP) || amountP < 1 || amountP > MAX_AMOUNT_P) return null;
  const pays: Pay[] = [];
  for (const p of Array.isArray(v.pays) ? v.pays : []) {
    const c = cleanPay(p);
    if (c) pays.push(c);
  }
  return {
    id: String(v.id || newId()).slice(0, 40),
    date,
    due,
    supplier,
    ref: String(v.ref ?? "").slice(0, 40),
    amountP,
    note: String(v.note ?? "").slice(0, 150),
    pays,
  };
}

function loadAll(): Bill[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: Bill[] = [];
    const seen = new Set<string>();
    for (const v of parsed) {
      const b = cleanBill(v);
      if (b && !seen.has(b.id)) {
        seen.add(b.id);
        out.push(b);
      }
    }
    return out.slice(0, MAX_KEEP);
  } catch {
    return [];
  }
}

// Saves the list and returns what was saved. Throws if the phone refuses to store it.
function persist(list: Bill[]): Bill[] {
  const capped = [...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_KEEP);
  localStorage.setItem(KEY, JSON.stringify(capped));
  return capped;
}

type State = "paid" | "overdue" | "soon" | "open";
function stateOf(b: Bill, today: string): State {
  if (dueOf(b) <= 0) return "paid";
  if (b.due && b.due < today) return "overdue";
  if (b.due && daysBetween(today, b.due) <= 7) return "soon";
  return "open";
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">Bills to pay could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { db } = useStore();
  const [list, setList] = useState<Bill[]>([]);
  const [today, setToday] = useState("");
  const [filter, setFilter] = useState<Filter>("unpaid");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [fDate, setFDate] = useState("");
  const [fDue, setFDue] = useState("");
  const [fSupplier, setFSupplier] = useState("");
  const [fRef, setFRef] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fNote, setFNote] = useState("");
  const [payFor, setPayFor] = useState("");
  const [payAmt, setPayAmt] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState("UPI");
  const [msg, setMsg] = useState("");

  // Saved bills are read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    const t = localToday();
    setToday(t);
    setFDate(t);
    setPayDate(t);
    setList(loadAll());
  }, []);

  function resetForm() {
    setEditingId("");
    setFDate(today);
    setFDue("");
    setFSupplier("");
    setFRef("");
    setFAmount("");
    setFNote("");
  }

  function onSave() {
    const supplier = fSupplier.trim();
    if (!supplier) {
      setMsg("Enter who the bill is from");
      return;
    }
    if (!isRealDate(fDate)) {
      setMsg("Pick a valid bill date");
      return;
    }
    if (fDue !== "" && !isRealDate(fDue)) {
      setMsg("The due date is not valid");
      return;
    }
    if (fDue !== "" && fDue < fDate) {
      setMsg("The due date cannot be before the bill date");
      return;
    }
    const amountP = paise(fAmount);
    if (!(amountP > 0) || amountP > MAX_AMOUNT_P) {
      setMsg("Enter the bill amount (more than 0)");
      return;
    }
    const editing = list.find((b) => b.id === editingId);
    if (editing && amountP < paidOf(editing)) {
      setMsg(`The amount cannot be less than what is already paid (${inr(paidOf(editing))})`);
      return;
    }
    const rec: Bill = {
      id: editingId || newId(),
      date: fDate,
      due: fDue,
      supplier: supplier.slice(0, 60),
      ref: fRef.trim().slice(0, 40),
      amountP,
      note: fNote.trim().slice(0, 150),
      pays: editing ? editing.pays : [],
    };
    const next = editingId ? list.map((b) => (b.id === editingId ? rec : b)) : [rec, ...list];
    try {
      setList(persist(next));
    } catch {
      setMsg("Could not save on this phone (storage is blocked or full). Nothing was changed.");
      return;
    }
    setMsg(editingId ? "Bill updated." : `Bill of ${inr(amountP)} saved for ${rec.supplier}.`);
    resetForm();
  }

  function onEdit(b: Bill) {
    setEditingId(b.id);
    setFDate(b.date);
    setFDue(b.due);
    setFSupplier(b.supplier);
    setFRef(b.ref);
    setFAmount(String(b.amountP / 100));
    setFNote(b.note);
    setMsg("");
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // ignore
    }
  }

  function onDelete(b: Bill) {
    if (!confirm(`Delete the bill of ${b.supplier} (${inr(b.amountP)}) and its payments?`)) return;
    try {
      setList(persist(list.filter((x) => x.id !== b.id)));
      if (editingId === b.id) resetForm();
      setMsg("Bill deleted.");
    } catch {
      setMsg("Could not save on this phone (storage is blocked). Nothing was changed.");
    }
  }

  function openPay(b: Bill) {
    setPayFor(payFor === b.id ? "" : b.id);
    setPayAmt(String(dueOf(b) / 100));
    setPayDate(today);
    setPayMethod("UPI");
    setMsg("");
  }

  function addPayment(b: Bill) {
    const amountP = paise(payAmt);
    if (!(amountP > 0)) {
      setMsg("Enter the amount paid");
      return;
    }
    if (amountP > dueOf(b)) {
      setMsg(`That is more than the ${inr(dueOf(b))} still to pay`);
      return;
    }
    if (!isRealDate(payDate)) {
      setMsg("Pick the payment date");
      return;
    }
    if (today && payDate > today) {
      setMsg("The payment date cannot be in the future");
      return;
    }
    const pay: Pay = { id: newId(), date: payDate, amountP, method: payMethod };
    try {
      setList(persist(list.map((x) => (x.id === b.id ? { ...x, pays: [...x.pays, pay] } : x))));
    } catch {
      setMsg("Could not save on this phone (storage is blocked). Nothing was changed.");
      return;
    }
    setMsg(`Payment of ${inr(amountP)} saved for ${b.supplier}.`);
    setPayFor("");
  }

  function deletePay(b: Bill, p: Pay) {
    if (!confirm(`Remove the payment of ${inr(p.amountP)} made on ${when(p.date)}?`)) return;
    try {
      setList(persist(list.map((x) => (x.id === b.id ? { ...x, pays: x.pays.filter((q) => q.id !== p.id) } : x))));
      setMsg("Payment removed.");
    } catch {
      setMsg("Could not save on this phone (storage is blocked). Nothing was changed.");
    }
  }

  function onCsv() {
    if (list.length === 0) {
      setMsg("No bill saved yet.");
      return;
    }
    const head = ["bill_date", "supplier", "bill_no", "amount", "paid", "to_pay", "due_date", "status", "note"];
    const label: Record<State, string> = { paid: "Paid", overdue: "Overdue", soon: "Due soon", open: "Open" };
    const rows = [...list]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((b) => [
        b.date,
        b.supplier,
        b.ref,
        (b.amountP / 100).toFixed(2),
        (paidOf(b) / 100).toFixed(2),
        (Math.max(0, dueOf(b)) / 100).toFixed(2),
        b.due,
        label[stateOf(b, today || localToday())],
        b.note,
      ]);
    const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-bills-to-pay-${localToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg(`${list.length} bill(s) downloaded.`);
    } catch {
      setMsg("The download did not work here.");
    }
  }

  const suppliers = useMemo(() => {
    const names = new Map<string, string>();
    const add = (n: any) => {
      const t = String(n ?? "").trim();
      if (t && !names.has(t.toLowerCase())) names.set(t.toLowerCase(), t);
    };
    for (const s of Array.isArray((db as any)?.suppliers) ? (db as any).suppliers : []) add(s?.name);
    for (const b of list) add(b.supplier);
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [db, list]);

  const summary = useMemo(() => {
    if (!today) return null;
    let unpaidP = 0;
    let overdueP = 0;
    let overdueN = 0;
    let soonP = 0;
    let paidMonthP = 0;
    const bySupplier = new Map<string, { name: string; dueP: number }>();
    const month = today.slice(0, 7);
    for (const b of list) {
      const d = dueOf(b);
      for (const p of b.pays) if (p.date.startsWith(month)) paidMonthP += p.amountP;
      if (d <= 0) continue;
      unpaidP += d;
      const st = stateOf(b, today);
      if (st === "overdue") {
        overdueP += d;
        overdueN += 1;
      } else if (st === "soon") {
        soonP += d;
      }
      const k = b.supplier.toLowerCase();
      const cur = bySupplier.get(k) ?? { name: b.supplier, dueP: 0 };
      cur.dueP += d;
      bySupplier.set(k, cur);
    }
    const customers: any[] = Array.isArray((db as any)?.customers) ? (db as any).customers : [];
    const owedToMeP = customers.reduce((s, c) => s + Math.max(0, paise(c?.currentBalance)), 0);
    const top = Array.from(bySupplier.values())
      .sort((a, b) => b.dueP - a.dueP)
      .slice(0, 5);
    return { unpaidP, overdueP, overdueN, soonP, paidMonthP, owedToMeP, top };
  }, [list, db, today]);

  const shown = useMemo(() => {
    if (!today) return [];
    const q = query.trim().toLowerCase();
    const rows = list.filter((b) => {
      const st = stateOf(b, today);
      if (filter === "unpaid" && st === "paid") return false;
      if (filter === "overdue" && st !== "overdue") return false;
      if (filter === "paid" && st !== "paid") return false;
      if (q && !(b.supplier.toLowerCase().includes(q) || b.ref.toLowerCase().includes(q))) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (filter === "unpaid" || filter === "overdue") {
        if (a.due && b.due) return a.due.localeCompare(b.due);
        if (a.due) return -1;
        if (b.due) return 1;
      }
      return b.date.localeCompare(a.date);
    });
    return rows;
  }, [list, today, filter, query]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Bills to pay</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Note the bills you have to pay (suppliers, gas, vegetables, electricity) with their due dates, and the payments
        you make against them. Nothing is paid or changed by itself. Bills are saved on this phone only (not in the
        cloud backup), so download the CSV now and then.
      </p>

      {summary && (
        <section className="rounded-md border p-3 text-sm space-y-1">
          <p className="font-medium">Total to pay: {inr(summary.unpaidP)}</p>
          <p className={summary.overdueN > 0 ? "text-destructive" : ""}>
            Overdue: {inr(summary.overdueP)} ({summary.overdueN} bill(s))
          </p>
          <p>Due in the next 7 days: {inr(summary.soonP)}</p>
          <p className="text-muted-foreground">Paid this month: {inr(summary.paidMonthP)}</p>
          <p className="text-muted-foreground">
            Customers owe you {inr(summary.owedToMeP)} | You owe {inr(summary.unpaidP)}
          </p>
          {summary.top.length > 0 && (
            <div className="pt-1">
              <p className="font-medium">Most owed to</p>
              {summary.top.map((s) => (
                <p key={s.name}>
                  {s.name} | {inr(s.dueP)}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3 rounded-md border p-3">
        <h2 className="font-medium">{editingId ? "Edit bill" : "New bill"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">From (supplier or shop)</span>
            <input
              className={`${input} w-full`}
              list="pt-pay-suppliers"
              maxLength={60}
              value={fSupplier}
              onChange={(e) => setFSupplier(e.target.value)}
            />
            <datalist id="pt-pay-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Bill amount</span>
            <input
              className={`${input} w-full`}
              inputMode="decimal"
              value={fAmount}
              onChange={(e) => setFAmount(cleanMoney(e.target.value))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Bill date</span>
            <input type="date" className={`${input} w-full`} value={fDate} onChange={(e) => setFDate(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Due date (optional)</span>
            <input type="date" className={`${input} w-full`} value={fDue} onChange={(e) => setFDue(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Bill number (optional)</span>
            <input className={`${input} w-full`} maxLength={40} value={fRef} onChange={(e) => setFRef(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Note (optional)</span>
            <input className={`${input} w-full`} maxLength={150} value={fNote} onChange={(e) => setFNote(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={btn} onClick={onSave}>
            {editingId ? "Save changes" : "Save bill"}
          </button>
          {editingId && (
            <button className="underline text-sm" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Show</span>
          <select className={`${input} w-full`} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="unpaid">Not fully paid</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Search supplier or bill number</span>
          <input className={`${input} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <button className="underline text-sm" onClick={onCsv}>
        Download bills (CSV)
      </button>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bill here.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((b) => {
            const st = stateOf(b, today);
            const d = dueOf(b);
            const dueText =
              st === "paid"
                ? "Paid"
                : st === "overdue"
                  ? `Overdue by ${daysBetween(b.due, today)} day(s)`
                  : b.due
                    ? daysBetween(today, b.due) === 0
                      ? "Due today"
                      : `Due in ${daysBetween(today, b.due)} day(s)`
                    : "No due date";
            return (
              <div key={b.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{b.supplier}</span>
                  <span className={st === "overdue" ? "font-medium text-destructive" : "font-medium"}>{dueText}</span>
                </div>
                <p>
                  Bill {inr(b.amountP)} | Paid {inr(paidOf(b))} |{" "}
                  <span className="font-medium">To pay {inr(Math.max(0, d))}</span>
                </p>
                <p className="text-muted-foreground">
                  {when(b.date)}
                  {b.due ? ` | due ${when(b.due)}` : ""}
                  {b.ref ? ` | ${b.ref}` : ""}
                  {b.note ? ` | ${b.note}` : ""}
                </p>
                {b.pays.length > 0 && (
                  <div className="space-y-1">
                    {b.pays.map((p) => (
                      <p key={p.id} className="text-muted-foreground">
                        Paid {inr(p.amountP)} on {when(p.date)} ({p.method}){" "}
                        <button className="underline" onClick={() => deletePay(b, p)}>
                          Remove
                        </button>
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  {d > 0 && (
                    <button className="underline" onClick={() => openPay(b)}>
                      Add payment
                    </button>
                  )}
                  <button className="underline" onClick={() => onEdit(b)}>
                    Edit
                  </button>
                  <button className="underline" onClick={() => onDelete(b)}>
                    Delete
                  </button>
                </div>
                {payFor === b.id && d > 0 && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Amount paid</span>
                        <input
                          className={`${input} w-full`}
                          inputMode="decimal"
                          value={payAmt}
                          onChange={(e) => setPayAmt(cleanMoney(e.target.value))}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Paid on</span>
                        <input
                          type="date"
                          className={`${input} w-full`}
                          value={payDate}
                          onChange={(e) => setPayDate(e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Method</span>
                        <select className={`${input} w-full`} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                          {METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex gap-3">
                      <button className={btn} onClick={() => addPayment(b)}>
                        Save payment
                      </button>
                      <button className="underline" onClick={() => setPayFor("")}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PayablesView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
