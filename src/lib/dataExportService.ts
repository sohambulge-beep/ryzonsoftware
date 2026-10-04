import { supabase } from "@/integrations/supabase/client";
import { listBankAccounts } from "@/lib/bankService";

// New tables are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

const PAGE = 1000;

export interface ExportResult {
  filename: string;
  csv: string;
  rowCount: number;
}

type Cell = string | number | null | undefined;

// Local date (not UTC) for file names.
function localToday(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function cell(v: Cell): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Stop spreadsheets from running text that starts like a formula.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

const money = (n: any) => (Number(n) || 0).toFixed(2);

function checkRange(from: string, to: string) {
  if (from && to && from > to) throw new Error("From date must be before To date");
}

function applyRange(q: any, column: string, from: string, to: string) {
  let query = q;
  if (from) query = query.gte(column, from);
  if (to) query = query.lte(column, to);
  return query;
}

// Loads every row, one page at a time. The query must have a stable order.
async function fetchAll(makeQuery: () => any): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function result(slug: string, header: Cell[], body: Cell[][]): ExportResult {
  return {
    filename: `taptrack-${slug}-${localToday()}.csv`,
    csv: toCsv([header, ...body]),
    rowCount: body.length,
  };
}

// Same columns as the "Brand prices" CSV import, so this file can be imported back.
export async function exportBrands(): Promise<ExportResult> {
  const rows = await fetchAll(() =>
    db
      .from("excise_brands")
      .select("name, category, size_ml, bottles_per_case, rate")
      .order("category")
      .order("name")
      .order("size_ml")
      .order("id")
  );
  return result(
    "brands",
    ["name", "category", "size_ml", "bottles_per_case", "rate"],
    rows.map((r) => [r.name, r.category, r.size_ml, r.bottles_per_case, money(r.rate)])
  );
}

export async function exportTpReceipts(from: string, to: string): Promise<ExportResult> {
  checkRange(from, to);
  const receipts = await fetchAll(() =>
    applyRange(
      db
        .from("excise_tp_receipts")
        .select(
          "id, tp_no, auto_tp_no, party, receipt_date, status, excise_tp_items(cases, bottles, bottles_total, excise_brands(name, size_ml, category))"
        ),
      "receipt_date",
      from,
      to
    )
      .order("receipt_date")
      .order("created_at")
      .order("id")
  );

  const body: Cell[][] = [];
  for (const r of receipts) {
    const items: any[] = r.excise_tp_items ?? [];
    const head: Cell[] = [r.tp_no, r.auto_tp_no, r.party, r.receipt_date, r.status];
    if (items.length === 0) {
      body.push([...head, "", "", "", "", "", ""]);
      continue;
    }
    for (const i of items) {
      body.push([
        ...head,
        i.excise_brands?.name ?? "",
        i.excise_brands?.category ?? "",
        i.excise_brands?.size_ml ?? "",
        i.cases,
        i.bottles,
        i.bottles_total,
      ]);
    }
  }
  return result(
    "tp-receipts",
    ["tp_no", "auto_tp_no", "party", "date", "status", "brand", "category", "size_ml", "cases", "bottles", "total_bottles"],
    body
  );
}

export async function exportDailySales(from: string, to: string): Promise<ExportResult> {
  checkRange(from, to);
  const rows = await fetchAll(() =>
    applyRange(
      db.from("excise_daily_sales").select("sale_date, bottles, excise_brands(name, size_ml, category)"),
      "sale_date",
      from,
      to
    )
      .order("sale_date")
      .order("created_at")
      .order("id")
  );
  return result(
    "daily-sales",
    ["date", "brand", "category", "size_ml", "bottles"],
    rows.map((r) => [
      r.sale_date,
      r.excise_brands?.name ?? "",
      r.excise_brands?.category ?? "",
      r.excise_brands?.size_ml ?? "",
      r.bottles,
    ])
  );
}

// accountId = "all" exports the entries of every bank account.
export async function exportBankEntries(accountId: string, from: string, to: string): Promise<ExportResult> {
  checkRange(from, to);
  const accounts = await listBankAccounts();
  const nameById = new Map(accounts.map((a) => [a.id, a.last4 ? `${a.name} (xxxx ${a.last4})` : a.name]));

  const rows = await fetchAll(() => {
    let q = db.from("bank_entries").select("account_id, entry_date, direction, amount, description, reference");
    if (accountId && accountId !== "all") q = q.eq("account_id", accountId);
    return applyRange(q, "entry_date", from, to).order("entry_date").order("created_at").order("id");
  });

  return result(
    "bank-entries",
    ["account", "date", "type", "debit", "credit", "description", "reference"],
    rows.map((r) => [
      nameById.get(r.account_id) ?? "Unknown account",
      r.entry_date,
      r.direction,
      r.direction === "debit" ? money(r.amount) : "",
      r.direction === "credit" ? money(r.amount) : "",
      r.description,
      r.reference,
    ])
  );
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
