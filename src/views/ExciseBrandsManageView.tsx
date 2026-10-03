import { useCallback, useEffect, useState } from "react";
import { type ExciseBrand, listExciseBrands, updateExciseBrand } from "@/lib/exciseService";
import {
  type ParseResult,
  importBrands,
  parseBrandCsv,
} from "@/lib/exciseBrandImportService";

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

export default function ExciseBrandsManageView() {
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editPerCase, setEditPerCase] = useState("");
  const [editRate, setEditRate] = useState("");

  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);

  const load = useCallback(async () => {
    try {
      setBrands(await listExciseBrands());
    } catch (e: any) {
      setMsg(`Could not load brands: ${e.message ?? e}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(b: ExciseBrand) {
    setEditId(b.id);
    setEditName(b.name);
    setEditPerCase(String(b.bottles_per_case));
    setEditRate(String(b.rate));
    setMsg("");
  }

  async function onSaveEdit() {
    const name = editName.trim();
    const perCase = Number(editPerCase);
    const rate = Number(editRate);
    if (!name) {
      setMsg("Brand name cannot be empty");
      return;
    }
    if (!Number.isInteger(perCase) || perCase < 1) {
      setMsg("Bottles per case must be a whole number (1 or more)");
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setMsg("Rate must be a number (0 or more)");
      return;
    }
    setBusy(true);
    try {
      await updateExciseBrand(editId, {
        name,
        bottles_per_case: perCase,
        rate: Math.round(rate * 100) / 100,
      });
      setEditId("");
      setMsg("Brand updated");
      await load();
    } catch (e: any) {
      setMsg(
        e?.code === "23505"
          ? "A brand with this name and size already exists"
          : `Could not update: ${e.message ?? e}`
      );
    }
    setBusy(false);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setCsvText(await file.text());
      setParsed(null);
      setMsg("");
    } catch {
      setMsg("Could not read this file. Save it as CSV and try again, or paste the rows below.");
    }
  }

  function onCheck() {
    setParsed(parseBrandCsv(csvText));
    setMsg("");
  }

  async function onImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    try {
      const result = await importBrands(parsed.rows);
      setMsg(`Import done: ${result.added} added, ${result.updated} updated`);
      setCsvText("");
      setParsed(null);
      await load();
    } catch (e: any) {
      setMsg(`Import stopped: ${e.message ?? e}. You can fix it and import again, rows already saved will just be updated.`);
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-semibold">Brand prices</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">Your brands ({brands.length})</h2>
        {brands.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No brands yet. Add them in "Brands & settings", or import a CSV below.
          </p>
        ) : (
          <div className="space-y-2">
            {brands.map((b) =>
              editId === b.id ? (
                <div key={b.id} className="rounded-md border p-3 space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    {b.category} | {b.size_ml} ml (category and size cannot be changed)
                  </p>
                  <label className="block space-y-1">
                    <span className="text-muted-foreground">Brand name</span>
                    <input className={input} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-muted-foreground">Bottles per case</span>
                      <input
                        type="number"
                        min={1}
                        className={input}
                        value={editPerCase}
                        onChange={(e) => setEditPerCase(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-muted-foreground">Rate per bottle</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={input}
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button className={btn} disabled={busy} onClick={onSaveEdit}>
                      Save
                    </button>
                    <button className="text-sm underline" onClick={() => setEditId("")}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={b.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {b.name} {b.size_ml} ml
                    </p>
                    <p className="text-muted-foreground">
                      {b.category} | {b.bottles_per_case} per case | Rate {b.rate}
                    </p>
                  </div>
                  <button className="underline" onClick={() => startEdit(b)}>
                    Edit
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Import brands from CSV</h2>
        <p className="text-sm text-muted-foreground">
          One brand per line: name, category, size_ml, bottles_per_case, rate. Only the first three are
          required. Brands that already exist get the new rate; new brands are added. Excel file? Save it as
          CSV first.
        </p>
        <pre className="text-xs rounded-md border p-2 overflow-x-auto">
{`name,category,size_ml,bottles_per_case,rate
Royal Stag,IMFL,750,12,1200
Kingfisher Strong,Ferm Beer,650,12,160`}
        </pre>
        <input type="file" accept=".csv,text/csv,text/plain" onChange={onPickFile} className="text-sm" />
        <textarea
          className={`${input} h-40 font-mono`}
          placeholder="Or paste the rows here"
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setParsed(null);
          }}
        />
        <button className={btn} disabled={busy || !csvText.trim()} onClick={onCheck}>
          Check file
        </button>

        {parsed && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">{parsed.rows.length} brand(s) ready to import</p>
            {parsed.errors.length > 0 && (
              <div className="rounded-md border p-2 space-y-1">
                <p className="font-medium">{parsed.errors.length} problem(s), these rows are skipped:</p>
                <ul className="list-disc pl-5">
                  {parsed.errors.slice(0, 20).map((er) => (
                    <li key={er}>{er}</li>
                  ))}
                </ul>
                {parsed.errors.length > 20 && <p>...and {parsed.errors.length - 20} more</p>}
              </div>
            )}
            <button className={btn} disabled={busy || parsed.rows.length === 0} onClick={onImport}>
              Import {parsed.rows.length} brand(s)
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
