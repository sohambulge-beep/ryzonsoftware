import { useEffect, useState } from "react";
import { EXCISE_CATEGORIES, type ExciseBrand, type ExciseCategory, addExciseBrand } from "@/lib/exciseService";
import { createTpReceipt } from "@/lib/exciseTpService";
import {
  buildItems,
  guessCategory,
  impliedPerCase,
  matchBrand,
  parseTpText,
  rowTotal,
} from "@/lib/exciseTpImportService";

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const btn2 = "rounded-md border px-3 py-2 text-sm disabled:opacity-50";

interface Line {
  key: number;
  brand: string;
  size_ml: number;
  mrp: number;
  batch: string;
  mfg: string;
  cases: number;
  bottles: number;
  tpTotal: number;
  brand_id: string;
  category: ExciseCategory;
}

interface Props {
  brands: ExciseBrand[];
  existingTpNos: string[];
  onSaved: () => Promise<void> | void;
  onBrandsChanged: () => Promise<void> | void;
  onMessage: (m: string) => void;
}

const MAX_FILE = 1024 * 1024;
const toCount = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);

export default function TpImportPanel({ brands, existingTpNos, onSaved, onBrandsChanged, onMessage }: Props) {
  const [text, setText] = useState("");
  const [tpNo, setTpNo] = useState("");
  const [autoTpNo, setAutoTpNo] = useState("");
  const [party, setParty] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // When the brand list changes (for example after adding a brand), match the rows that still have no brand.
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => (l.brand_id ? l : { ...l, brand_id: matchBrand(brands, l.brand, l.size_ml)?.id ?? "" }))
    );
  }, [brands]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const name = f.name.toLowerCase();
    if (/\.(xlsx|xls)$/.test(name)) {
      onMessage("Excel file cannot be read here. Open it in Excel, choose Save as CSV, and pick that file.");
      return;
    }
    if (/\.(pdf|png|jpe?g|webp|heic)$/.test(name)) {
      onMessage("PDF or photo cannot be read here. Open the PDF, select the whole table, copy it, and paste it in the box below.");
      return;
    }
    if (f.size > MAX_FILE) {
      onMessage("This file is too big. Use a CSV file under 1 MB.");
      return;
    }
    try {
      setText(await f.text());
    } catch {
      onMessage("Could not open this file.");
    }
  }

  function onRead() {
    const res = parseTpText(text);
    setWarnings(res.warnings);
    if (res.lines.length === 0) {
      setLines([]);
      return;
    }
    if (res.meta.tp_no) setTpNo(res.meta.tp_no);
    if (res.meta.auto_tp_no) setAutoTpNo(res.meta.auto_tp_no);
    if (res.meta.party) setParty(res.meta.party);
    if (res.meta.date) setDate(res.meta.date);
    setLines(
      res.lines.map((l, i) => ({
        key: i,
        brand: l.brand,
        size_ml: l.size_ml,
        mrp: l.mrp,
        batch: l.batch,
        mfg: l.mfg,
        cases: l.cases,
        bottles: l.bottles,
        tpTotal: l.total,
        brand_id: matchBrand(brands, l.brand, l.size_ml)?.id ?? "",
        category: guessCategory(l.brand),
      }))
    );
  }

  const update = (key: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function addBrandFor(l: Line) {
    if (!l.brand.trim()) {
      onMessage("This row has no brand name. Type the brand name in Brands & settings first.");
      return;
    }
    setBusy(true);
    try {
      await addExciseBrand({
        name: l.brand.trim(),
        category: l.category,
        size_ml: l.size_ml,
        bottles_per_case: impliedPerCase(l) ?? 12,
        rate: l.mrp > 0 ? l.mrp : 0,
      });
      await onBrandsChanged();
      onMessage(`Brand added: ${l.brand} ${l.size_ml} ml`);
    } catch (e: any) {
      onMessage(`Could not add brand: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  const brandOf = (id: string) => brands.find((b) => b.id === id);
  const totalBottles = lines.reduce((s, l) => s + rowTotal(l, brandOf(l.brand_id)), 0);
  const unmatched = lines.filter((l) => !l.brand_id).length;

  async function onSave() {
    if (!tpNo.trim()) return onMessage("Enter the TP number.");
    if (!date) return onMessage("Choose the TP date.");
    if (existingTpNos.includes(tpNo.trim())) return onMessage("This TP number is already saved.");
    const built = buildItems(lines, brands);
    if ("error" in built) return onMessage(built.error);
    setBusy(true);
    try {
      await createTpReceipt({
        tp_no: tpNo,
        auto_tp_no: autoTpNo,
        party,
        receipt_date: date,
        items: built.items,
      });
      onMessage(
        `TP ${tpNo.trim()} saved: ${built.items.length} rows, ${built.total} bottles.` +
          (built.notes.length ? ` Note: ${built.notes.join("; ")}` : "")
      );
      setText("");
      setLines([]);
      setWarnings([]);
      setTpNo("");
      setAutoTpNo("");
      setParty("");
      setDate("");
      await onSaved();
    } catch (e: any) {
      onMessage(`Could not save: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium">Import TP (paste or CSV file)</h2>
      <p className="text-sm text-muted-foreground">
        Open the TP PDF, select the whole table (from the heading row to the Total row), copy it and paste it below. A CSV
        file with the columns <span className="font-mono">brand,size_ml,cases,bottles</span> also works. You will see every row
        and can fix it before saving.
      </p>

      <label className="block">
        <span className="text-sm text-muted-foreground">CSV / text file (optional)</span>
        <input type="file" accept=".csv,.tsv,.txt" onChange={onFile} className="block text-sm mt-1" />
      </label>

      <textarea
        className={`${input} h-40 font-mono text-xs`}
        placeholder="Paste the TP text or CSV here"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className={btn} onClick={onRead} disabled={busy || !text.trim()}>
        Read TP
      </button>

      {warnings.length > 0 && (
        <ul className="text-sm rounded-md border border-amber-500/50 p-2 space-y-1">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <div className="space-y-3">
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
            {lines.map((l, i) => {
              const b = brandOf(l.brand_id);
              const sameSize = brands.filter((x) => x.size_ml === l.size_ml);
              const others = brands.filter((x) => x.size_ml !== l.size_ml);
              return (
                <div key={l.key} className="rounded-md border p-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {i + 1}. {l.brand || "(brand not read)"} {l.size_ml} ml
                    </span>
                    <button
                      className="text-destructive"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {l.mrp > 0 ? `MRP ${l.mrp}` : ""} {l.batch ? `| Batch ${l.batch}` : ""} {l.mfg ? `| Mfg ${l.mfg}` : ""}
                  </p>
                  <div className="grid grid-cols-6 gap-2 items-end">
                    <label className="col-span-6 sm:col-span-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Brand in your app</span>
                      <select
                        className={input}
                        value={l.brand_id}
                        onChange={(e) => update(l.key, { brand_id: e.target.value })}
                      >
                        <option value="">Select brand</option>
                        {sameSize.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name} {x.size_ml} ml
                          </option>
                        ))}
                        {others.length > 0 && (
                          <optgroup label="Other sizes">
                            {others.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name} {x.size_ml} ml
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </label>
                    <label className="col-span-3 sm:col-span-1 space-y-1">
                      <span className="text-xs text-muted-foreground">Cases</span>
                      <input
                        type="number"
                        min={0}
                        className={input}
                        value={l.cases}
                        onChange={(e) => update(l.key, { cases: toCount(e.target.value), tpTotal: 0 })}
                      />
                    </label>
                    <label className="col-span-3 sm:col-span-1 space-y-1">
                      <span className="text-xs text-muted-foreground">Bottles</span>
                      <input
                        type="number"
                        min={0}
                        className={input}
                        value={l.bottles}
                        onChange={(e) => update(l.key, { bottles: toCount(e.target.value), tpTotal: 0 })}
                      />
                    </label>
                    <div className="col-span-6 sm:col-span-1 text-xs text-muted-foreground pb-2">
                      Total: <span className="font-medium text-foreground">{rowTotal(l, b)}</span>
                    </div>
                  </div>
                  {!l.brand_id && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Not in your brand list:</span>
                      <select
                        className="rounded-md border px-2 py-1 text-xs bg-background"
                        value={l.category}
                        onChange={(e) => update(l.key, { category: e.target.value as ExciseCategory })}
                      >
                        {EXCISE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button className={btn2} disabled={busy} onClick={() => addBrandFor(l)}>
                        Add as new brand
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-sm">
            Rows: {lines.length} | Total bottles: {totalBottles}
            {unmatched > 0 ? ` | ${unmatched} row(s) still need a brand` : ""}
          </p>
          <button className={btn} disabled={busy || lines.length === 0} onClick={onSave}>
            Save TP receipt
          </button>
        </div>
      )}
    </section>
  );
}
