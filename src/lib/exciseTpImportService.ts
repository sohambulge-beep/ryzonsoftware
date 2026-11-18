import type { ExciseBrand } from "@/lib/exciseService";

// Reads a Transport Pass (Form F.L. 1-A) that was pasted as text (copied from the portal PDF) or loaded
// from a CSV file. Nothing here touches the database: it only reads, matches and checks.

export interface TpLine {
  brand: string;
  size_ml: number;
  strength: number;
  mrp: number;
  cases: number;
  bottles: number;
  total: number; // total bottles as written on the TP (0 if the file did not have it)
  batch: string;
  mfg: string;
}

export interface TpMeta {
  tp_no: string;
  auto_tp_no: string;
  party: string;
  date: string; // yyyy-mm-dd or ""
}

export interface TpParseResult {
  meta: TpMeta;
  lines: TpLine[];
  warnings: string[];
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const pad = (n: number) => String(n).padStart(2, "0");
const num = (v: string) => {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
};

function toIsoDate(raw: string): string {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})[A-Za-z]*[-\/\s](\d{4})$/);
  if (m) {
    const mm = MONTHS[m[2].toLowerCase()];
    return mm ? `${m[3]}-${mm}-${pad(Number(m[1]))}` : "";
  }
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return "";
    return `${m[3]}-${pad(mo)}-${pad(d)}`;
  }
  return "";
}

export function extractTpMeta(text: string): TpMeta {
  const flat = text.replace(/\s+/g, " ");
  const meta: TpMeta = { tp_no: "", auto_tp_no: "", party: "", date: "" };

  const m = flat.match(/(\d{3,})\s*\/\s*(\d{1,2}[-\/ ](?:[A-Za-z]{3,9}|\d{1,2})[-\/ ]\d{4})(?:\s*\[\s*([A-Za-z0-9\-\/]+)\s*\])?/);
  if (m) {
    meta.tp_no = m[1];
    meta.date = toIsoDate(m[2]);
    meta.auto_tp_no = m[3] ?? "";
  }

  const p = flat.match(
    /([A-Z][A-Z0-9&.,'\- ]{2,60}?\b(?:LLP|LTD|LIMITED|PVT\.? ?LTD\.?|DISTILLERS?|DISTILLERIES|BREWERIES|BREWERY|TRADERS|ENTERPRISES?))\b/
  );
  if (p) meta.party = p[1].replace(/\s+/g, " ").trim();
  return meta;
}

function footerTotal(flat: string): number | null {
  const all = [...flat.matchAll(/\bTotal\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gi)];
  if (all.length === 0) return null;
  const last = all[all.length - 1];
  return num(last[3]);
}

// ---------- text copied from the TP PDF ----------

const ROW_RE =
  /(\d{2,4})\s*ml\.?(?:\s*\(\s*[A-Za-z]+\s*\))?\s+(\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\S+)\s+([A-Za-z]{3,9}[-\s.]?\d{2,4})/gi;

function cleanBrand(raw: string, isFirst: boolean): string {
  let s = raw;
  if (isFirst) {
    // The first row comes after the column headings: keep only what is after the last heading word.
    let cut = 0;
    for (const h of s.matchAll(/(?:Mfg\.?|Number|Approved|\bml\.)/gi)) {
      cut = (h.index ?? 0) + h[0].length;
    }
    s = s.slice(cut);
    s = s.replace(/^(?:\s*\d{1,2}\b)+/, "");
  } else {
    s = s.replace(/^(?:\s*\d{1,2}\s+){1,2}/, "");
  }
  s = s.replace(/Code:\s*\S+/gi, " ");
  s = s.replace(/\s+\./g, " ").replace(/[.\s]+$/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function parsePdfText(text: string): TpLine[] {
  const flat = text.replace(/[\u00a0\t\r\n]+/g, " ").replace(/\s+/g, " ");
  const out: TpLine[] = [];
  let lastEnd = 0;
  for (const m of flat.matchAll(ROW_RE)) {
    const idx = m.index ?? 0;
    const segment = flat.slice(lastEnd, idx);
    lastEnd = idx + m[0].length;

    let strength = 0;
    let brandPart = segment;
    const strengths = [...segment.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
    if (strengths.length > 0) {
      const last = strengths[strengths.length - 1];
      strength = num(last[1]);
      brandPart = segment.slice(0, last.index ?? segment.length);
    }

    const brand = cleanBrand(brandPart, out.length === 0);
    out.push({
      brand,
      size_ml: num(m[1]),
      strength: Number.isFinite(strength) ? strength : 0,
      mrp: num(m[2]),
      cases: Math.abs(num(m[3])),
      bottles: Math.abs(num(m[4])),
      total: num(m[5]),
      batch: m[6],
      mfg: m[7],
    });
  }
  return out;
}

// ---------- CSV / pasted table ----------

function detectDelimiter(firstLine: string): string {
  const counts: [string, number][] = [
    ["\t", (firstLine.match(/\t/g) ?? []).length],
    [",", (firstLine.match(/,/g) ?? []).length],
    [";", (firstLine.match(/;/g) ?? []).length],
    ["|", (firstLine.match(/\|/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function splitDelimited(text: string, delim: string): string[][] {
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
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else cur += c;
  }
  endRow();
  return records;
}

type Field = "brand" | "size" | "cases" | "bottles" | "total" | "mrp" | "batch" | "mfg";

const HEADER_WORDS: [Field, string[]][] = [
  ["brand", ["brand", "brand name", "name", "name of brand", "variety", "item"]],
  ["size", ["size", "size_ml", "size ml", "ml", "size of the bottle in ml"]],
  ["cases", ["cases", "case", "no of cases", "no. of cases"]],
  ["bottles", ["bottles", "loose", "no of bottles", "no. of bottles", "loose bottles"]],
  ["total", ["total", "total bottles", "total_bottles"]],
  ["mrp", ["mrp", "mrp approved", "rate"]],
  ["batch", ["batch", "batch no", "batch number"]],
  ["mfg", ["mfg", "month of mfg", "month"]],
];

function fieldOf(cell: string): Field | null {
  const k = cell.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [f, names] of HEADER_WORDS) if (names.includes(k)) return f;
  return null;
}

function parseTable(text: string): { lines: TpLine[]; warnings: string[] } | null {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const delim = detectDelimiter(firstLine);
  const records = splitDelimited(clean, delim);
  if (records.length === 0) return null;

  const map = new Map<Field, number>();
  let start = 0;
  const headerFields = records[0].map(fieldOf);
  if (headerFields.includes("brand") && (headerFields.includes("cases") || headerFields.includes("bottles") || headerFields.includes("total"))) {
    headerFields.forEach((f, i) => {
      if (f && !map.has(f)) map.set(f, i);
    });
    start = 1;
  } else {
    // No heading row: brand, size_ml, cases, bottles
    (["brand", "size", "cases", "bottles"] as Field[]).forEach((f, i) => map.set(f, i));
    if (records[0].length < 4) return null;
  }

  const warnings: string[] = [];
  const lines: TpLine[] = [];
  const get = (r: string[], f: Field) => {
    const i = map.get(f);
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  for (let i = start; i < records.length; i++) {
    const r = records[i];
    const brand = get(r, "brand");
    const size = num(get(r, "size").replace(/ml/i, ""));
    if (!brand) continue;
    if (!Number.isFinite(size) || size <= 0) {
      warnings.push(`Row ${i + 1} (${brand}): size is missing or not a number, skipped.`);
      continue;
    }
    const cases = get(r, "cases") === "" ? 0 : num(get(r, "cases"));
    const bottles = get(r, "bottles") === "" ? 0 : num(get(r, "bottles"));
    const total = get(r, "total") === "" ? 0 : num(get(r, "total"));
    if (![cases, bottles, total].every(Number.isFinite) || cases < 0 || bottles < 0 || total < 0) {
      warnings.push(`Row ${i + 1} (${brand}): cases/bottles/total must be numbers, skipped.`);
      continue;
    }
    if (cases + bottles + total === 0) {
      warnings.push(`Row ${i + 1} (${brand}): no quantity, skipped.`);
      continue;
    }
    const mrp = get(r, "mrp") === "" ? 0 : num(get(r, "mrp"));
    lines.push({
      brand,
      size_ml: size,
      strength: 0,
      mrp: Number.isFinite(mrp) ? mrp : 0,
      cases: Math.floor(cases),
      bottles: cases + bottles === 0 && total > 0 ? Math.floor(total) : Math.floor(bottles),
      total: Math.floor(total),
      batch: get(r, "batch"),
      mfg: get(r, "mfg"),
    });
  }
  return { lines, warnings };
}

export function parseTpText(text: string): TpParseResult {
  const input = text.trim();
  const warnings: string[] = [];
  const meta = extractTpMeta(input);
  if (!input) return { meta, lines: [], warnings: ["Nothing to read. Paste the TP text or choose a CSV file."] };

  let lines: TpLine[] = [];
  const hasHeaderRow = /(^|\n)[^\n]*\bbrand\b[^\n]*(cases|bottles|total)[^\n]*/i.test(input) && /[,\t;|]/.test(input);

  if (hasHeaderRow) {
    const t = parseTable(input);
    if (t) {
      lines = t.lines;
      warnings.push(...t.warnings);
    }
  }
  if (lines.length === 0) lines = parsePdfText(input);
  if (lines.length === 0) {
    const t = parseTable(input);
    if (t) {
      lines = t.lines;
      warnings.push(...t.warnings);
    }
  }

  if (lines.length === 0) {
    warnings.push(
      "I could not find any brand rows. Copy the whole table from the TP PDF (from the heading row to the Total row), or use a CSV with the columns: brand,size_ml,cases,bottles."
    );
    return { meta, lines, warnings };
  }

  const flat = input.replace(/\s+/g, " ");
  const foot = footerTotal(flat);
  const readTotal = lines.reduce((s, l) => s + (l.total > 0 ? l.total : 0), 0);
  if (foot !== null && readTotal > 0) {
    if (Math.round(foot) !== Math.round(readTotal)) {
      warnings.push(`The TP says ${foot} bottles in total but I read ${readTotal}. A row may be missing or wrong, please check each row.`);
    }
  }
  for (const [i, l] of lines.entries()) {
    if (!l.brand) warnings.push(`Row ${i + 1}: brand name could not be read, please pick the brand.`);
  }
  return { meta, lines, warnings };
}

// ---------- matching with the brands already in the app ----------

const STOP = new Set(["wine", "beer", "whisky", "whiskey", "premium", "quality", "fortified", "strong", "super", "the", "and", "of", "ml", "can"]);

export function brandTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

export function matchBrand(brands: ExciseBrand[], name: string, sizeMl: number): ExciseBrand | null {
  const a = brandTokens(name);
  if (a.length === 0) return null;
  const aSet = new Set(a);
  let best: ExciseBrand | null = null;
  let bestScore = 0;
  for (const b of brands) {
    if (b.size_ml !== sizeMl) continue;
    const bt = brandTokens(b.name);
    if (bt.length === 0) continue;
    const bSet = new Set(bt);
    const inter = [...aSet].filter((t) => bSet.has(t)).length;
    if (inter === 0) continue;
    const union = new Set([...aSet, ...bSet]).size;
    const jaccard = inter / union;
    const smaller = Math.min(aSet.size, bSet.size);
    const contained = inter === smaller && smaller >= 2;
    const ok = jaccard === 1 || contained || jaccard >= 0.75;
    if (ok && jaccard > bestScore) {
      best = b;
      bestScore = jaccard;
    }
  }
  return best;
}

export function guessCategory(name: string): ExciseBrand["category"] {
  const n = name.toLowerCase();
  if (/\bwine\b/.test(n)) return "Wine";
  if (/\bbeer\b|lager|magnum|strong/.test(n)) return "Ferm Beer";
  return "IMFL";
}

// ---------- turning reviewed rows into what the TP receipt needs ----------

export interface ReviewRow {
  cases: number;
  bottles: number;
  tpTotal: number; // total bottles from the file; 0 once the person edits cases/bottles
  brand_id: string;
}

// Bottles per case as written on the TP (only when it is clear: whole cases and no loose bottles).
export function impliedPerCase(r: { cases: number; bottles: number; tpTotal: number }): number | null {
  if (r.cases > 0 && r.bottles === 0 && r.tpTotal > 0 && r.tpTotal % r.cases === 0) return r.tpTotal / r.cases;
  return null;
}

export function rowTotal(r: ReviewRow, brand: ExciseBrand | undefined): number {
  if (r.tpTotal > 0) return r.tpTotal;
  return r.cases * (brand?.bottles_per_case ?? 0) + r.bottles;
}

export function buildItems(
  rows: ReviewRow[],
  brands: ExciseBrand[]
): { error: string } | { items: { brand_id: string; cases: number; bottles: number }[]; notes: string[]; total: number } {
  const items: { brand_id: string; cases: number; bottles: number }[] = [];
  const notes: string[] = [];
  let total = 0;
  for (const [i, r] of rows.entries()) {
    const brand = brands.find((b) => b.id === r.brand_id);
    if (!brand) return { error: `Row ${i + 1}: please pick a brand (or add it as a new brand).` };
    const t = rowTotal(r, brand);
    if (!(t > 0)) return { error: `Row ${i + 1} (${brand.name}): quantity is zero.` };
    const fromCases = r.cases * brand.bottles_per_case + r.bottles;
    if (fromCases === t) {
      items.push({ brand_id: brand.id, cases: r.cases, bottles: r.bottles });
    } else {
      // The case size in the app is different from the TP, so count everything as loose bottles to keep the total exact.
      items.push({ brand_id: brand.id, cases: 0, bottles: t });
      const tpPer = impliedPerCase(r);
      notes.push(
        `${brand.name} ${brand.size_ml} ml: saved as ${t} bottles` +
          (tpPer ? ` (the TP has ${tpPer} per case, your brand setting has ${brand.bottles_per_case})` : "")
      );
    }
    total += t;
  }
  return { items, notes, total };
}
