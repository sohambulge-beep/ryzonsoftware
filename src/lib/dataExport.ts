import { supabase } from "@/integrations/supabase/client";

// These tables are not all in the generated types, so cast.
const db = supabase as any;

// The Excise and Bank tables. A table that cannot be read is skipped and reported.
export const EXPORT_TABLES = [
  "excise_settings",
  "excise_brands",
  "excise_tp_receipts",
  "excise_tp_items",
  "excise_daily_sales",
  "bank_accounts",
  "bank_entries",
  "bank_transfers",
] as const;

const PAGE = 1000;
const MAX_PAGES = 50;

export interface TableReport {
  table: string;
  rows: number;
  note: string; // empty when everything is fine
}

export interface ExportResult {
  text: string; // the content of the file
  reports: TableReport[];
  total: number;
}

// Every read has its own time limit, so one slow table never holds up the rest.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// Reads a whole table page by page.
async function fetchAll(table: string): Promise<{ rows: any[]; note: string }> {
  const rows: any[] = [];
  let ordered = true;
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    let q: any = db.from(table).select("*");
    if (ordered) q = q.order("id", { ascending: true });
    const res: any = await withTimeout(q.range(from, from + PAGE - 1), 20000);
    if (res.error) {
      const text = String(res.error.message ?? res.error);
      if (ordered && page === 0 && text.includes("id")) {
        // The table has no id column to order by: read the first page without ordering.
        ordered = false;
        page = -1;
        rows.length = 0;
        continue;
      }
      return { rows, note: text };
    }
    const batch: any[] = res.data ?? [];
    rows.push(...batch);
    if (!ordered) {
      return { rows, note: batch.length >= PAGE ? "only the first 1000 rows (no id column to page by)" : "" };
    }
    if (batch.length < PAGE) return { rows, note: "" };
  }
  return { rows, note: `stopped after ${MAX_PAGES * PAGE} rows` };
}

// Builds one file with all the Excise and Bank tables.
export async function buildExciseBankExport(): Promise<ExportResult> {
  const tables: Record<string, any[]> = {};
  const reports: TableReport[] = [];
  let total = 0;
  for (const t of EXPORT_TABLES) {
    try {
      const r = await fetchAll(t);
      tables[t] = r.rows;
      total += r.rows.length;
      reports.push({ table: t, rows: r.rows.length, note: r.note });
    } catch (e: any) {
      reports.push({ table: t, rows: 0, note: String(e?.message ?? e) });
    }
  }
  const file = {
    app: "Prime Terminal",
    exported_at: new Date().toISOString(),
    note: "Excise and Bank data of this business. Keep this file safe: it has private business data.",
    tables,
  };
  return { text: JSON.stringify(file, null, 2), reports, total };
}
