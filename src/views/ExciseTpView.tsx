import { useEffect, useState } from "react";
import { type ExciseBrand, listExciseBrands } from "@/lib/exciseService";
import {
  type TpReceipt,
  createTpReceipt,
  deleteTpReceipt,
  listTpReceipts,
  setTpStatus,
} from "@/lib/exciseTpService";

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

interface Row {
  brand_id: string;
  cases: number;
  bottles: number;
}

const emptyRow = (): Row => ({ brand_id: "", cases: 0, bottles: 0 });

// Local date (not UTC), so late-night entries do not get yesterday's date.
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const toCount = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);

export default function ExciseTpView() {
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [receipts, setReceipts] = useState<TpReceipt[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [tpNo, setTpNo] = useState("");
  const [autoTpNo, setAutoTpNo] = useState("");
  const [party, setParty] = useState("");
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  async function load() {
    try {
      setBrands(await listExciseBrands());
      setReceipts(await listTpReceipts());
    } catch (e: any) {
      setMsg(`Could not load: ${e.message ?? e}`);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const brandById = (id: string) => brands.find((b) => b.id === id);
  const rowBottles = (r: Row) => r.cases * (brandById(r.brand_id)?.bottles_per_case ?? 0) + r.bottles;
  const formTotal = rows.reduce((s, r) => s + rowBottles(r), 0);

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function onSave() {
    setBusy(true);
    try {
      await createTpReceipt({
        tp_no: tpNo,
        auto_tp_no: autoTpNo,
        party,
        receipt_date: date,
        items: rows,
      });
      setTpNo("");
      setAutoTpNo("");
      setParty("");
      setRows([emptyRow()]);
      setMsg("TP receipt saved");
      await load();
    } catch (e: any) {
      setMsg(`Could not save: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onToggle(r: TpReceipt) {
    try {
      await setTpStatus(r.id, r.status === "verified" ? "not_verified" : "verified");
      await load();
    } catch (e: any) {
      setMsg(`Could not update: ${e.message ?? e}`);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this TP receipt?")) return;
    try {
      await deleteTpReceipt(id);
      await load();
    } catch (e: any) {
      setMsg(`Could not delete: ${e.message ?? e}`);
    }
  }

  const receiptBottles = (r: TpReceipt) =>
    r.excise_tp_items.reduce((s, i) => s + i.bottles_total, 0);

  const received = new Map<string, { label: string; bottles: number }>();
  receipts.forEach((r) =>
    r.excise_tp_items.forEach((i) => {
      const label = i.excise_brands
        ? `${i.excise_brands.name} ${i.excise_brands.size_ml} ml`
        : "Unknown brand";
      const cur = received.get(i.brand_id) ?? { label, bottles: 0 };
      cur.bottles += i.bottles_total;
      received.set(i.brand_id, cur);
    })
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-semibold">TP receipts</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">New TP receipt</h2>
        {brands.length === 0 && (
          <p className="text-sm text-muted-foreground">Add brands in the Excise page first.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Import TP no.</span>
            <input className={input} value={tpNo} onChange={(e) => setTpNo(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Auto TP no.</span>
            <input className={input} value={autoTpNo} onChange={(e) => setAutoTpNo(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Party / trader</span>
            <input className={input} value={party} onChange={(e) => setParty(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Date</span>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

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
                onClick={() =>
                  setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [emptyRow()])
                }
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
          Save TP receipt
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Bottles received by brand</h2>
        {received.size === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing received yet.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {Array.from(received.values()).map((v) => (
              <li key={v.label} className="flex justify-between border-b py-1">
                <span>{v.label}</span>
                <span>{v.bottles}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Receipts ({receipts.length})</h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No TP receipts yet. Save your first one above.</p>
        ) : (
          receipts.map((r) => (
            <div key={r.id} className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">TP {r.tp_no}</span>
                <span>{r.receipt_date}</span>
              </div>
              <p className="text-muted-foreground">
                {r.party || "No party"} {r.auto_tp_no ? `| Auto TP ${r.auto_tp_no}` : ""}
              </p>
              <ul className="space-y-1">
                {r.excise_tp_items.map((i) => (
                  <li key={i.id}>
                    {i.excise_brands?.name} {i.excise_brands?.size_ml} ml: {i.cases} cases + {i.bottles} bottles
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between">
                <span>Total bottles: {receiptBottles(r)}</span>
                <div className="flex gap-3">
                  <button className="underline" onClick={() => onToggle(r)}>
                    {r.status === "verified" ? "Verified (tap to undo)" : "Not verified (tap to verify)"}
                  </button>
                  <button className="text-destructive" onClick={() => onDelete(r.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
    }
