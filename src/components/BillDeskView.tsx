import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";
import { VOID_EVENT, readVoidLog, type VoidEntry } from "@/lib/voidLog";
import { readCachedGstSettings } from "@/lib/gst";
import { useOwnerAccess } from "@/lib/ownerAccess";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const PAPER_KEY = "pt_receipt_mm";
const SHOW_MAX = 40;
const MAX_URL = 1900;
const REASONS = ["Wrong item", "Customer changed mind", "Duplicate bill", "Price mistake", "Other"];

// On screen the receipt is hidden. When printing, only the receipt is shown.
const printCss = `
#pt-receipt { display: none; }
@media print {
  body * { visibility: hidden; }
  #pt-receipt, #pt-receipt * { visibility: visible; color: #000 !important; background: #fff !important; }
  #pt-receipt { display: block; position: absolute; left: 0; top: 0; }
  @page { margin: 3mm; }
}
`;

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const localToday = () => {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const shiftDays = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const whenLong = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Turns what is saved into a WhatsApp number (country code 91, digits only). Empty if not valid.
function waNumber(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return "";
}

function cell(v: string | number): string {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + w).length > width) {
      out.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) out.push(line);
  return out;
}

interface Head {
  name: string;
  address: string;
  gstin: string;
}

// cols = number of characters per line for a receipt; null = a plain message for WhatsApp.
function buildBill(inv: any, head: Head, cur: string, cols: number | null): string {
  const L: string[] = [];
  const m = (n: any) => `${cur}${inr(paise(n))}`;
  const row = (l: string, r: string) =>
    cols ? l + " ".repeat(Math.max(1, cols - l.length - r.length)) + r : `${l}: ${r}`;
  const rule = cols ? "-".repeat(cols) : "--------------------";

  if (head.name) L.push(...(cols ? wrap(head.name, cols) : [head.name]));
  if (head.address) L.push(...(cols ? wrap(head.address, cols) : [head.address]));
  if (head.gstin) L.push(`GSTIN: ${head.gstin}`);
  L.push(rule);
  L.push(row("Bill", String(inv?.invoiceNo ?? "")));
  L.push(row("Date", whenLong(String(inv?.timestamp ?? ""))));
  L.push(row("Customer", String(inv?.customerName || "Walk-in Guest")));
  L.push(rule);
  for (const it of Array.isArray(inv?.items) ? inv.items : []) {
    const name = String(it?.beerName ?? "Item");
    const qty = Number(it?.qty) || 0;
    if (cols) {
      L.push(...wrap(name, cols));
      L.push(row(`  ${qty} x ${inr(paise(it?.unitPrice))}`, inr(paise(it?.total))));
    } else {
      L.push(`${name} x${qty} = ${m(it?.total)}`);
    }
  }
  L.push(rule);
  const g: any = inv?.gst;
  if (g && typeof g === "object") {
    L.push(row("Taxable value", m(g.taxableTotal)));
    if (paise(g.cgstTotal) > 0) L.push(row("CGST", m(g.cgstTotal)));
    if (paise(g.sgstTotal) > 0) L.push(row("SGST", m(g.sgstTotal)));
    if (paise(g.igstTotal) > 0) L.push(row("IGST", m(g.igstTotal)));
    if (g.buyerGstin) L.push(row("Buyer GSTIN", String(g.buyerGstin)));
  } else {
    L.push(row("Subtotal", m(inv?.subtotal)));
    L.push(row("Tax", m(inv?.tax)));
  }
  L.push(row("TOTAL", m(inv?.total)));
  L.push(row("Paid", m(inv?.paidAmount)));
  if (paise(inv?.balanceDue) > 0) L.push(row("Balance due", m(inv?.balanceDue)));
  L.push(row("Payment", String(inv?.paymentMethod ?? "")));
  L.push(rule);
  L.push("Thank you! Visit again.");
  return L.join("\n");
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">Bill desk could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { db, voidInvoice } = useStore();
  const { isOwner } = useOwnerAccess();
  const [today, setToday] = useState("");
  const [period, setPeriod] = useState("today");
  const [query, setQuery] = useState("");
  const [paper, setPaper] = useState(58);
  const [head, setHead] = useState<Head>({ name: "", address: "", gstin: "" });
  const [job, setJob] = useState<{ inv: any; n: number } | null>(null);
  const [voidFor, setVoidFor] = useState("");
  const [reasonSel, setReasonSel] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [voids, setVoids] = useState<VoidEntry[]>([]);
  const [msg, setMsg] = useState("");

  const bar = String(db.settings?.barName ?? "").trim();
  const cur = String(db.settings?.currency ?? "₹");
  const cols = paper === 80 ? 42 : 30;

  // Saved choices are read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setToday(localToday());
    try {
      const p = Number(localStorage.getItem(PAPER_KEY));
      if (p === 58 || p === 80) setPaper(p);
    } catch {
      // ignore
    }
    setVoids(readVoidLog());
    const h = () => setVoids(readVoidLog());
    window.addEventListener(VOID_EVENT, h);
    return () => window.removeEventListener(VOID_EVENT, h);
  }, []);

  useEffect(() => {
    let name = bar;
    let address = "";
    let gstin = "";
    try {
      const s: any = readCachedGstSettings();
      name = String(s?.tradeName || s?.legalName || bar || "");
      address = [s?.addressLine1, s?.addressLine2, s?.city, s?.pincode].filter(Boolean).join(", ");
      gstin = s?.gstEnabled ? String(s?.gstin || "") : "";
    } catch {
      // use the bar name only
    }
    setHead({ name, address, gstin });
  }, [bar]);

  // Opens the print dialog once the receipt is on the page.
  useEffect(() => {
    if (!job) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        // ignore
      }
    }, 200);
    const done = () => setJob(null);
    window.addEventListener("afterprint", done);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [job]);

  function onPaper(v: number) {
    setPaper(v);
    try {
      localStorage.setItem(PAPER_KEY, String(v));
    } catch {
      // ignore
    }
  }

  const rows = useMemo(() => {
    if (!today) return [];
    const invoices: any[] = Array.isArray(db.invoices) ? db.invoices : [];
    const from = period === "all" ? "" : period === "today" ? today : shiftDays(today, period === "7" ? -6 : -29);
    const q = query.trim().toLowerCase();
    const out = invoices.filter((inv) => {
      const d = dateOf(String(inv?.timestamp ?? ""));
      if (from && (d === "" || d < from)) return false;
      if (
        q &&
        !(
          String(inv?.invoiceNo ?? "").toLowerCase().includes(q) ||
          String(inv?.customerName ?? "").toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      return true;
    });
    out.sort((a, b) => String(b?.timestamp ?? "").localeCompare(String(a?.timestamp ?? "")));
    return out;
  }, [db.invoices, today, period, query]);

  function phoneOf(inv: any): string {
    const list: any[] = Array.isArray(db.customers) ? db.customers : [];
    const c = list.find((x) => x?.id === inv?.customerId);
    return String(c?.phone ?? "");
  }

  async function onCopy(inv: any) {
    try {
      await navigator.clipboard.writeText(buildBill(inv, head, cur, null));
      setMsg(`Bill ${inv.invoiceNo} copied. Paste it in any chat.`);
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  function onVoid(inv: any) {
    if (!isOwner) {
      setMsg("Only the owner can cancel a bill.");
      return;
    }
    const why = reasonSel === "Other" ? note.trim() : note.trim() ? `${reasonSel} - ${note.trim()}` : reasonSel;
    if (why.length < 3) {
      setMsg("Write the reason (at least 3 letters).");
      return;
    }
    if (!confirm(`Cancel bill ${inv.invoiceNo} of ${cur}${inr(paise(inv.total))}? This cannot be undone.`)) return;
    const r = voidInvoice(String(inv.id), why);
    setMsg(r.message);
    if (r.ok) {
      setVoidFor("");
      setNote("");
      setReasonSel(REASONS[0]);
    }
  }

  function preview(inv: any): string[] {
    const lines: string[] = [];
    for (const it of Array.isArray(inv?.items) ? inv.items : []) {
      lines.push(`${String(it?.beerName ?? "Item")}: +${(Number(it?.litersTotal) || 0).toFixed(1)} L back in the keg`);
    }
    if (inv?.paymentMethod === "Tab") {
      if (inv?.customerId) {
        lines.push(`${String(inv.customerName)}: udhaar goes down by ${cur}${inr(paise(inv.balanceDue))}`);
      }
    } else {
      lines.push(`Give back ${cur}${inr(paise(inv?.total))} to the customer (${String(inv?.paymentMethod ?? "")})`);
    }
    return lines;
  }

  function onCsv() {
    if (voids.length === 0) {
      setMsg("No cancelled bill yet.");
      return;
    }
    const headRow = ["cancelled_at", "bill_no", "customer", "payment", "amount", "reason", "by", "cancelled_on"];
    const body = [...voids]
      .reverse()
      .map((v) => [
        v.at,
        v.invoiceNo,
        v.customerName,
        v.paymentMethod,
        v.total.toFixed(2),
        v.reason,
        v.by,
        v.local ? "this phone" : "other phone",
      ]);
    const csv = [headRow, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-cancelled-bills-${localToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg(`${voids.length} cancelled bill(s) downloaded.`);
    } catch {
      setMsg("The download did not work here.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold">Bill desk</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Send a bill on WhatsApp, print it as a receipt, or cancel a wrong bill with a reason. A cancelled bill goes
        away from the sales, the litres go back into the keg and the customer's udhaar is corrected. Cancelling cannot
        be undone; make a new bill if needed.
      </p>
      {!isOwner && <p className="text-sm rounded-md border p-2">Cancelling a bill is for the owner only.</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Show bills of</span>
          <select className={`${input} w-full`} value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Search bill no. or customer</span>
          <input className={`${input} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Receipt paper</span>
          <select className={`${input} w-full`} value={paper} onChange={(e) => onPaper(Number(e.target.value))}>
            <option value={58}>58 mm</option>
            <option value={80}>80 mm</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bill here.</p>
      ) : (
        <div className="space-y-3">
          {rows.slice(0, SHOW_MAX).map((inv) => {
            const id = String(inv?.id ?? inv?.invoiceNo ?? "");
            const num = waNumber(phoneOf(inv));
            const url = `https://wa.me/${num}?text=${encodeURIComponent(buildBill(inv, head, cur, null))}`;
            const tooLong = url.length > MAX_URL;
            const blocked = inv?.paymentMethod === "Tab" && Number(inv?.paidAmount) > 0;
            const isGst = !!inv?.gst && typeof inv.gst === "object";
            return (
              <div key={id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{String(inv?.invoiceNo ?? "")}</span>
                  <span className="font-medium">
                    {cur}
                    {inr(paise(inv?.total))}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {whenLong(String(inv?.timestamp ?? ""))} | {String(inv?.customerName || "Walk-in Guest")} |{" "}
                  {String(inv?.paymentMethod ?? "")} | {String(inv?.status ?? "")}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {!tooLong ? (
                    <a className={btn} href={url} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  ) : (
                    <button className={btn} disabled>
                      WhatsApp
                    </button>
                  )}
                  <button className="underline" onClick={() => onCopy(inv)}>
                    Copy
                  </button>
                  <button className="underline" onClick={() => setJob({ inv, n: Date.now() })}>
                    Print
                  </button>
                  {isOwner && (
                    <button
                      className="underline"
                      onClick={() => {
                        setVoidFor(voidFor === id ? "" : id);
                        setMsg("");
                      }}
                    >
                      Cancel bill
                    </button>
                  )}
                </div>
                {tooLong && <p className="text-muted-foreground">This bill is too long for WhatsApp. Use Copy.</p>}
                {!num && <p className="text-muted-foreground">No phone number saved: WhatsApp will ask whom to send to.</p>}

                {isOwner && voidFor === id && (
                  <div className="space-y-3 border-t pt-3">
                    {blocked ? (
                      <p className="text-destructive">
                        This udhaar bill already has {cur}
                        {inr(paise(inv?.paidAmount))} paid against it, so it cannot be cancelled here. Keep the bill and
                        settle it with the customer.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <p className="font-medium">If you cancel this bill:</p>
                          {preview(inv).map((line, i) => (
                            <p key={i} className="text-muted-foreground">
                              {line}
                            </p>
                          ))}
                          {isGst && (
                            <p className="text-destructive">
                              This is a GST bill. If an e-invoice (IRN) was made for it, cancel it on the GST portal
                              within 24 hours.
                            </p>
                          )}
                        </div>
                        <label className="block space-y-1">
                          <span className="text-muted-foreground">Reason</span>
                          <select className={`${input} w-full`} value={reasonSel} onChange={(e) => setReasonSel(e.target.value)}>
                            {REASONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-muted-foreground">
                            {reasonSel === "Other" ? "Write the reason" : "More details (optional)"}
                          </span>
                          <input
                            className={`${input} w-full`}
                            maxLength={120}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                          />
                        </label>
                        <div className="flex gap-3">
                          <button className={btn} onClick={() => onVoid(inv)}>
                            Cancel this bill
                          </button>
                          <button className="underline" onClick={() => setVoidFor("")}>
                            Keep the bill
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {rows.length > SHOW_MAX && (
            <p className="text-xs text-muted-foreground">{rows.length - SHOW_MAX} more bills not shown. Narrow the search.</p>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Cancelled bills</h2>
        {voids.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bill has been cancelled.</p>
        ) : (
          <>
            <button className="underline text-sm" onClick={onCsv}>
              Download cancelled bills (CSV)
            </button>
            {voids.slice(0, 30).map((v) => (
              <div key={v.id} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{v.invoiceNo || "Bill"}</span>
                  <span className="font-medium">
                    {cur}
                    {inr(paise(v.total))}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {whenLong(v.at)} | {v.customerName || "Walk-in Guest"} | {v.paymentMethod}
                </p>
                <p>
                  Reason: {v.reason}
                  {v.by ? ` | by ${v.by}` : ""}
                  {v.local ? "" : " | cancelled on the other phone"}
                </p>
              </div>
            ))}
          </>
        )}
      </section>

      {job && (
        <pre
          id="pt-receipt"
          style={{
            width: `${paper - 6}mm`,
            margin: 0,
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.35,
          }}
        >
          {buildBill(job.inv, head, cur, cols)}
        </pre>
      )}
    </div>
  );
}

export default function BillDeskView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
