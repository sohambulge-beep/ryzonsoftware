import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listBankAccounts } from "@/lib/bankService";
import {
  type ExciseBrand,
  type ExciseSettings,
  getExciseSettings,
  listExciseBrands,
} from "@/lib/exciseService";
import { type StockRow, getStockSummary } from "@/lib/exciseSalesService";

// Tables created by later migrations are not in the generated types yet, so cast.
const db = supabase as any;

const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const PAGE = 1000;
const MAX_LINES = 20;
const LOOKBACK_DAYS = 30;

const printCss = `
@media print {
  body * { visibility: hidden; }
  #health-check, #health-check * { visibility: visible; color: #000 !important; background: #fff !important; }
  #health-check { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// Local date (not UTC).
const localToday = () => {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

const shiftDays = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchAll(makeQuery: () => any): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function firstSaleDate(): Promise<string | null> {
  const { data, error } = await db
    .from("excise_daily_sales")
    .select("sale_date")
    .order("sale_date", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0].sale_date : null;
}

type Level = "ok" | "red" | "amber" | "info" | "skip";
interface Outcome {
  level: Level;
  summary: string;
  lines: string[];
}
interface CheckResult extends Outcome {
  key: string;
  title: string;
}
interface Ctx {
  today: string;
  stock: StockRow[];
  brands: ExciseBrand[];
  firstSale: string | null;
}
interface Check {
  key: string;
  title: string;
  run: (ctx: Ctx) => Promise<Outcome>;
}

const out = (level: Level, summary: string, lines: string[] = []): Outcome => ({ level, summary, lines });

function limited(items: string[]): string[] {
  if (items.length <= MAX_LINES) return items;
  return [...items.slice(0, MAX_LINES), `...and ${items.length - MAX_LINES} more`];
}

const CHECKS: Check[] = [
  {
    key: "minus",
    title: "Minus stock",
    run: async (ctx) => {
      const neg = ctx.stock
        .map((r) => ({ ...r, left: r.received - r.sold }))
        .filter((r) => r.left < 0)
        .sort((a, b) => a.left - b.left || a.name.localeCompare(b.name));
      if (neg.length === 0) return out("ok", "No brand has minus stock.");
      return out(
        "red",
        `${neg.length} brand(s) sold more bottles than the stock received. Add the missing TP receipt or correct the sale.`,
        limited(neg.map((r) => `${r.name} ${r.size_ml} ml: ${r.left}`))
      );
    },
  },
  {
    key: "unverified",
    title: "TP receipts not verified",
    run: async () => {
      const rows = await fetchAll(() =>
        db
          .from("excise_tp_receipts")
          .select("id, tp_no, party, receipt_date")
          .eq("status", "not_verified")
          .order("receipt_date", { ascending: true })
          .order("id", { ascending: true })
      );
      const real = rows.filter((r: any) => !String(r.tp_no ?? "").toUpperCase().startsWith("OPENING"));
      if (real.length === 0) {
        return out("ok", "Every TP receipt is marked verified (opening stock entries are not counted).");
      }
      return out(
        "amber",
        `${real.length} TP receipt(s) are still "Not verified". Compare them with the excise portal and mark them verified.`,
        limited(real.map((r: any) => `TP ${r.tp_no} | ${r.party || "no party"} | ${r.receipt_date}`))
      );
    },
  },
  {
    key: "missing",
    title: "Days without sale entries",
    run: async (ctx) => {
      if (!ctx.firstSale) return out("skip", "No sales have been entered yet.");
      const earliest = shiftDays(ctx.today, -LOOKBACK_DAYS);
      const start = ctx.firstSale > earliest ? ctx.firstSale : earliest;
      const end = shiftDays(ctx.today, -1);
      if (start > end) return out("ok", "Not enough days of history to check yet.");
      const rows = await fetchAll(() =>
        db
          .from("excise_daily_sales")
          .select("sale_date")
          .gte("sale_date", start)
          .lte("sale_date", end)
          .order("sale_date", { ascending: true })
          .order("id", { ascending: true })
      );
      const have = new Set(rows.map((r: any) => r.sale_date));
      const missing: string[] = [];
      for (let d = start; d <= end; d = shiftDays(d, 1)) {
        if (!have.has(d)) missing.push(d);
      }
      if (missing.length === 0) return out("ok", `Sales were entered on every day since ${start}.`);
      return out(
        "amber",
        `No sale entry on ${missing.length} day(s) since ${start}. If the bar was open, enter those sales. If it was closed, ignore this.`,
        limited(missing)
      );
    },
  },
  {
    key: "norate",
    title: "Brands with stock but no rate",
    run: async (ctx) => {
      const rate = new Map(ctx.brands.map((b) => [b.id, Number(b.rate) || 0]));
      const list = ctx.stock
        .map((r) => ({ ...r, left: r.received - r.sold }))
        .filter((r) => r.left > 0 && (rate.get(r.brand_id) ?? 0) === 0)
        .sort((a, b) => a.name.localeCompare(b.name) || a.size_ml - b.size_ml);
      if (list.length === 0) return out("ok", "Every brand in stock has a rate.");
      return out(
        "amber",
        `${list.length} brand(s) have stock but rate 0, so stock value reports show 0 for them. Set the rate in Brand prices.`,
        limited(list.map((r) => `${r.name} ${r.size_ml} ml: ${r.left} in stock`))
      );
    },
  },
  {
    key: "bank",
    title: "Bank balances",
    run: async () => {
      const accounts = await listBankAccounts();
      if (accounts.length === 0) return out("info", "No bank accounts added.");
      const entries = await fetchAll(() =>
        db
          .from("bank_entries")
          .select("account_id, direction, amount")
          .order("id", { ascending: true })
      );
      const bal = new Map<string, number>(accounts.map((a) => [a.id, paise(a.opening_balance)]));
      for (const e of entries) {
        const cur = bal.get(e.account_id);
        if (cur === undefined) continue;
        const p = paise(e.amount);
        bal.set(e.account_id, e.direction === "credit" ? cur + p : cur - p);
      }
      const negative = accounts.filter((a) => (bal.get(a.id) ?? 0) < 0);
      if (negative.length === 0) return out("ok", "No bank account is below zero.");
      return out(
        "amber",
        `${negative.length} bank account(s) show a balance below zero. Check for a missing credit entry.`,
        negative.map((a) => `${a.name}: ${inr(bal.get(a.id) ?? 0)}`)
      );
    },
  },
  {
    key: "deletes",
    title: "Deleted records (last 30 days)",
    run: async () => {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
      const { count, error } = await db
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "delete")
        .gte("created_at", since);
      if (error) return out("skip", "The Activity log is not switched on yet, so deletions are not checked.");
      const n = count ?? 0;
      if (n === 0) return out("ok", "Nothing was deleted in the last 30 days.");
      return out(
        "info",
        `${n} record(s) were deleted in the last 30 days (both sides of a deleted bank transfer count separately). Open the Activity log to see what and when.`
      );
    },
  },
];

const LABEL: Record<Level, string> = {
  ok: "OK",
  red: "Fix",
  amber: "Check",
  info: "Note",
  skip: "Not run",
};

export default function ExciseHealthCheckView() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [ranOn, setRanOn] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const run = useCallback(async () => {
    const id = ++reqRef.current;
    setLoading(true);
    setMsg("");
    try {
      const today = localToday();
      const [stock, brands, firstSale] = await Promise.all([
        getStockSummary(),
        listExciseBrands(),
        firstSaleDate(),
      ]);
      const ctx: Ctx = { today, stock, brands, firstSale };
      const all: CheckResult[] = await Promise.all(
        CHECKS.map(async (c): Promise<CheckResult> => {
          try {
            return { key: c.key, title: c.title, ...(await c.run(ctx)) };
          } catch (e: any) {
            return {
              key: c.key,
              title: c.title,
              level: "skip",
              summary: `Could not run this check: ${e.message ?? e}`,
              lines: [],
            };
          }
        })
      );
      if (id !== reqRef.current) return;
      setResults(all);
      setRanOn(today);
    } catch (e: any) {
      if (id === reqRef.current) setMsg(`Could not load: ${e.message ?? e}`);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    (async () => {
      try {
        setSettings(await getExciseSettings());
      } catch {
        // the hotel name on the printout is optional
      }
    })();
  }, [run]);

  const red = results ? results.filter((r) => r.level === "red").length : 0;
  const amber = results ? results.filter((r) => r.level === "amber").length : 0;
  const overall = !results
    ? ""
    : red > 0
      ? "Fix the red items before you file returns or face an inspection."
      : amber > 0
        ? "Mostly fine. A few things need a look."
        : "All clear. Nothing wrong was found in the data checked.";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Excise health check</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <div className="flex flex-wrap gap-3 no-print">
        <button className={btn} disabled={loading} onClick={run}>
          {loading ? "Checking..." : "Run check again"}
        </button>
        <button className={btn} disabled={loading || !results} onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <section id="health-check" className="space-y-4 text-sm">
        <div>
          <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
          <p className="font-medium pt-1">Excise health check{ranOn ? `: ${ranOn}` : ""}</p>
        </div>

        {loading && !results ? (
          <p className="text-muted-foreground">Checking...</p>
        ) : !results ? (
          <p className="text-muted-foreground">No result yet.</p>
        ) : (
          <>
            <p className="font-medium">
              {overall} ({red} to fix, {amber} to check)
            </p>
            <div className="space-y-3">
              {results.map((r) => (
                <div key={r.key} className="rounded-md border p-3 space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{r.title}</span>
                    <span className={r.level === "red" ? "font-medium text-destructive" : "font-medium"}>
                      {LABEL[r.level]}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{r.summary}</p>
                  {r.lines.length > 0 && (
                    <ul className="list-disc pl-5">
                      {r.lines.map((l, i) => (
                        <li key={`${r.key}-${i}`}>{l}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          This checks only the data saved in this app. It does not compare with the excise portal.
        </p>
        <p className="pt-8">Checked by: ____________________ Date: ____________________</p>
      </section>
    </div>
  );
}
