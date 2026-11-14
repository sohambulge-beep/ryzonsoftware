import { Component, useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  EXCISE_CATEGORIES,
  listExciseBrands,
  type ExciseBrand,
  type ExciseCategory,
} from "@/lib/exciseService";
import { useOwnerAccess } from "@/lib/ownerAccess";

// The table is not all in the generated types, so cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const MAX_ROWS = 1000;
const CHUNK = 100;
const MAX_FILE = 500000;

const EXAMPLE = `Royal Stag, IMFL, 750, 12, 520
Kingfisher Strong, Ferm Beer, 650, 12, 160
Sula Rasa Red, Wine, 750, 12, 1100`;

interface ParsedRow {
  line: number;
  name: string;
  category: ExciseCategory;
  size_ml: number;
  bottles_per_case: number;
  rate: number;
}

const keyOf = (name: string, size: number) => `${name.trim().toLowerCase()}|${size}`;

// "ferm beer" -> "Ferm Beer". Null when it cannot be told for sure (for example just "Beer").
function normCategory(raw: string): ExciseCategory | null {
  const k = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  for (const c of EXCISE_CATEGORIES) {
    if (c.toLowerCase() === k) return c;
  }
  if (k === "fermented beer" || k === "strong beer") return "Ferm Beer";
  if (k === "mild") return "Mild Beer";
  return null;
}

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

function parseText(text: string): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  let first = true;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cols = splitLine(line);
    // A first line without a number in the size column is a header: skip it.
    if (first) {
      first = false;
      if (cols.length >= 3 && !/\d/.test(cols[2] ?? "")) return;
    }
    const n = i + 1;
    if (rows.length + errors.length >= MAX_ROWS + 50) return;
    if (cols.length < 5) {
      errors.push(`Line ${n}: needs 5 columns (name, category, size ml, bottles per case, rate)`);
      return;
    }
    const name = (cols[0] ?? "").trim();
    if (name.length < 1 || name.length > 80) {
      errors.push(`Line ${n}: the name must be 1 to 80 letters`);
      return;
    }
    const category = normCategory(cols[1] ?? "");
    if (!category) {
      errors.push(`Line ${n}: category "${cols[1] ?? ""}" is not one of ${EXCISE_CATEGORIES.join(", ")}`);
      return;
    }
    const sizeText = (cols[2] ?? "").replace(/ml/i, "").trim();
    if (!/^\d+$/.test(sizeText) || Number(sizeText) < 1 || Number(sizeText) > 5000) {
      errors.push(`Line ${n}: size "${cols[2] ?? ""}" must be a whole number of ml (1 to 5000)`);
      return;
    }
    const caseText = (cols[3] ?? "").trim();
    if (!/^\d+$/.test(caseText) || Number(caseText) < 1 || Number(caseText) > 200) {
      errors.push(`Line ${n}: bottles per case "${cols[3] ?? ""}" must be a whole number (1 to 200)`);
      return;
    }
    const rateText = (cols[4] ?? "").replace(/₹|rs\.?|,|\s/gi, "");
    const rate = Number(rateText);
    if (rateText === "" || !Number.isFinite(rate) || rate < 0 || rate > 1000000) {
      errors.push(`Line ${n}: rate "${cols[4] ?? ""}" must be a number`);
      return;
    }
    rows.push({
      line: n,
      name,
      category,
      size_ml: Number(sizeText),
      bottles_per_case: Number(caseText),
      rate: Math.round(rate * 100) / 100,
    });
  });
  return { rows, errors };
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">The brand import could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { isOwner } = useOwnerAccess();
  const [text, setText] = useState("");
  const [existing, setExisting] = useState<ExciseBrand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadExisting = useCallback(async () => {
    try {
      setExisting(await listExciseBrands());
      setLoaded(true);
    } catch (e: any) {
      setMsg(`Could not read the brands already saved: ${e?.message ?? e}`);
    }
  }, []);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const parsed = useMemo(() => parseText(text), [text]);

  // Only brands that are really new are imported: same name and size as a saved brand, or repeated in the paste, are skipped.
  const plan = useMemo(() => {
    const have = new Set(existing.map((b) => keyOf(b.name, b.size_ml)));
    const seen = new Set<string>();
    const toAdd: ParsedRow[] = [];
    let alreadySaved = 0;
    let repeated = 0;
    for (const r of parsed.rows) {
      const k = keyOf(r.name, r.size_ml);
      if (have.has(k)) alreadySaved += 1;
      else if (seen.has(k)) repeated += 1;
      else {
        seen.add(k);
        toAdd.push(r);
      }
    }
    return { toAdd: toAdd.slice(0, MAX_ROWS), alreadySaved, repeated, tooMany: toAdd.length > MAX_ROWS };
  }, [parsed, existing]);

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

  async function onImport() {
    if (!isOwner || busy) return;
    if (plan.toAdd.length === 0) {
      setMsg("Nothing new to import.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setMsg("Internet is needed to import.");
      return;
    }
    if (!confirm(`Import ${plan.toAdd.length} new brand(s)?`)) return;
    setBusy(true);
    setMsg("");
    let done = 0;
    try {
      for (let i = 0; i < plan.toAdd.length; i += CHUNK) {
        const chunk = plan.toAdd.slice(i, i + CHUNK).map((r) => ({
          name: r.name,
          category: r.category,
          size_ml: r.size_ml,
          bottles_per_case: r.bottles_per_case,
          rate: r.rate,
        }));
        const { error } = await db.from("excise_brands").insert(chunk);
        if (error) throw new Error(error.message);
        done += chunk.length;
      }
      setMsg(`${done} brand(s) imported.`);
      setText("");
    } catch (e: any) {
      setMsg(
        `Stopped after ${done} brand(s): ${e?.message ?? e}. Import again: the brands already added are skipped.`
      );
    }
    await loadExisting();
    setBusy(false);
  }

  if (!isOwner) return <p className="p-4 text-sm">Importing brands is for the owner only.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Import brands</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Add many brands at once. Make a list in Excel with 5 columns: name, category, size in ml, bottles per case, rate.
        Copy the cells and paste them below, or pick a CSV file. The category must be one of {EXCISE_CATEGORIES.join(", ")}.
        A brand that is already saved (same name and size) is skipped. Peg prices are not needed here: they follow the
        bottle rate unless you set them in the Liquor counter.
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
        rows={9}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={EXAMPLE}
      />

      {text.trim() !== "" && (
        <section className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">
            {parsed.rows.length} correct line(s) | {plan.toAdd.length} new | {plan.alreadySaved} already saved |{" "}
            {plan.repeated} repeated in the paste | {parsed.errors.length} problem(s)
          </p>
          {!loaded && <p className="text-muted-foreground">Checking the saved brands...</p>}
          {plan.tooMany && <p className="text-destructive">Only the first {MAX_ROWS} new brands will be imported.</p>}
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
          {plan.toAdd.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground">New brands (first 15):</p>
              {plan.toAdd.slice(0, 15).map((r) => (
                <p key={r.line}>
                  {r.name} {r.size_ml} ml | {r.category} | {r.bottles_per_case} per case | rate {r.rate}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <button className={btn} disabled={busy || !loaded || plan.toAdd.length === 0} onClick={onImport}>
        {busy ? "Importing..." : `Import ${plan.toAdd.length} brand(s)`}
      </button>
    </div>
  );
}

export default function BrandImportView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
