import { Component, useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listExciseBrands, type ExciseBrand } from "@/lib/exciseService";
import { createTpReceipt } from "@/lib/exciseTpService";
import { useOwnerAccess } from "@/lib/ownerAccess";

// The tables are not all in the generated types, so cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const MAX_FILE = 500000;
const MAX_ROWS = 1000;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const EXAMPLE = `Royal Stag, 750, 5, 3
Kingfisher Strong, 650, 10, 0`;

const pad = (n: number) => String(n).padStart(2, "0");

// Last day of the month before (year, month). month is 1 to 12.
const dayBefore = (year: number, month: number) => {
  const d = new Date(year, month - 1, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const keyOf = (name: string, size: number) => `${name.trim().toLowerCase()}|${size}`;

// Splits one line: tab (Excel paste), |, ; or comma. A comma line may have "quoted, names".
function splitLine(line: string): string[] {
  const delim = line.includes("\t") ? "\t" : line.includes("|") ? "|" : line.includes(";") ? ";" : ",";
  if (delim !== ",") return line.split(delim).map((s) => s.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

interface OpenRow {
  line: number;
  brand: ExciseBrand;
  cases: number;
  bottles: number;
  total: number;
}

// Reads the pasted lines and matches each one to a saved brand (same name and size).
function parseOpening(text: string, brands: ExciseBrand[]): { rows: OpenRow[]; errors: string[] } {
  const byKey = new Map<string, ExciseBrand>();
  for (const b of brands) byKey.set(keyOf(b.name, b.size_ml), b);
  const rows: OpenRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let first = true;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cols = splitLine(line);
    // A first line without a number in the size column is a header: skip it.
    if (first) {
      first = false;
      if (cols.length >= 2 && !/\d/.test(cols[1] ?? "")) return;
    }
    const n = i + 1;
    if (rows.length + errors.length >= MAX_ROWS + 50) return;
    if (cols.length < 4) {
      errors.push(`Line ${n}: needs 4 columns (name, size ml, cases, bottles)`);
      return;
    }
    const name = (cols[0] ?? "").trim();
    const sizeText = (cols[1] ?? "").replace(/ml/i, "").trim();
    if (name === "" || !/^\d+$/.test(sizeText)) {
      errors.push(`Line ${n}: name and size (whole ml) are needed`);
      return;
    }
    const casesText = (cols[2] ?? "").trim();
    const bottlesText = (cols[3] ?? "").trim();
    if (!/^\d{1,6}$/.test(casesText) || !/^\d{1,6}$/.test(bottlesText)) {
      errors.push(`Line ${n}: cases and bottles must be whole numbers`);
      return;
    }
    const brand = byKey.get(keyOf(name, Number(sizeText)));
    if (!brand) {
      errors.push(`Line ${n}: "${name} ${sizeText} ml" is not in your brands. Add it first (Import brands above).`);
      return;
    }
    const cases = Number(casesText);
    const bottles = Number(bottlesText);
    if (cases + bottles === 0) {
      errors.push(`Line ${n}: ${name} ${sizeText} ml has 0 cases and 0 bottles`);
      return;
    }
    if (seen.has(brand.id)) {
      errors.push(`Line ${n}: ${name} ${sizeText} ml is repeated`);
      return;
    }
    seen.add(brand.id);
    rows.push({ line: n, brand, cases, bottles, total: cases * (brand.bottles_per_case || 0) + bottles });
  });
  return { rows, errors };
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="text-sm">The opening stock import could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { isOwner } = useOwnerAccess();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [text, setText] = useState("");
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [openings, setOpenings] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBrands(await listExciseBrands());
      const { data, error } = await db
        .from("excise_tp_receipts")
        .select("tp_no")
        .ilike("tp_no", "OPENING%")
        .limit(200);
      if (error) throw new Error(error.message);
      setOpenings(((data ?? []) as any[]).map((r) => String(r.tp_no)));
      setLoaded(true);
    } catch (e: any) {
      setMsg(`Could not load: ${e?.message ?? e}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openingDate = dayBefore(year, month);
  const tpNo = `OPENING-${openingDate}`;
  const exists = openings.includes(tpNo);

  const parsed = useMemo(() => parseOpening(text, brands), [text, brands]);
  const totalBottles = parsed.rows.reduce((s, r) => s + r.total, 0);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_FILE) {
      setMsg("That file is too big. Use a file under 500 KB.");
      return;
    }
    f.text()
      .then((t) => {
        setText(t);
        setMsg("");
      })
      .catch(() => setMsg("The file could not be read."));
  }

  async function onSave() {
    if (!isOwner || busy) return;
    if (parsed.rows.length === 0) {
      setMsg("Nothing to save.");
      return;
    }
    if (parsed.errors.length > 0) {
      setMsg(
        "Fix the problems first. The opening stock of a date can be saved only once, so it must be complete."
      );
      return;
    }
    if (exists) {
      setMsg(`Opening stock dated ${openingDate} is already saved. Delete it in the Opening stock tab to enter it again.`);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setMsg("Internet is needed to save.");
      return;
    }
    if (
      !confirm(
        `Save the opening stock dated ${openingDate} for ${parsed.rows.length} brand(s), ${totalBottles} bottle(s) in all?`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await createTpReceipt({
        tp_no: tpNo,
        auto_tp_no: "",
        party: "Opening stock",
        receipt_date: openingDate,
        items: parsed.rows.map((r) => ({ brand_id: r.brand.id, cases: r.cases, bottles: r.bottles })),
      });
      setMsg(`Opening stock saved: ${parsed.rows.length} brand(s), ${totalBottles} bottle(s).`);
      setText("");
      await load();
    } catch (e: any) {
      setMsg(`Could not save: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  if (!isOwner) return null;

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Opening stock (paste)</h2>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Add the stock you already have, for many brands at once. Pick the month you start using the app: the stock is
        the stock you had on the last day of the month before. Paste 4 columns: name, size in ml, cases, bottles. The
        brands must already be saved. If one line is wrong nothing is saved, because the opening stock of a date can be
        saved only once.
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
        Opening stock will be dated <span className="font-medium">{openingDate}</span>.
        {exists ? " It is already saved: delete it in the Opening stock tab to enter it again." : ""}
      </p>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="underline cursor-pointer">
          Pick a CSV file
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onFile} />
        </label>
        <button className="underline" onClick={() => setText(EXAMPLE)}>
          Fill an example
        </button>
        <button className="underline" onClick={() => setText("")}>
          Clear
        </button>
      </div>

      <textarea
        className={`${input} w-full font-mono text-xs`}
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={EXAMPLE}
      />

      {text.trim() !== "" && (
        <section className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">
            {parsed.rows.length} brand(s) | {totalBottles} bottle(s) | {parsed.errors.length} problem(s)
          </p>
          {!loaded && <p className="text-muted-foreground">Checking the saved brands...</p>}
          {parsed.errors.length > 0 && (
            <div className="space-y-1">
              {parsed.errors.slice(0, 20).map((e, i) => (
                <p key={i} className="text-destructive">
                  {e}
                </p>
              ))}
              {parsed.errors.length > 20 && (
                <p className="text-muted-foreground">{parsed.errors.length - 20} more problems not shown.</p>
              )}
            </div>
          )}
          {parsed.rows.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground">First 15 brands:</p>
              {parsed.rows.slice(0, 15).map((r) => (
                <p key={r.line}>
                  {r.brand.name} {r.brand.size_ml} ml | {r.cases} case(s) + {r.bottles} bottle(s) = {r.total} bottle(s)
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <button
        className={btn}
        disabled={busy || !loaded || parsed.rows.length === 0 || parsed.errors.length > 0 || exists}
        onClick={onSave}
      >
        {busy ? "Saving..." : "Save opening stock"}
      </button>
    </div>
  );
}

export default function OpeningImportSection() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
