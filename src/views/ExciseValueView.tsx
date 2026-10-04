import { useEffect, useMemo, useRef, useState } from "react";
import { EXCISE_CATEGORIES, type ExciseSettings, getExciseSettings } from "@/lib/exciseService";
import { type ValueRow, getStockValue } from "@/lib/exciseValueService";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const printCss = `
@media print {
  body * { visibility: hidden; }
  #stock-value, #stock-value * { visibility: visible; color: #000 !important; background: #fff !important; }
  #stock-value { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

const inr = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const nowLocal = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

export default function ExciseValueView() {
  const start = nowLocal();
  const [year, setYear] = useState(start.year);
  const [month, setMonth] = useState(start.month);
  const [rows, setRows] = useState<ValueRow[]>([]);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setSettings(await getExciseSettings());
      } catch (e: any) {
        setMsg(`Could not load licence details: ${e.message ?? e}`);
      }
    })();
  }, []);

  useEffect(() => {
    const id = ++reqRef.current;
    setLoading(true);
    setRows([]);
    setMsg("");
    (async () => {
      try {
        const list = await getStockValue(year, month);
        if (id === reqRef.current) setRows(list);
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load report: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    })();
  }, [year, month]);

  const data = useMemo(() => {
    const visible = rows.filter((r) => r.closing_qty !== 0);
    const groups = EXCISE_CATEGORIES.map((cat) => {
      const items = visible.filter((r) => r.category === cat);
      return {
        cat,
        items,
        qty: items.reduce((s, r) => s + Math.max(r.closing_qty, 0), 0),
        value: items.reduce((s, r) => s + r.value_paise, 0),
      };
    }).filter((g) => g.items.length > 0);

    return {
      groups,
      totalQty: groups.reduce((s, g) => s + g.qty, 0),
      totalValue: groups.reduce((s, g) => s + g.value, 0),
      noRate: visible.filter((r) => r.closing_qty > 0 && r.rate_paise === 0).length,
      negative: visible.filter((r) => r.closing_qty < 0).length,
    };
  }, [rows]);

  const years = Array.from({ length: 5 }, (_, i) => start.year - 3 + i);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Stock value report</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <div className="flex flex-wrap items-end gap-3 no-print">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Month</span>
          <select className={input} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Year</span>
          <select className={input} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button className={btn} disabled={loading || data.groups.length === 0} onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <div id="stock-value" className="space-y-4 text-sm">
        <div>
          <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
          {settings?.licence_no && <p>Licence no.: {settings.licence_no}</p>}
          <p className="font-medium pt-1">
            Stock value at end of {MONTHS[month - 1]} {year}
          </p>
          <p className="text-muted-foreground">
            Value = closing bottles x the rate saved for each brand in the Excise page.
          </p>
        </div>

        {data.noRate > 0 && (
          <p className="rounded-md border p-2">
            Rate is not set for {data.noRate} brand(s) that have stock. Their value is counted as 0.
          </p>
        )}
        {data.negative > 0 && (
          <p className="rounded-md border p-2">
            {data.negative} brand(s) show minus stock (marked "check"). They are counted as 0 in the value.
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : data.groups.length === 0 ? (
          <p className="text-muted-foreground">No stock for this month.</p>
        ) : (
          data.groups.map((g) => (
            <div key={g.cat} className="space-y-1">
              <h3 className="font-medium">{g.cat}</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-1 pr-3">Brand</th>
                      <th className="pr-3 text-right">ml</th>
                      <th className="pr-3 text-right">Bottles</th>
                      <th className="pr-3 text-right">Rate</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((r) => (
                      <tr key={r.brand_id} className="border-b">
                        <td className="py-1 pr-3">{r.brand_name}</td>
                        <td className="pr-3 text-right">{r.size_ml}</td>
                        <td className={`pr-3 text-right ${r.closing_qty < 0 ? "text-destructive" : ""}`}>
                          {r.closing_qty}
                          {r.closing_qty < 0 ? " (check)" : ""}
                        </td>
                        <td className="pr-3 text-right">{inr(r.rate_paise)}</td>
                        <td className="text-right">{inr(r.value_paise)}</td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td className="py-1 pr-3" colSpan={2}>
                        Total {g.cat}
                      </td>
                      <td className="pr-3 text-right">{g.qty}</td>
                      <td className="pr-3" />
                      <td className="text-right">{inr(g.value)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}

        {data.groups.length > 0 && (
          <p className="font-medium">
            All categories: {data.totalQty} bottles | Value {inr(data.totalValue)}
          </p>
        )}
        <p className="pt-8">Signature / Stamp: ______________________</p>
      </div>
    </div>
  );
}
