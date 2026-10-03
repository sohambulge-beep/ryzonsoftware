import { useEffect, useMemo, useRef, useState } from "react";
import { EXCISE_CATEGORIES, type ExciseSettings, getExciseSettings } from "@/lib/exciseService";
import { type ReturnRow, getMonthlyReturn } from "@/lib/exciseReturnService";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const printCss = `
@media print {
  body * { visibility: hidden; }
  #flr4-report, #flr4-report * { visibility: visible; color: #000 !important; background: #fff !important; }
  #flr4-report { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

const nowLocal = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

export default function ExciseFlr4View() {
  const start = nowLocal();
  const [year, setYear] = useState(start.year);
  const [month, setMonth] = useState(start.month);
  const [rows, setRows] = useState<ReturnRow[]>([]);
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
        const list = await getMonthlyReturn(year, month);
        if (id === reqRef.current) setRows(list);
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load report: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    })();
  }, [year, month]);

  const groups = useMemo(() => {
    const visible = rows.filter(
      (r) => r.opening_qty !== 0 || r.receipts_qty !== 0 || r.sales_qty !== 0 || r.closing_qty !== 0
    );
    return EXCISE_CATEGORIES.map((cat) => {
      const items = visible.filter((r) => r.category === cat);
      const sum = (f: (r: ReturnRow) => number) => items.reduce((s, r) => s + f(r), 0);
      return {
        cat,
        items,
        opening: sum((r) => r.opening_qty),
        receipts: sum((r) => r.receipts_qty),
        sales: sum((r) => r.sales_qty),
        closing: sum((r) => r.closing_qty),
      };
    }).filter((g) => g.items.length > 0);
  }, [rows]);

  const grand = groups.reduce(
    (t, g) => ({
      opening: t.opening + g.opening,
      receipts: t.receipts + g.receipts,
      sales: t.sales + g.sales,
      closing: t.closing + g.closing,
    }),
    { opening: 0, receipts: 0, sales: 0, closing: 0 }
  );

  const years = Array.from({ length: 5 }, (_, i) => start.year - 3 + i);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Monthly return (FLR-4 summary)</h1>
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
        <button className={btn} disabled={loading} onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <div id="flr4-report" className="space-y-4 text-sm">
        <div>
          <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
          {settings?.licence_no && <p>Licence no.: {settings.licence_no}</p>}
          {settings?.flr2_no && <p>FLR-II no.: {settings.flr2_no}</p>}
          {settings?.permit_holder_no && <p>Permit holder no.: {settings.permit_holder_no}</p>}
          <p className="font-medium pt-1">
            Monthly stock return (bottles): {MONTHS[month - 1]} {year}
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">No stock or sales for this month.</p>
        ) : (
          groups.map((g) => (
            <div key={g.cat} className="space-y-1">
              <h3 className="font-medium">{g.cat}</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-1 pr-3">Brand</th>
                      <th className="pr-3 text-right">ml</th>
                      <th className="pr-3 text-right">Open</th>
                      <th className="pr-3 text-right">Receipts</th>
                      <th className="pr-3 text-right">Total</th>
                      <th className="pr-3 text-right">Sales</th>
                      <th className="text-right">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((r) => (
                      <tr key={r.brand_id} className="border-b">
                        <td className="py-1 pr-3">{r.brand_name}</td>
                        <td className="pr-3 text-right">{r.size_ml}</td>
                        <td className="pr-3 text-right">{r.opening_qty}</td>
                        <td className="pr-3 text-right">{r.receipts_qty}</td>
                        <td className="pr-3 text-right">{r.opening_qty + r.receipts_qty}</td>
                        <td className="pr-3 text-right">{r.sales_qty}</td>
                        <td className={`text-right ${r.closing_qty < 0 ? "text-destructive" : ""}`}>
                          {r.closing_qty}
                          {r.closing_qty < 0 ? " (check)" : ""}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td className="py-1 pr-3" colSpan={2}>
                        Total {g.cat}
                      </td>
                      <td className="pr-3 text-right">{g.opening}</td>
                      <td className="pr-3 text-right">{g.receipts}</td>
                      <td className="pr-3 text-right">{g.opening + g.receipts}</td>
                      <td className="pr-3 text-right">{g.sales}</td>
                      <td className="text-right">{g.closing}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}

        {groups.length > 0 && (
          <p className="font-medium">
            All categories: Open {grand.opening} | Receipts {grand.receipts} | Total{" "}
            {grand.opening + grand.receipts} | Sales {grand.sales} | Closing {grand.closing}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Summary from TapTrack records, in bottles. Check the format with your excise consultant before
          submitting to the department.
        </p>
        <p className="pt-8">Signature / Stamp: ______________________</p>
      </div>
    </div>
  );
}
