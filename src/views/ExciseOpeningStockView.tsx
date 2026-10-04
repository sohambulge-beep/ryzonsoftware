import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type ExciseBrand, listExciseBrands } from "@/lib/exciseService";
import { createTpReceipt, deleteTpReceipt } from "@/lib/exciseTpService";

// Tables created later are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

// Last day of the month before (year, month). month is 1 to 12.
const dayBefore = (year: number, month: number) => {
  const d = new Date(year, month - 1, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toCount = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);

interface Row {
  brand_id: string;
  cases: number;
  bottles: number;
}
const emptyRow = (): Row => ({ brand_id: "", cases: 0, bottles: 0 });

interface OpeningReceipt {
  id: string;
  tp_no: string;
  receipt_date: string;
  excise_tp_items: {
    cases: number;
    bottles: number;
    bottles_total: number;
    excise_brands: { name: string; size_ml: number } | null;
  }[];
}

export default function ExciseOpeningStockView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [saved, setSaved] = useState<OpeningReceipt[]>([]);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const openingDate = dayBefore(year, month);
  const tpNo = `OPENING-${openingDate}`;

  const load = useCallback(async () => {
    try {
      setBrands(await listExciseBrands());
      const { data, error } = await db
        .from("excise_tp_receipts")
        .select(
          "id, tp_no, receipt_date, excise_tp_items(cases, bottles, bottles_total, excise_brands(name, size_ml))"
        )
        .ilike("tp_no", "OPENING%")
        .order("receipt_date", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      setSaved(data ?? []);
    } catch (e: any) {
      setMsg(`Could not load: ${e.message ?? e}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const brandById = (id: string) => brands.find((b) => b.id === id);
  const rowTotal = (r: Row) => r.cases * (brandById(r.brand_id)?.bottles_per_case ?? 0) + r.bottles;
  const formTotal = rows.reduce((s, r) => s + (r.brand_id ? rowTotal(r) : 0), 0);

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function onSave() {
    const items = rows.filter((r) => r.brand_id && r.cases + r.bottles > 0);
    if (items.length === 0) {
      setMsg("Add at least one brand with cases or bottles");
      return;
    }
    if (new Set(items.map((r) => r.brand_id)).size !== items.length) {
      setMsg("A brand is repeated. Use one row per brand");
      return;
    }
    if (saved.some((s) => s.tp_no === tpNo)) {
      setMsg(`Opening stock dated ${openingDate} is already saved. Delete it below to enter it again.`);
      return;
    }
    setBusy(true);
    try {
      await createTpReceipt({
        tp_no: tpNo,
        auto_tp_no: "",
        party: "Opening stock",
        receipt_date: openingDate,
        items,
      });
      setRows([emptyRow()]);
      setMsg("Opening stock saved");
      await load();
    } catch (e: any) {
      setMsg(`Could not save: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this opening stock? Your stock will go down by these bottles.")) return;
    try {
      await deleteTpReceipt(id);
      setMsg("Opening stock deleted");
      await load();
    } catch (e: any) {
      setMsg(`Could not delete: ${e.message ?? e}`);
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-semibold">Opening stock</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">Start tracking from</h2>
        <p className="text-sm text-muted-foreground">
          Pick the month you start using the app. The stock you enter is the stock you already had on the last day
          of the month before.
        </p>
        <div className="flex flex-wrap gap-3">
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
        </div>
        <p className="text-sm">
          Opening stock will be dated <span className="font-medium">{openingDate}</span>, so it shows as "Open" in the
          reports for {MONTHS[month - 1]} {year}.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Stock you already have</h2>
        {brands.length === 0 && (
          <p className="text-sm text-muted-foreground">Add brands in the Excise page first.</p>
        )}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-6 gap-2 items-end">
              <label className="col-span-6 sm:col-span-3 space-y-1">
                <span className="text-xs text-muted-foreground">Brand</span>
                <select
                  className={input}
                  value={r.brand_id}
                  onChange={(e) => updateRow(i, { brand_id: e.target.value })}
                >
                  <option value="">Select brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.size_ml} ml ({b.category})
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 sm:col-span-1 space-y-1">
                <span className="text-xs text-muted-foreground">Cases</span>
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={r.cases}
                  onChange={(e) => updateRow(i, { cases: toCount(e.target.value) })}
                />
              </label>
              <label className="col-span-2 sm:col-span-1 space-y-1">
                <span className="text-xs text-muted-foreground">Bottles</span>
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={r.bottles}
                  onChange={(e) => updateRow(i, { bottles: toCount(e.target.value) })}
                />
              </label>
              <button
                className="col-span-2 sm:col-span-1 text-destructive text-sm pb-2"
                onClick={() => setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [emptyRow()])}
              >
                Remove
              </button>
            </div>
          ))}
          <button className="text-sm underline" onClick={() => setRows([...rows, emptyRow()])}>
            Add another brand
          </button>
        </div>
        <p className="text-sm">Total bottles: {formTotal}</p>
        <button className={btn} disabled={busy} onClick={onSave}>
          Save opening stock
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Saved opening stock ({saved.length})</h2>
        {saved.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
        ) : (
          saved.map((s) => (
            <div key={s.id} className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{s.tp_no}</span>
                <span>{s.receipt_date}</span>
              </div>
              <ul className="space-y-1">
                {s.excise_tp_items.map((i, idx) => (
                  <li key={idx}>
                    {i.excise_brands?.name} {i.excise_brands?.size_ml} ml: {i.cases} cases + {i.bottles} bottles
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between">
                <span>Total bottles: {s.excise_tp_items.reduce((t, i) => t + i.bottles_total, 0)}</span>
                <button className="text-destructive" onClick={() => onDelete(s.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
