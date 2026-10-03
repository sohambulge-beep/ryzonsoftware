import { supabase } from "@/integrations/supabase/client";
import { EXCISE_CATEGORIES, type ExciseCategory } from "@/lib/exciseService";

// New tables are not in generated types until Lovable regenerates them, so cast.
const db = supabase as any;

export interface ImportRow {
  name: string;
  category: ExciseCategory;
  size_ml: number;
  bottles_per_case: number;
  rate: number;
}

export interface ParseResult {
  rows: ImportRow[];
  errors: string[];
}

const MAX_ROWS = 500;
const PAGE = 1000;

const CATEGORY_MAP = new Map<string, ExciseCategory>(
  EXCISE_CATEGORIES.map((c) => [c.toLowerCase(), c] as [string, ExciseCategory])
);
CATEGORY_MAP.set("fermented beer", "Ferm Beer");

function splitCsv(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  const endRow = () => {
    row.push(cur);
    cur = "";
    if (row.some((x) => x.trim() !== "")) records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      cur += c;
    }
  }
  endRow();
  return records;
}

const toNumber = (v: string) => Number(v.replace(/,/g, ""));
const keyOf = (name: string, size: number) => `${name.trim().toLowerCase()}|${size}`;

// Columns: name, category, size_ml, bottles_per_case (optional, default 12), rate (optional, default 0)
export function parseBrandCsv(input: string): ParseResult {
  const records = splitCsv(input.replace(/^\uFEFF/, ""));
  const rows: ImportRow[] = [];
  const errors: string[] = [];

  if (records.length === 0) return { rows, errors: ["The file is empty"] };

  let start = 0;
  const first = (records[0][0] ?? "").trim().toLowerCase();
  if (first === "name" || first === "brand" || first === "brand name") start = 1;

  if (records.length - start > MAX_ROWS) {
    return { rows, errors: [`Too many rows. Import up to ${MAX_ROWS} brands at a time`] };
  }

  const seen = new Set<string>();
  for (let i = start; i < records.length; i++) {
    const line = i + 1;
    const c = records[i].map((x) => x.trim());
    const name = c[0] ?? "";
    const category = CATEGORY_MAP.get((c[1] ?? "").toLowerCase().replace(/\s+/g, " "));
    const size = toNumber(c[2] ?? "");
    const perCase = c[3] ? toNumber(c[3]) : 12;
    const rate = c[4] ? toNumber(c[4]) : 0;

    if (!name) {
      errors.push(`Row ${line}: brand name is empty`);
      continue;
    }
    if (name.length > 100) {
      errors.push(`Row ${line}: brand name is too long`);
      continue;
    }
    if (!category) {
      errors.push(`Row ${line}: category must be IMFL, MML, Wine, Ferm Beer or Mild Beer`);
      continue;
    }
    if (!Number.isInteger(size) || size <= 0) {
      errors.push(`Row ${line}: size_ml must be a whole number like 750`);
      continue;
    }
    if (!Number.isInteger(perCase) || perCase < 1) {
      errors.push(`Row ${line}: bottles_per_case must be a whole number (1 or more)`);
      continue;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      errors.push(`Row ${line}: rate must be a number (0 or more)`);
      continue;
    }
    const key = keyOf(name, size);
    if (seen.has(key)) {
      errors.push(`Row ${line}: ${name} ${size} ml is repeated in the file, this row is skipped`);
      continue;
    }
    seen.add(key);
    rows.push({
      name,
      category,
      size_ml: size,
      bottles_per_case: perCase,
      rate: Math.round(rate * 100) / 100,
    });
  }
  return { rows, errors };
}

async function loadExisting(): Promise<{ id: string; name: string; category: string; size_ml: number }[]> {
  const all: { id: string; name: string; category: string; size_ml: number }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("excise_brands")
      .select("id, name, category, size_ml")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// New brands are added. Brands that already exist (same name and size) only get the new
// rate and bottles per case; their category is kept as it is.
export async function importBrands(rows: ImportRow[]): Promise<{ added: number; updated: number }> {
  if (rows.length === 0) return { added: 0, updated: 0 };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");
  const userId = auth.user.id;

  const existing = await loadExisting();
  const byKey = new Map(existing.map((b) => [keyOf(b.name, b.size_ml), b]));

  const toInsert: any[] = [];
  const toUpdate: any[] = [];
  for (const r of rows) {
    const found = byKey.get(keyOf(r.name, r.size_ml));
    if (found) {
      toUpdate.push({
        id: found.id,
        user_id: userId,
        name: found.name,
        category: found.category,
        size_ml: r.size_ml,
        bottles_per_case: r.bottles_per_case,
        rate: r.rate,
      });
    } else {
      toInsert.push({
        user_id: userId,
        name: r.name,
        category: r.category,
        size_ml: r.size_ml,
        bottles_per_case: r.bottles_per_case,
        rate: r.rate,
      });
    }
  }

  for (let i = 0; i < toInsert.length; i += 100) {
    const { error } = await db.from("excise_brands").insert(toInsert.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < toUpdate.length; i += 100) {
    const { error } = await db
      .from("excise_brands")
      .upsert(toUpdate.slice(i, i + 100), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  return { added: toInsert.length, updated: toUpdate.length };
}
