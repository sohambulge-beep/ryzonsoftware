import { useEffect, useMemo, useRef, useState } from "react";
import { type ExciseSettings, getExciseSettings } from "@/lib/exciseService";
import { type ReturnRow, getMonthlyReturn } from "@/lib/exciseReturnService";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const COLUMNS: { label: string; cats: string[] }[] = [
  { label: "Spirits", cats: ["IMFL"] },
  { label: "Wine", cats: ["Wine"] },
  { label: "S. Beer", cats: ["Ferm Beer"] },
  { label: "M. Beer", cats: ["Mild Beer"] },
  { label: "MML", cats: ["MML"] },
];

const ROWS = [
  { key: "open", label: "Opening" },
  { key: "rec", label: "Receipts" },
  { key: "total", label: "Total" },
  { key: "sal", label: "Sales" },
  { key: "clo", label: "Closing" },
] as const;

const printCss = `
@media print {
  body * { visibility: hidden; }
  #bulk-litre, #bulk-litre * { visibility: visible; color: #000 !important; background: #fff !important; }
  #bulk-litre { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

interface Col {
  label: string;
  open: number;
  rec: number;
  sal: number;
  clo: number;
}

// Litres are worked out from whole millilitres, so there is no decimal slip.
const lit = (ml: number) =>
  (ml / 1000).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const nowLocal = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

const valueOf = (c: Col, key: (typeof ROWS)[number]["key"]) => {
  if (key === "open") return c.open;
  if (key === "rec") return c.rec;
  if (key === "total") return c.open + c.rec;
  if (key === "sal") return c.sal;
  return c.clo;
};

export default function ExciseBulkLitreView() {
  const start = nowLocal();
  const [year, setYear] = useState(start.year);
  const [month, setMonth] = useState(start.month);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
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

  const model = useMemo(() => {
    const cols: Col[] = COLUMNS.map((col) => {
      let open = 0;
      let rec = 0;
      let sal = 0;
      let clo = 0;
      for (const r of rows) {
        if (!col.cats.includes(r.category)) continue;
        open += r.opening_qty * r.size_ml;
        rec += r.receipts_qty * r.size_ml;
        sal += r.sales_qty * r.size_ml;
        clo += r.closing_qty * r.size_ml;
      }
      return { label: col.label, open, rec, sal, clo };
    });
    const all: Col = cols.reduce(
      (t, c) => ({
        label: "All",
        open: t.open + c.open,
        rec: t.rec + c.rec,
        sal: t.sal + c.sal,
        clo: t.clo + c.clo,
      }),
      { label: "All", open: 0, rec: 0, sal: 0, clo: 0 }
    );
    return {
      cols,
      all,
      empty: all.open === 0 && all.rec === 0 && all.sal === 0 && all.clo === 0,
      mismatch: cols.some((c) => c.open + c.rec - c.sal !== c.clo),
    };
  }, [rows]);

  const years = Array.from({ length: 5 }, (_, i) => start.year - 3 + i);
  const shown = [...model.cols, model.all];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">FLR-4 bulk litre</h1>
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
        <button className={btn} disabled={loading || model.empty} onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <div id="bulk-litre" className="space-y-4 text-sm">
        <div>
          <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
          {settings?.licence_no && <p>Licence no.: {settings.licence_no}</p>}
          {settings?.flr2_no && <p>FLR-II no.: {settings.flr2_no}</p>}
          {settings?.permit_holder_no && <p>Permit holder no.: {settings.permit_holder_no}</p>}
          <p className="font-medium pt-1">
            Bulk litre: {MONTHS[month - 1]} {year}
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : model.empty ? (
          <p className="text-muted-foreground">No stock or sales for this month.</p>
        ) : (
          <>
            {model.mismatch && (
              <p className="rounded-md border p-2">
                Opening plus Receipts minus Sales does not match Closing in at least one column. Please check the
                entries before using this report.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1 pr-3">Litres</th>
                    {shown.map((c) => (
                      <th key={c.label} className="pr-3 text-right">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.key} className={`border-b ${row.key === "total" || row.key === "clo" ? "font-medium" : ""}`}>
                      <td className="py-1 pr-3">{row.label}</td>
                      {shown.map((c) => {
                        const v = valueOf(c, row.key);
                        return (
                          <td key={c.label} className={`pr-3 text-right ${v < 0 ? "text-destructive" : ""}`}>
                            {lit(v)}
                            {v < 0 ? " (check)" : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Litres = bottles x bottle size in ml, divided by 1000. IMFL is shown as Spirits, Fermented Beer as S. Beer
          and Mild Beer as M. Beer. Sales are counted in whole bottles. Check this table against the department
          format before submitting.
        </p>
        <p className="pt-8">Signature / Stamp: ______________________</p>
      </div>
    </div>
  );
}
