import { useEffect, useState } from "react";
import {
  EXCISE_CATEGORIES,
  type ExciseBrand,
  type ExciseCategory,
  type ExciseSettings,
  addExciseBrand,
  deleteExciseBrand,
  getExciseSettings,
  listExciseBrands,
  saveExciseSettings,
} from "@/lib/exciseService";

const SIZES = [60, 90, 180, 330, 375, 500, 650, 750, 1000, 2000];
const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

export default function ExciseView() {
  const [settings, setSettings] = useState<ExciseSettings>({
    hotel_name: "", licence_no: "", flr2_no: "", permit_holder_no: "",
  });
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExciseCategory>("IMFL");
  const [sizeMl, setSizeMl] = useState(750);
  const [perCase, setPerCase] = useState(12);
  const [rate, setRate] = useState(0);

  async function load() {
    try {
      setSettings(await getExciseSettings());
      setBrands(await listExciseBrands());
    } catch (e: any) {
      setMsg(`Could not load: ${e.message ?? e}`);
    }
  }
  useEffect(() => { load(); }, []);

  async function onSaveSettings() {
    setBusy(true);
    try { await saveExciseSettings(settings); setMsg("Settings saved"); }
    catch (e: any) { setMsg(`Could not save settings: ${e.message ?? e}`); }
    setBusy(false);
  }

  async function onAddBrand() {
    if (!name.trim()) { setMsg("Enter a brand name"); return; }
    setBusy(true);
    try {
      await addExciseBrand({ name: name.trim(), category, size_ml: sizeMl, bottles_per_case: perCase, rate });
      setName(""); setMsg("Brand added");
      setBrands(await listExciseBrands());
    } catch (e: any) { setMsg(`Could not add brand: ${e.message ?? e}`); }
    setBusy(false);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this brand?")) return;
    try { await deleteExciseBrand(id); setBrands(await listExciseBrands()); }
    catch (e: any) { setMsg(`Could not delete: ${e.message ?? e}`); }
  }

  const field = (label: string, key: keyof ExciseSettings) => (
    <label className="block space-y-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input className={input} value={(settings[key] as string) ?? ""}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-semibold">Excise</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">Licence details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Hotel name", "hotel_name")}
          {field("Licence no. (FL-III)", "licence_no")}
          {field("FLR-II no.", "flr2_no")}
          {field("Permit holder no.", "permit_holder_no")}
        </div>
        <button className={btn} disabled={busy} onClick={onSaveSettings}>Save settings</button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Add brand</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-sm text-muted-foreground">Brand name</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Category</span>
            <select className={input} value={category}
              onChange={(e) => setCategory(e.target.value as ExciseCategory)}>
              {EXCISE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Bottle size (ml)</span>
            <select className={input} value={sizeMl} onChange={(e) => setSizeMl(Number(e.target.value))}>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Bottles per case</span>
            <input type="number" min={1} className={input} value={perCase}
              onChange={(e) => setPerCase(Number(e.target.value))} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Rate per bottle</span>
            <input type="number" min={0} className={input} value={rate}
              onChange={(e) => setRate(Number(e.target.value))} />
          </label>
        </div>
        <button className={btn} disabled={busy} onClick={onAddBrand}>Add brand</button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Brands ({brands.length})</h2>
        {brands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No brands yet. Add your first brand above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Brand</th><th className="pr-3">Category</th>
                  <th className="pr-3">ml</th><th className="pr-3">Per case</th>
                  <th className="pr-3">Rate</th><th />
                </tr>
              </thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.id} className="border-b">
                    <td className="py-2 pr-3">{b.name}</td>
                    <td className="pr-3">{b.category}</td>
                    <td className="pr-3">{b.size_ml}</td>
                    <td className="pr-3">{b.bottles_per_case}</td>
                    <td className="pr-3">{b.rate}</td>
                    <td><button className="text-destructive" onClick={() => onDelete(b.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
