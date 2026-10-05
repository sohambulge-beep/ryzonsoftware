import { useCallback, useEffect, useMemo, useState } from "react";
import { type ExciseSettings, getExciseSettings } from "@/lib/exciseService";
import { type StockRow, getStockSummary } from "@/lib/exciseSalesService";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const KEY = "taptrack_low_stock_limit";
const DEFAULT_LIMIT = "24";

const printCss = `
@media print {
  body * { visibility: hidden; }
  #low-stock, #low-stock * { visibility: visible; color: #000 !important; background: #fff !important; }
  #low-stock { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

// Local date (not UTC).
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function ExciseLowStockView() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [limitStr, setLimitStr] = useState(DEFAULT_LIMIT);
  const [showUnused, setShowUnused] = useState(false);
  const [asOf, setAsOf] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      setRows(await getStockSummary());
      setAsOf(localToday());
    } catch (e: any) {
      setMsg(`Could not load stock: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      try {
        setSettings(await getExciseSettings());
      } catch {
        // the hotel name on the printout is optional
      }
    })();
    try {
      const saved = localStorage.getItem(KEY);
      if (saved !== null && /^\d{1,6}$/.test(saved)) setLimitStr(saved);
    } catch {
      // storage can be blocked; the default limit is used
    }
  }, [load]);

  function onLimitChange(value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 6);
    setLimitStr(clean);
    try {
      if (clean !== "") localStorage.setItem(KEY, clean);
    } catch {
      // ignore
    }
  }

  const limit = limitStr === "" ? null : Number(limitStr);

  const data = useMemo(() => {
    if (limit === null) return null;
    const pool = rows.filter((r) => showUnused || r.received !== 0 || r.sold !== 0);
    const low = pool
      .map((r) => ({ ...r, left: r.received - r.sold }))
      .filter((r) => r.left <= limit)
      .sort(
        (a, b) =>
          a.left - b.left || a.name.localeCompare(b.name) || a.size_ml - b.size_ml
      );
    return { low, out: low.filter((r) => r.left <= 0).length, tracked: pool.length };
  }, [rows, limit, showUnused]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Low stock list</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <div className="flex flex-wrap items-end gap-3 no-print">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Show brands with this many bottles or fewer</span>
          <input
            className={`${input} w-32`}
            inputMode="numeric"
            value={limitStr}
            onChange={(e) => onLimitChange(e.target.value)}
          />
        </label>
        <button className={btn} disabled={loading} onClick={load}>
          Refresh
        </button>
        <button className={btn} disabled={!data || data.low.length === 0} onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm no-print">
        <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
        Also show brands that have never been stocked or sold
      </label>

      <div id="low-stock" className="space-y-4 text-sm">
        <div>
          <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
          <p className="font-medium pt-1">Low stock list{asOf ? `: ${asOf}` : ""}</p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : limit === null ? (
          <p className="text-muted-foreground">Enter a number to see the list.</p>
        ) : !data || data.low.length === 0 ? (
          <p className="text-muted-foreground">
            No brand is at {limit} bottles or fewer. Everything above this level is fine.
          </p>
        ) : (
          <>
            <p>
              {data.low.length} of {data.tracked} brand(s) are at {limit} bottles or fewer ({data.out} out of stock).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1 pr-3">Brand</th>
                    <th className="pr-3 text-right">ml</th>
                    <th className="pr-3">Category</th>
                    <th className="text-right">In stock</th>
                  </tr>
                </thead>
                <tbody>
                  {data.low.map((r) => (
                    <tr key={r.brand_id} className="border-b">
                      <td className="py-1 pr-3">{r.name}</td>
                      <td className="pr-3 text-right">{r.size_ml}</td>
                      <td className="pr-3">{r.category}</td>
                      <td className={`text-right ${r.left < 0 ? "text-destructive" : ""}`}>
                        {r.left}
                        {r.left < 0 ? " (check)" : r.left === 0 ? " (out)" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Stock = bottles received through TP receipts minus bottles sold in Daily sales.
        </p>
      </div>
    </div>
  );
}
