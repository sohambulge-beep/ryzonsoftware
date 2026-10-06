import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type DailySale,
  type StockRow,
  getStockSummary,
  listDailySales,
} from "@/lib/exciseSalesService";

// The table was created by a later migration, so it is not in the generated types. Cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

// Local date (not UTC), so late-night entries do not get yesterday's date.
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function ExciseBulkSalesView() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [saleDate, setSaleDate] = useState("");
  const [dateSales, setDateSales] = useState<DailySale[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [showUnused, setShowUnused] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const loadStock = useCallback(async () => {
    try {
      setStock(await getStockSummary());
    } catch (e: any) {
      setMsg(`Could not load stock: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSales = useCallback(async (d: string) => {
    const id = ++reqRef.current;
    try {
      const list = await listDailySales(d);
      if (id === reqRef.current) setDateSales(list);
    } catch (e: any) {
      if (id === reqRef.current) setMsg(`Could not load sales: ${e.message ?? e}`);
    }
  }, []);

  useEffect(() => {
    setSaleDate(localToday());
    loadStock();
  }, [loadStock]);

  useEffect(() => {
    setDateSales([]);
    if (!saleDate) {
      reqRef.current++;
      return;
    }
    loadSales(saleDate);
  }, [saleDate, loadSales]);

  const leftOf = useCallback(
    (brandId: string) => {
      const r = stock.find((s) => s.brand_id === brandId);
      return r ? r.received - r.sold : 0;
    },
    [stock]
  );

  const alreadyByBrand = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of dateSales) m.set(s.brand_id, (m.get(s.brand_id) ?? 0) + s.bottles);
    return m;
  }, [dateSales]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock.filter((r) => {
      const hasEntry = (qty[r.brand_id] ?? "") !== "";
      const inUse = showUnused || r.received !== 0 || r.sold !== 0 || hasEntry;
      const matches = q === "" || r.name.toLowerCase().includes(q) || hasEntry;
      return inUse && matches;
    });
  }, [stock, query, showUnused, qty]);

  const entries = useMemo(
    () =>
      Object.entries(qty)
        .map(([brand_id, v]) => ({ brand_id, bottles: Number(v) }))
        .filter((e) => Number.isInteger(e.bottles) && e.bottles > 0),
    [qty]
  );
  const totalBottles = entries.reduce((s, e) => s + e.bottles, 0);

  function setBrandQty(brandId: string, value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 5);
    setQty((prev) => {
      const next = { ...prev };
      if (clean === "") delete next[brandId];
      else next[brandId] = clean;
      return next;
    });
  }

  async function onSave() {
    if (!saleDate) {
      setMsg("Pick the date");
      return;
    }
    if (entries.length === 0) {
      setMsg("Enter bottles for at least one brand");
      return;
    }
    const over = entries.filter((e) => e.bottles > leftOf(e.brand_id)).length;
    const dup = entries.filter((e) => (alreadyByBrand.get(e.brand_id) ?? 0) > 0).length;
    let warn = "";
    if (over > 0) warn += `${over} brand(s) have more bottles than stock. `;
    if (dup > 0) warn += `${dup} brand(s) already have sales on this date; these will be added on top. `;
    if (warn && !confirm(`${warn}Save anyway?`)) return;

    setBusy(true);
    try {
      const { error } = await db.from("excise_daily_sales").insert(
        entries.map((e) => ({ brand_id: e.brand_id, sale_date: saleDate, bottles: e.bottles }))
      );
      if (error) throw new Error(error.message);
      setMsg(`Saved: ${entries.length} brand(s), ${totalBottles} bottles`);
      setQty({});
      await Promise.all([loadStock(), loadSales(saleDate)]);
    } catch (e: any) {
      setMsg(`Could not save: ${e.message ?? e}. Nothing was saved.`);
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Bulk sales entry</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Sale date</span>
          <input type="date" className={input} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
        </label>
        <label className="block space-y-1 grow">
          <span className="text-sm text-muted-foreground">Search brand</span>
          <input
            className={`${input} w-full`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type part of a brand name"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
        Also show brands that have never been stocked or sold
      </label>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No brands to show. Add brands and TP receipts in the Excise page first.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const left = r.received - r.sold;
            const entered = Number(qty[r.brand_id] ?? 0);
            const already = alreadyByBrand.get(r.brand_id) ?? 0;
            return (
              <div key={r.brand_id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.name} {r.size_ml} ml
                  </p>
                  <p className="text-muted-foreground">
                    {r.category} | In stock: {left}
                    {left < 0 ? " (check)" : ""}
                  </p>
                  {already > 0 && (
                    <p className="text-muted-foreground">Already entered for this date: {already}</p>
                  )}
                  {entered > left && <p className="text-destructive">More than stock</p>}
                </div>
                <input
                  className={`${input} w-24 text-right`}
                  inputMode="numeric"
                  placeholder="0"
                  value={qty[r.brand_id] ?? ""}
                  onChange={(e) => setBrandQty(r.brand_id, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">
          {entries.length} brand(s), {totalBottles} bottles to save
        </p>
        <button className={btn} disabled={busy || entries.length === 0} onClick={onSave}>
          {busy ? "Saving..." : "Save all"}
        </button>
        <p className="text-xs text-muted-foreground">
          All brands are saved together. If anything fails, nothing is saved.
        </p>
      </div>
    </div>
  );
}
