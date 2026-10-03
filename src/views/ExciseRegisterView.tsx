import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ExciseBrand,
  type ExciseSettings,
  getExciseSettings,
  listExciseBrands,
} from "@/lib/exciseService";
import { type StockRegister, getStockRegister } from "@/lib/exciseRegisterService";

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const printCss = `
@media print {
  body * { visibility: hidden; }
  #stock-register, #stock-register * { visibility: visible; color: #000 !important; background: #fff !important; }
  #stock-register { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

// Local dates (not UTC), so late-night use does not shift the day.
const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => toIso(new Date());
const monthStartIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};

export default function ExciseRegisterView() {
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [brandId, setBrandId] = useState("");
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [register, setRegister] = useState<StockRegister | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setBrands(await listExciseBrands());
        setSettings(await getExciseSettings());
      } catch (e: any) {
        setMsg(`Could not load: ${e.message ?? e}`);
      }
    })();
  }, []);

  useEffect(() => {
    const id = ++reqRef.current;
    setRegister(null);
    setMsg("");
    if (!brandId || !from || !to) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const result = await getStockRegister(brandId, from, to);
        if (id === reqRef.current) setRegister(result);
      } catch (e: any) {
        if (id === reqRef.current) setMsg(e.message ?? String(e));
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    })();
  }, [brandId, from, to]);

  const brand = brands.find((b) => b.id === brandId);

  const table = useMemo(() => {
    if (!register) return null;
    let running = register.openingQty;
    let totalReceipts = 0;
    let totalSales = 0;
    const rows = register.days.map((d) => {
      running += d.receipts - d.sales;
      totalReceipts += d.receipts;
      totalSales += d.sales;
      return { ...d, balance: running };
    });
    return { rows, totalReceipts, totalSales, closing: running };
  }, [register]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Stock register (brand wise)</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <div className="grid gap-3 sm:grid-cols-3 no-print">
        <label className="block space-y-1 sm:col-span-3">
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
          <span className="text-sm text-muted-foreground">From date</span>
          <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">To date</span>
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button className={btn} disabled={!table} onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </div>

      {brands.length === 0 && (
        <p className="text-sm text-muted-foreground no-print">Add brands in the Excise page first.</p>
      )}
      {!brandId && brands.length > 0 && (
        <p className="text-sm text-muted-foreground no-print">Select a brand to see its register.</p>
      )}
      {loading && <p className="text-sm text-muted-foreground no-print">Loading...</p>}

      {table && brand && (
        <div id="stock-register" className="space-y-3 text-sm">
          <div>
            <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
            {settings?.licence_no && <p>Licence no.: {settings.licence_no}</p>}
            <p className="font-medium pt-1">
              Stock register: {brand.name} {brand.size_ml} ml ({brand.category})
            </p>
            <p className="text-muted-foreground">
              Period: {from} to {to}
            </p>
          </div>

          <p className="font-medium">Opening stock: {register?.openingQty} bottles</p>

          {table.rows.length === 0 ? (
            <p className="text-muted-foreground">No receipts or sales in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1 pr-3">Date</th>
                    <th className="pr-3 text-right">Received</th>
                    <th className="pr-3 text-right">Sold</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r) => (
                    <tr key={r.date} className="border-b">
                      <td className="py-1 pr-3 whitespace-nowrap">{r.date}</td>
                      <td className="pr-3 text-right">{r.receipts || ""}</td>
                      <td className="pr-3 text-right">{r.sales || ""}</td>
                      <td className={`text-right ${r.balance < 0 ? "text-destructive" : ""}`}>
                        {r.balance}
                        {r.balance < 0 ? " (check)" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1 font-medium">
            <p>Total received: {table.totalReceipts}</p>
            <p>Total sold: {table.totalSales}</p>
            <p>Closing stock: {table.closing} bottles</p>
          </div>
          <p className="pt-8">Signature / Stamp: ______________________</p>
        </div>
      )}
    </div>
  );
}
