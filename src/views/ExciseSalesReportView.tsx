import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type ExciseBrand,
  type ExciseSettings,
  getExciseSettings,
  listExciseBrands,
} from "@/lib/exciseService";
import { type StockRow, getStockSummary } from "@/lib/exciseSalesService";

// The table was created by a later migration, so it is not in the generated types. Cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const PAGE = 1000;
const MAX_DAYS = 366;
const TOP_COUNT = 15;

const printCss = `
@media print {
  body * { visibility: hidden; }
  #sales-report, #sales-report * { visibility: visible; color: #000 !important; background: #fff !important; }
  #sales-report { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
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

const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

// Money is added up in paise (whole numbers).
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchSales(from: string, to: string): Promise<{ brand_id: string; bottles: number }[]> {
  const all: { brand_id: string; bottles: number }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("excise_daily_sales")
      .select("brand_id, bottles")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows.map((r: any) => ({ brand_id: r.brand_id, bottles: Number(r.bottles) || 0 })));
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

interface Loaded {
  from: string;
  to: string;
  brands: ExciseBrand[];
  stock: StockRow[];
  soldByBrand: Map<string, number>;
}

export default function ExciseSalesReportView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quick, setQuick] = useState("30");
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    const today = localToday();
    setTo(today);
    setFrom(shiftDays(today, -29));
    (async () => {
      try {
        setSettings(await getExciseSettings());
      } catch {
        // the hotel name on the printout is optional
      }
    })();
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    const id = ++reqRef.current;
    setMsg("");
    if (from > to) {
      setData(null);
      setLoading(false);
      setMsg("From date must be before To date");
      return;
    }
    if (daysBetween(from, to) + 1 > MAX_DAYS) {
      setData(null);
      setLoading(false);
      setMsg("Please pick a range of up to one year");
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const [sales, brands, stock] = await Promise.all([
          fetchSales(from, to),
          listExciseBrands(),
          getStockSummary(),
        ]);
        if (id !== reqRef.current) return;
        const soldByBrand = new Map<string, number>();
        for (const s of sales) soldByBrand.set(s.brand_id, (soldByBrand.get(s.brand_id) ?? 0) + s.bottles);
        setData({ from, to, brands, stock, soldByBrand });
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    })();
  }, [from, to]);

  function onQuick(value: string) {
    setQuick(value);
    if (value === "custom") return;
    const days = Number(value);
    const today = localToday();
    setTo(today);
    setFrom(shiftDays(today, -(days - 1)));
  }

  const model = useMemo(() => {
    if (!data) return null;
    const rateP = new Map<string, number>(
      data.brands.map((b) => [b.id, Math.round((Number(b.rate) || 0) * 100)])
    );
    const info = new Map(data.brands.map((b) => [b.id, b]));

    const sold = Array.from(data.soldByBrand.entries())
      .filter(([, bottles]) => bottles > 0)
      .map(([id, bottles]) => ({
        id,
        name: info.get(id)?.name ?? "Unknown brand",
        size_ml: info.get(id)?.size_ml ?? 0,
        bottles,
        valueP: bottles * (rateP.get(id) ?? 0),
      }))
      .sort((a, b) => b.bottles - a.bottles || a.name.localeCompare(b.name) || a.size_ml - b.size_ml);

    const totalBottles = sold.reduce((s, r) => s + r.bottles, 0);
    const totalValueP = sold.reduce((s, r) => s + r.valueP, 0);
    const days = daysBetween(data.from, data.to) + 1;

    const dead = data.stock
      .map((r) => ({ ...r, left: r.received - r.sold }))
      .filter((r) => r.left > 0 && (data.soldByBrand.get(r.brand_id) ?? 0) === 0)
      .map((r) => ({ ...r, lockedP: r.left * (rateP.get(r.brand_id) ?? 0) }))
      .sort((a, b) => b.lockedP - a.lockedP || b.left - a.left || a.name.localeCompare(b.name));

    return {
      sold,
      totalBottles,
      totalValueP,
      days,
      perDay: Math.round((totalBottles / days) * 10) / 10,
      dead,
      lockedP: dead.reduce((s, r) => s + r.lockedP, 0),
    };
  }, [data]);

  const topRows = model ? (showAll ? model.sold : model.sold.slice(0, TOP_COUNT)) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Sales and dead stock report</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <div className="flex flex-wrap items-end gap-3 no-print">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Quick range</span>
          <select className={input} value={quick} onChange={(e) => onQuick(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">From</span>
          <input
            type="date"
            className={input}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setQuick("custom");
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">To</span>
          <input
            type="date"
            className={input}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setQuick("custom");
            }}
          />
        </label>
        <button className={btn} disabled={loading || !model} onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <section id="sales-report" className="space-y-5 text-sm">
        <div>
          <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
          <p className="font-medium pt-1">
            Sales and dead stock report: {from || "-"} to {to || "-"}
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : !model ? (
          <p className="text-muted-foreground">Pick a valid date range.</p>
        ) : (
          <>
            <p>
              Total sold: {model.totalBottles} bottles (about {inr(model.totalValueP)}) in {model.days} day(s),
              around {model.perDay} bottles a day.
            </p>

            <div className="space-y-1">
              <h3 className="font-medium">Top sellers</h3>
              {model.sold.length === 0 ? (
                <p className="text-muted-foreground">No sales entered in this period.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-1 pr-3">Brand</th>
                          <th className="pr-3 text-right">Bottles</th>
                          <th className="pr-3 text-right">Share</th>
                          <th className="text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topRows.map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="py-1 pr-3">
                              {r.name} {r.size_ml} ml
                            </td>
                            <td className="pr-3 text-right">{r.bottles}</td>
                            <td className="pr-3 text-right">
                              {model.totalBottles > 0 ? Math.round((r.bottles * 1000) / model.totalBottles) / 10 : 0}%
                            </td>
                            <td className="text-right">{inr(r.valueP)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {model.sold.length > TOP_COUNT && (
                    <button className="text-sm underline no-print" onClick={() => setShowAll(!showAll)}>
                      {showAll ? `Show top ${TOP_COUNT} only` : `Show all ${model.sold.length} brands`}
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="font-medium">Not selling (stock lying unsold)</h3>
              {model.dead.length === 0 ? (
                <p className="text-muted-foreground">Every brand that has stock sold at least one bottle.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-1 pr-3">Brand</th>
                          <th className="pr-3 text-right">In stock</th>
                          <th className="text-right">Value locked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.dead.map((r) => (
                          <tr key={r.brand_id} className="border-b">
                            <td className="py-1 pr-3">
                              {r.name} {r.size_ml} ml
                            </td>
                            <td className="pr-3 text-right">{r.left}</td>
                            <td className="text-right">{inr(r.lockedP)}</td>
                          </tr>
                        ))}
                        <tr className="font-medium">
                          <td className="py-1 pr-3" colSpan={2}>
                            Total locked
                          </td>
                          <td className="text-right">{inr(model.lockedP)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Value is bottles times the rate saved for each brand; a brand with rate 0 counts as 0. Stock that
              arrived only recently may show under Not selling because it has had little time to sell. Stock is
              bottles received through TP receipts minus bottles sold in Daily sales.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
