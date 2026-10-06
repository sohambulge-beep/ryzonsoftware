import { useCallback, useEffect, useMemo, useState } from "react";
import { type ExciseSettings, getExciseSettings, listExciseBrands } from "@/lib/exciseService";
import { type StockRow, getStockSummary } from "@/lib/exciseSalesService";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const DRAFT_KEY = "taptrack_stock_check_draft";

const printCss = `
@media print {
  body * { visibility: hidden; }
  #stock-check-report, #stock-check-report * { visibility: visible; color: #000 !important; background: #fff !important; }
  #stock-check-report { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

// Local date (not UTC).
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Money is added up in paise (whole numbers).
const inr = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExciseStockCheckView() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [ratePaise, setRatePaise] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [draftReady, setDraftReady] = useState(false);
  const [query, setQuery] = useState("");
  const [showUnused, setShowUnused] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [asOf, setAsOf] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const [s, brands] = await Promise.all([getStockSummary(), listExciseBrands()]);
      const rates: Record<string, number> = {};
      for (const b of brands) rates[b.id] = Math.round((Number(b.rate) || 0) * 100);
      setStock(s);
      setRatePaise(rates);
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
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const clean: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string" && /^\d{1,6}$/.test(v)) clean[k] = v;
          }
          setCounts(clean);
        }
      }
    } catch {
      // storage can be blocked or the draft unreadable; start empty
    }
    setDraftReady(true);
  }, [load]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(counts));
    } catch {
      // ignore
    }
  }, [counts, draftReady]);

  function setBrandCount(brandId: string, value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 6);
    setCounts((prev) => {
      const next = { ...prev };
      if (clean === "") delete next[brandId]; // empty means "not counted yet"
      else next[brandId] = clean; // "0" means "counted, none on the shelf"
      return next;
    });
  }

  function onClear() {
    if (!confirm("Clear all counted numbers?")) return;
    setCounts({});
  }

  const model = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = stock.map((r) => {
      const system = r.received - r.sold;
      const c = counts[r.brand_id];
      const counted = c === undefined ? null : Number(c);
      return {
        ...r,
        system,
        counted,
        diff: counted === null ? null : counted - system,
        rate: ratePaise[r.brand_id] ?? 0,
      };
    });

    const pool = all.filter((r) => showUnused || r.received !== 0 || r.sold !== 0 || r.counted !== null);

    const listed = pool.filter((r) => {
      if (q !== "" && !(r.name.toLowerCase().includes(q) || r.counted !== null)) return false;
      if (onlyDiff && !(r.diff !== null && r.diff !== 0)) return false;
      return true;
    });

    const countedRows = pool.flatMap((r) => (r.diff === null ? [] : [{ ...r, diff: r.diff }]));
    const diffs = countedRows
      .filter((r) => r.diff !== 0)
      .sort((a, b) => a.diff - b.diff || a.name.localeCompare(b.name));
    const short = diffs.filter((r) => r.diff < 0);
    const extra = diffs.filter((r) => r.diff > 0);

    return {
      listed,
      totalCount: pool.length,
      countedCount: countedRows.length,
      matched: countedRows.length - diffs.length,
      diffs,
      shortBottles: short.reduce((s, r) => s - r.diff, 0),
      extraBottles: extra.reduce((s, r) => s + r.diff, 0),
      shortValue: short.reduce((s, r) => s - r.diff * r.rate, 0),
      extraValue: extra.reduce((s, r) => s + r.diff * r.rate, 0),
    };
  }, [stock, ratePaise, counts, query, showUnused, onlyDiff]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Physical stock check</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <p className="text-sm text-muted-foreground no-print">
        Count the bottles on your shelf and type the number against each brand. Leave a brand empty if you have not
        counted it yet. This page only compares; it does not change your stock. Your numbers are saved on this phone
        until you clear them.
      </p>

      <div className="flex flex-wrap items-end gap-3 no-print">
        <label className="block space-y-1 grow">
          <span className="text-sm text-muted-foreground">Search brand</span>
          <input
            className={`${input} w-full`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type part of a brand name"
          />
        </label>
        <button className={btn} disabled={loading} onClick={load}>
          Refresh stock
        </button>
        <button className="text-sm underline pb-2" onClick={onClear}>
          Clear counts
        </button>
      </div>

      <div className="space-y-1 no-print">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          Show only brands with a difference
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
          Also show brands that have never been stocked or sold
        </label>
      </div>

      <div className="no-print">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : model.listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No brands to show.</p>
        ) : (
          <div className="space-y-2">
            {model.listed.map((r) => (
              <div key={r.brand_id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.name} {r.size_ml} ml
                  </p>
                  <p className="text-muted-foreground">
                    {r.category} | System stock: {r.system}
                  </p>
                  {r.diff !== null && (
                    <p className={r.diff < 0 ? "text-destructive" : "text-muted-foreground"}>
                      {r.diff === 0 ? "Matches" : r.diff < 0 ? `${-r.diff} short` : `${r.diff} extra`}
                    </p>
                  )}
                </div>
                <input
                  className={`${input} w-24 text-right`}
                  inputMode="numeric"
                  placeholder="Counted"
                  value={counts[r.brand_id] ?? ""}
                  onChange={(e) => setBrandCount(r.brand_id, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <section id="stock-check-report" className="space-y-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
            <p className="font-medium pt-1">Physical stock check{asOf ? `: ${asOf}` : ""}</p>
          </div>
          <button
            className={`${btn} no-print`}
            disabled={model.countedCount === 0}
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
        </div>

        {model.countedCount === 0 ? (
          <p className="text-muted-foreground">Type the counted bottles above to see the result here.</p>
        ) : (
          <>
            <p>
              Counted {model.countedCount} of {model.totalCount} brand(s). {model.matched} matched,{" "}
              {model.diffs.length} with a difference.
            </p>
            <p>
              Short: {model.shortBottles} bottles (about {inr(model.shortValue)}) | Extra: {model.extraBottles} bottles
              (about {inr(model.extraValue)})
            </p>

            {model.diffs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-1 pr-3">Brand</th>
                      <th className="pr-3 text-right">ml</th>
                      <th className="pr-3 text-right">System</th>
                      <th className="pr-3 text-right">Counted</th>
                      <th className="pr-3 text-right">Difference</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.diffs.map((r) => (
                      <tr key={r.brand_id} className="border-b">
                        <td className="py-1 pr-3">{r.name}</td>
                        <td className="pr-3 text-right">{r.size_ml}</td>
                        <td className="pr-3 text-right">{r.system}</td>
                        <td className="pr-3 text-right">{r.counted}</td>
                        <td className={`pr-3 text-right ${r.diff < 0 ? "text-destructive" : ""}`}>
                          {r.diff > 0 ? `+${r.diff}` : r.diff}
                        </td>
                        <td className="text-right">{inr(Math.abs(r.diff) * r.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          System stock = bottles received through TP receipts minus bottles sold in Daily sales. Value uses the rate
          saved for each brand.
        </p>
        <p className="pt-8">Counted by: ____________________ Checked by: ____________________</p>
      </section>
    </div>
  );
}
