import { useMemo, useState } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const pad = (n: number) => String(n).padStart(2, "0");
const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateStr(d);
};
const timeOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Money: rounded to 2 decimals, kept as a number so a minus sign is not read as text.
const money = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
const paise = (n: any) => Math.round((Number(n) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Stops spreadsheets from running text that starts like a formula.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n");

function saveCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default function PosReportView() {
  const { db } = useStore();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [last, setLast] = useState<{ name: string; csv: string } | null>(null);

  const inRange = (d: string) => {
    if (d === "") return !from && !to;
    return (!from || d >= from) && (!to || d <= to);
  };

  const data = useMemo(() => {
    const bills = [...(db.invoices ?? [])]
      .filter((i) => inRange(dateOf(i.timestamp)))
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const expenses = [...(db.expenses ?? [])].filter((e) => inRange(String(e.date ?? "")));
    const payments = [...(db.payments ?? [])].filter((p) => inRange(dateOf(p.timestamp)));
    const purchases = [...(db.purchases ?? [])].filter((p) => inRange(String(p.date ?? "")));
    return { bills, expenses, payments, purchases };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, from, to]);

  const sum = (list: any[], f: (x: any) => any) => list.reduce((s, x) => s + paise(f(x)), 0);
  const salesP = sum(data.bills, (b) => b.total);
  const taxP = sum(data.bills, (b) => b.tax);
  const paidP = sum(data.bills, (b) => b.paidAmount);
  const dueP = sum(data.bills, (b) => b.balanceDue);
  const expP = sum(data.expenses, (e) => e.amount);

  function run(slug: string, header: Cell[], body: Cell[][]) {
    if (body.length === 0) {
      setLast(null);
      setMsg("Nothing to export for this selection.");
      return;
    }
    const csv = toCsv([header, ...body]);
    const name = `prime-terminal-${slug}-${dateStr(new Date())}.csv`;
    setLast({ name, csv });
    try {
      saveCsv(name, csv);
      setMsg(`${body.length} row(s) exported to ${name}`);
    } catch {
      setMsg("The download did not work here. Use Copy text below.");
    }
  }

  const tapName = (id: string) => (db.taps ?? []).find((t) => t.id === id)?.name ?? "";
  const supName = (id: string) => (db.suppliers ?? []).find((s) => s.id === id)?.name ?? "";

  const exportBills = () =>
    run(
      "bills",
      ["date", "time", "invoice_no", "customer", "payment", "status", "subtotal", "tax", "total", "paid", "balance_due", "items"],
      data.bills.map((b) => [
        dateOf(b.timestamp),
        timeOf(b.timestamp),
        b.invoiceNo,
        b.customerName,
        b.paymentMethod,
        b.status,
        money(b.subtotal),
        money(b.tax),
        money(b.total),
        money(b.paidAmount),
        money(b.balanceDue),
        (b.items ?? []).map((i) => `${i.beerName} x${i.qty}`).join("; "),
      ])
    );

  const exportItems = () =>
    run(
      "bill-items",
      ["date", "invoice_no", "customer", "item", "qty", "unit_price", "liters", "line_total"],
      data.bills.flatMap((b) =>
        (b.items ?? []).map((i) => [
          dateOf(b.timestamp),
          b.invoiceNo,
          b.customerName,
          i.beerName,
          i.qty,
          money(i.unitPrice),
          Math.round((Number(i.litersTotal) || 0) * 100) / 100,
          money(i.total),
        ])
      )
    );

  const exportCustomers = () =>
    run(
      "customers",
      ["name", "phone", "email", "tab_limit", "balance_due", "total_spent"],
      [...(db.customers ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => [c.name, c.phone, c.email, money(c.tabLimit), money(c.currentBalance), money(c.totalSpent)])
    );

  const exportStock = () =>
    run(
      "stock",
      ["tap_no", "name", "brewery", "style", "abv", "liters_left", "capacity_liters", "cost_per_liter", "price_per_pint"],
      [...(db.taps ?? [])]
        .sort((a, b) => a.tapNumber - b.tapNumber)
        .map((t) => [
          t.tapNumber,
          t.name,
          t.brewery,
          t.style,
          t.abv,
          Math.round((Number(t.currentLiters) || 0) * 100) / 100,
          t.capacityLiters,
          money(t.costPerLiter),
          money(t.pricePerPint),
        ])
    );

  const exportExpenses = () =>
    run(
      "expenses",
      ["date", "title", "category", "payment", "amount"],
      [...data.expenses]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((e) => [e.date, e.title, e.category, e.paymentMethod, money(e.amount)])
    );

  const exportPayments = () =>
    run(
      "payments",
      ["date", "time", "receipt_no", "customer", "payment", "amount", "notes"],
      [...data.payments]
        .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
        .map((p) => [dateOf(p.timestamp), timeOf(p.timestamp), p.receiptNo, p.customerName, p.paymentMethod, money(p.amount), p.notes])
    );

  const exportPurchases = () =>
    run(
      "purchases",
      ["date", "po_no", "supplier", "tap", "kegs", "liters_added", "cost_per_liter", "total_cost", "status"],
      [...data.purchases]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((p) => [
          p.date,
          p.id,
          supName(p.supplierId),
          tapName(p.beerId),
          p.kegQty,
          Math.round((Number(p.litersAdded) || 0) * 100) / 100,
          money(p.costPerLiter),
          money(p.totalCost),
          p.status,
        ])
    );

  async function onCopy() {
    if (!last) return;
    try {
      await navigator.clipboard.writeText(last.csv);
      setMsg("Copied. Paste it into a notes app or a spreadsheet.");
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  const rows: [string, () => void][] = [
    ["Bills (one row per bill)", exportBills],
    ["Bill items (one row per item sold)", exportItems],
    ["Customers and tab balances", exportCustomers],
    ["Stock (kegs and prices)", exportStock],
    ["Expenses", exportExpenses],
    ["Customer payments", exportPayments],
    ["Purchases", exportPurchases],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">POS report (Excel / CSV)</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Downloads your POS data (bills, customers, stock, expenses) as files that open in Excel or Google Sheets. Dates
        apply to bills, expenses, payments and purchases. Customers and stock are always as they are today. Leave both
        dates empty for everything.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">From date</span>
          <input type="date" className={`${input} w-full`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">To date</span>
          <input type="date" className={`${input} w-full`} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {from && to && from > to && (
        <p className="text-sm rounded-md border p-2">From date is after To date, so nothing will match.</p>
      )}

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p className="font-medium">This selection</p>
        <p>
          {data.bills.length} bill(s) | Sales {inr(salesP)} (tax {inr(taxP)})
        </p>
        <p>
          Collected {inr(paidP)} | Still to collect {inr(dueP)}
        </p>
        <p>
          {data.expenses.length} expense(s) | {inr(expP)}
        </p>
      </section>

      <section className="space-y-2">
        {rows.map(([label, fn]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span>{label}</span>
            <button className={btn} onClick={fn}>
              Download
            </button>
          </div>
        ))}
      </section>

      {last && (
        <p className="text-sm">
          Download did not start?{" "}
          <button className="underline" onClick={onCopy}>
            Copy text of {last.name}
          </button>
        </p>
      )}
    </div>
  );
} 
