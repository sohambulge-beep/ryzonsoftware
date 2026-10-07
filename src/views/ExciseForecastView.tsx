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
const WINDOWS = [7, 14, 30, 60];

const printCss = `
@media print {
  body * { visibility: hidden; }
  #stock-forecast, #stock-forecast * { visibility: visible; color: #000 !important; background: #fff !important; }
  #stock-forecast { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
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

interface SaleLine {
  brand_id: string;
  bottles: number;
}

async function fetchSales(from: string): Promise<SaleLine[]> {
  const all: SaleLine[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("excise_daily_sales")
      .select("brand_id, bottles")
      .gte("sale_date", from)
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

async function firstSaleDate(): Promise<string | null> {
  const { data, error } = await db
    .from("excise_daily_sales")
    .select("sale_date")
    .order("sale_date", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0].sale_date : null;
}

interface Loaded {
  stock: StockRow[];
  brands: ExciseBrand[];
  soldInWindow: Map<string, number>;
  effectiveDays: number;
  today: string;
}

export default function ExciseForecastView() {
  const [windowDays, setWindowDays] = useState(30);
  const [coverStr, setCoverStr] = useState("15");
  const [onlyNeed, setOnlyNeed] = useState(true);
  const [data, setData] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setSettings(await getExciseSettings());
      } catch {
        // the hotel name on the printout is optional
      }
    })();
  }, []);

  useEffect(() => {
    const id = ++reqRef.current;
    setLoading(true);
    setMsg("");
    (async () => {
      try {
        const today = localToday();
        const from = shiftDays(today, -(windowDays - 1));
        const [stock, brands, sales, first] = await Promise.all([
          getStockSummary(),
          listExciseBrands(),
          fetchSales(from),
          firstSaleDate(),
        ]);
        if (id !== reqRef.current) return;
        const sold = new Map<string, number>();
        for (const s of sales) sold.set(s.brand_id, (sold.get(s.brand_id) ?? 0) + s.bottles);
        const history = first ? Math.max(1, daysBetween(first, today) + 1) : windowDays;
        setData({
          stock,
          brands,
          soldInWindow: sold,
          effectiveDays: Math.min(windowDays, history),
          today,
        });
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    })();
  }, [windowDays]);

  const cover = Number(coverStr);
  const coverOk = Number.isInteger(cover) && cover >= 1 && cover <= 365;

  const model = useMemo(() => {
    if (!data || !coverOk) return null;
    const perCase = new Map(data.brands.map((b) => [b.id, b.bottles_per_case]));

    const rows = data.stock
      .filter((r) => r.received !== 0 || r.sold !== 0)
      .map((r) => {
        const left = r.received - r.sold;
        const soldW = data.soldInWindow.get(r.brand_id) ?? 0;
        const perDay = soldW / data.effectiveDays;
        // Whole-number maths, so there is no rounding slip of one bottle.
        const daysLeft = left <= 0 ? 0 : soldW > 0 ? (left * data.effectiveDays) / soldW : null;
        const need =
          soldW > 0 ? Math.max(0, Math.ceil((soldW * cover - left * data.effectiveDays) / data.effectiveDays)) : 0;
        const cases = need > 0 ? Math.ceil(need / Math.max(1, perCase.get(r.brand_id) ?? 1)) : 0;
        return { ...r, left, perDay, daysLeft, need, cases };
      });

    rows.sort((a, b) => {
      const dA = a.daysLeft === null ? Infinity : a.daysLeft;
      const dB = b.daysLeft === null ? Infinity : b.daysLeft;
      return dA - dB || a.name.localeCompare(b.name) || a.size_ml - b.size_ml;
    });

    const needing = rows.filter((r) => r.need > 0);
    return {
      listed: onlyNeed ? needing : rows,
      needCount: needing.length,
      totalBottles: needing.reduce((s, r) => s + r.need, 0),
      totalCases: needing.reduce((s, r) => s + r.cases, 0),
    };
  }, [data, cover, coverOk, onlyNeed]);

  const lasts = (left: number, daysLeft: number | null) => {
    if (left <= 0) return "Out of stock";
    if (daysLeft === null) return "No sales";
    if (daysLeft < 1) return "Less than 1 day";
    return `${Math.floor(daysLeft)} days`;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Stock forecast</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <p className="text-sm text-muted-foreground no-print">
        Shows how many days each brand will last at your recent selling speed, and how much to order so that you
        have enough for the days you choose.
      </p>

      <div className="flex flex-wrap items-end gap-3 no-print">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Look at sales of the last</span>
          <select
            className={input}
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w} days
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">I want stock for (days)</span>
          <input
            className={`${input} w-28`}
            inputMode="numeric"
            value={coverStr}
            onChange={(e) => setCoverStr(e.target.value.replace(/\D/g, "").slice(0, 3))}
          />
        </label>
        <button className={btn} disabled={!model || model.listed.length === 0} onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm no-print">
        <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} />
        Show only brands that need ordering
      </label>

      <section id="stock-forecast" className="space-y-3 text-sm">
        <div>
          <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
          <p className="font-medium pt-1">Stock forecast and order list{data ? `: ${data.today}` : ""}</p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : !coverOk ? (
          <p className="text-muted-foreground">Enter the days of stock you want (1 to 365).</p>
        ) : !data || !model ? (
          <p className="text-muted-foreground">No data yet.</p>
        ) : (
          <>
            <p>
              Based on the last {data.effectiveDays} day(s) of sales. Stock wanted for {cover} day(s).
            </p>
            {data.effectiveDays < 7 && (
              <p className="rounded-md border p-2">
                Only {data.effectiveDays} day(s) of sales are recorded, so this is a rough estimate.
              </p>
            )}
            <p className="font-medium">
              {model.needCount} brand(s) need ordering: about {model.totalBottles} bottles ({model.totalCases} cases).
            </p>

            {model.listed.length === 0 ? (
              <p className="text-muted-foreground">
                {onlyNeed
                  ? "No brand needs ordering right now."
                  : "No brands to show. Add TP receipts and daily sales first."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-1 pr-3">Brand</th>
                      <th className="pr-3 text-right">In stock</th>
                      <th className="pr-3 text-right">Sells/day</th>
                      <th className="pr-3 text-right">Lasts</th>
                      <th className="pr-3 text-right">Order</th>
                      <th className="text-right">Cases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.listed.map((r) => (
                      <tr key={r.brand_id} className="border-b">
                        <td className="py-1 pr-3">
                          {r.name} {r.size_ml} ml
                        </td>
                        <td className={`pr-3 text-right ${r.left < 0 ? "text-destructive" : ""}`}>
                          {r.left}
                          {r.left < 0 ? " (check)" : ""}
                        </td>
                        <td className="pr-3 text-right">{Math.round(r.perDay * 10) / 10}</td>
                        <td className={`pr-3 text-right ${r.left <= 0 ? "text-destructive" : ""}`}>
                          {lasts(r.left, r.daysLeft)}
                        </td>
                        <td className="pr-3 text-right">{r.need || ""}</td>
                        <td className="text-right">{r.cases || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Stock = bottles received through TP receipts minus bottles sold in Daily sales. This is an estimate from
          past sales; busy days and festivals can sell faster.
        </p>
      </section>
    </div>
  );
}
