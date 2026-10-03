import { useCallback, useEffect, useRef, useState } from "react";
import { type ExciseBrand, listExciseBrands } from "@/lib/exciseService";
import {
  type DailySale,
  type StockRow,
  addDailySale,
  deleteDailySale,
  getStockSummary,
  listDailySales,
} from "@/lib/exciseSalesService";

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

// Local date (not UTC), so late-night entries do not get yesterday's date.
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function ExciseSalesView() {
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [sales, setSales] = useState<DailySale[]>([]);
  const [date, setDate] = useState(today());
  const [brandId, setBrandId] = useState("");
  const [bottles, setBottles] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const reqRef = useRef(0);

  const loadStock = useCallback(async () => {
    try {
      setStock(await getStockSummary());
    } catch (e: any) {
      setMsg(`Could not load stock: ${e.message ?? e}`);
    }
  }, []);

  const loadSales = useCallback(async (d: string) => {
    const id = ++reqRef.current;
    try {
      const list = await listDailySales(d);
      if (id === reqRef.current) setSales(list);
    } catch (e: any) {
      if (id === reqRef.current) setMsg(`Could not load sales: ${e.message ?? e}`);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setBrands(await listExciseBrands());
      } catch (e: any) {
        setMsg(`Could not load brands: ${e.message ?? e}`);
      }
    })();
    loadStock();
  }, [loadStock]);

  useEffect(() => {
    setSales([]);
    if (!date) {
      reqRef.current++;
      return;
    }
    loadSales(date);
  }, [date, loadSales]);

  const stockOf = (id: string) => {
    const r = stock.find((s) => s.brand_id === id);
    return r ? r.received - r.sold : 0;
  };

  const dayTotal = sales.reduce((s, x) => s + x.bottles, 0);

  async function onAdd() {
    const n = Number(bottles);
    if (!date) {
      setMsg("Pick the date");
      return;
    }
    if (!brandId) {
      setMsg("Select a brand");
      return;
    }
    if (!Number.isInteger(n) || n <= 0) {
      setMsg("Enter whole bottles (1 or more)");
      return;
    }
    const left = stockOf(brandId);
    if (n > left && !confirm(`Stock is only ${left} bottles. Save this sale anyway?`)) return;

    setBusy(true);
    try {
      await addDailySale({ brand_id: brandId, sale_date: date, bottles: n });
      setBottles("");
      setMsg("Sale saved");
      await Promise.all([loadSales(date), loadStock()]);
    } catch (e: any) {
      setMsg(`Could not save: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this sale entry?")) return;
    try {
      await deleteDailySale(id);
      await Promise.all([loadSales(date), loadStock()]);
    } catch (e: any) {
      setMsg(`Could not delete: ${e.message ?? e}`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-semibold">Daily sale register</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">Add sale</h2>
        {brands.length === 0 && (
          <p className="text-sm text-muted-foreground">Add brands in the Excise page first.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Date</span>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Brand</span>
            <select className={input} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">Select brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.size_ml} ml ({b.category})
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Bottles sold</span>
            <input
              type="number"
              min={1}
              step={1}
              className={input}
              value={bottles}
              onChange={(e) => setBottles(e.target.value)}
            />
          </label>
        </div>
        {brandId && (
          <p className="text-sm text-muted-foreground">Stock available: {stockOf(brandId)} bottles</p>
        )}
        <button className={btn} disabled={busy} onClick={onAdd}>
          Save sale
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Sales on {date || "-"}</h2>
        {sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales entered for this date.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {sales.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-b py-1">
                <span>
                  {s.excise_brands?.name} {s.excise_brands?.size_ml} ml
                </span>
                <span className="flex items-center gap-3">
                  <span>{s.bottles}</span>
                  <button className="text-destructive" onClick={() => onDelete(s.id)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm font-medium">Total bottles sold: {dayTotal}</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Stock by brand</h2>
        {stock.length === 0 ? (
          <p className="text-sm text-muted-foreground">No brands yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Brand</th>
                  <th className="pr-3 text-right">Received</th>
                  <th className="pr-3 text-right">Sold</th>
                  <th className="text-right">In stock</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r) => {
                  const left = r.received - r.sold;
                  return (
                    <tr key={r.brand_id} className="border-b">
                      <td className="py-2 pr-3">
                        {r.name} {r.size_ml} ml
                      </td>
                      <td className="pr-3 text-right">{r.received}</td>
                      <td className="pr-3 text-right">{r.sold}</td>
                      <td className={`text-right ${left < 0 ? "text-destructive" : ""}`}>
                        {left}
                        {left < 0 ? " (check)" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Stock = bottles received through TP receipts minus bottles sold here. If you already had stock
          before using the app, add it once as a TP receipt (for example TP no. "OPENING").
        </p>
      </section>
    </div>
  );
}
