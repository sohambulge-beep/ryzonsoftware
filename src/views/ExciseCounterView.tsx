import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type ExciseBrand,
  type ExciseSettings,
  getExciseSettings,
  listExciseBrands,
} from "@/lib/exciseService";
import { type StockRow, getStockSummary } from "@/lib/exciseSalesService";
import { useOwnerAccess } from "@/lib/ownerAccess";

// The table was created by a later migration, so it is not in the generated types. Cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const btnSm = "rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-50";

const SLIPS_KEY = "taptrack_recent_slips";
const CFG_KEY = "taptrack_peg_cfg";
const OPEN_KEY = "taptrack_open_ml";
const MAX_SLIPS = 30;
const MAX_URL = 1900;
const MODES = ["Cash", "UPI", "Card", "Tab"];
const DEFAULT_SIZES = [30, 60];

const printCss = `
@media print {
  body * { visibility: hidden; }
  #counter-slip, #counter-slip * { visibility: visible; color: #000 !important; background: #fff !important; }
  #counter-slip { position: absolute; left: 0; top: 0; width: 100%; max-width: 380px; padding: 12px; }
  .no-print { display: none !important; }
}
`;

const pad = (n: number) => String(n).padStart(2, "0");

// Local date (not UTC).
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Money is handled in paise (whole numbers).
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const priceToPaise = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

interface SlipLine {
  name: string;
  size_ml: number;
  peg?: number; // ml of the peg; missing or 0 for a whole bottle
  qty: number;
  unitP: number;
  amountP: number;
}
interface Slip {
  no: string;
  when: string;
  mode: string;
  customer: string;
  lines: SlipLine[];
  totalP: number;
}
interface CartLine {
  brandId: string;
  kind: "peg" | "bottle";
  ml: number;
  qty: number;
  price: string;
}
// brand id -> price key ("b" = whole bottle, "30" = a 30 ml peg) -> price text
type PriceMap = Record<string, Record<string, string>>;
interface PegCfg {
  sizes: number[];
  prices: PriceMap;
}
// brand id -> ml left in the open bottle
type OpenMap = Record<string, number>;

interface LineView {
  key: string;
  brandId: string;
  name: string;
  size_ml: number;
  kind: "peg" | "bottle";
  ml: number;
  qty: number;
  price: string;
  unitP: number | null;
}
interface BrandPlan {
  brandId: string;
  name: string;
  size_ml: number;
  whole: number;
  pegMl: number;
  openBefore: number;
  toOpen: number;
  openAfter: number;
  record: number;
  left: number;
}

function isSlip(x: any): x is Slip {
  return !!(
    x &&
    typeof x.no === "string" &&
    typeof x.when === "string" &&
    typeof x.mode === "string" &&
    typeof x.customer === "string" &&
    typeof x.totalP === "number" &&
    Array.isArray(x.lines) &&
    x.lines.every(
      (l: any) =>
        l &&
        typeof l.name === "string" &&
        typeof l.size_ml === "number" &&
        (l.peg === undefined || typeof l.peg === "number") &&
        typeof l.qty === "number" &&
        typeof l.unitP === "number" &&
        typeof l.amountP === "number"
    )
  );
}

function lineLabel(l: SlipLine): string {
  return l.peg && l.peg > 0 ? `${l.name} ${l.size_ml} ml (${l.peg} ml peg)` : `${l.name} ${l.size_ml} ml`;
}

// Slip numbers count up per day on this device only.
function nextSlipNo(date: string): string {
  const compact = date.replace(/-/g, "");
  try {
    const key = `taptrack_slip_seq_${compact}`;
    const n = (parseInt(localStorage.getItem(key) ?? "0", 10) || 0) + 1;
    localStorage.setItem(key, String(n));
    return `${compact}-${String(n).padStart(3, "0")}`;
  } catch {
    const d = new Date();
    return `${compact}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
}

function slipText(slip: Slip, hotel: string): string {
  const out: string[] = [];
  out.push(`*${hotel || "Counter slip"}*`);
  out.push(`Slip ${slip.no} | ${slip.when}`);
  if (slip.customer) out.push(`Customer: ${slip.customer}`);
  out.push("");
  slip.lines.forEach((l, i) => {
    out.push(`${i + 1}. ${lineLabel(l)} x ${l.qty} @ ${inr(l.unitP)} = ${inr(l.amountP)}`);
  });
  out.push("");
  out.push(`Total: Rs ${inr(slip.totalP)}`);
  out.push(`Paid by: ${slip.mode}`);
  return out.join("\n");
}

function readCfg(): PegCfg {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    const p: any = raw ? JSON.parse(raw) : null;
    const sizes: number[] = Array.isArray(p?.sizes)
      ? p.sizes.filter((n: any) => Number.isInteger(n) && n >= 5 && n <= 500).slice(0, 4)
      : [];
    const prices: PriceMap = {};
    if (p && p.prices && typeof p.prices === "object" && !Array.isArray(p.prices)) {
      for (const [bid, row] of Object.entries<any>(p.prices)) {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          const clean: Record<string, string> = {};
          for (const [k, v] of Object.entries<any>(row)) if (typeof v === "string") clean[k] = v;
          prices[bid] = clean;
        }
      }
    }
    return { sizes: sizes.length > 0 ? sizes : DEFAULT_SIZES, prices };
  } catch {
    return { sizes: DEFAULT_SIZES, prices: {} };
  }
}

function writeCfg(cfg: PegCfg): boolean {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

function readOpen(): OpenMap {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    const p: any = raw ? JSON.parse(raw) : null;
    const out: OpenMap = {};
    if (p && typeof p === "object" && !Array.isArray(p)) {
      for (const [k, v] of Object.entries<any>(p)) {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeOpen(m: OpenMap): boolean {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(m));
    return true;
  } catch {
    return false;
  }
}

// "30, 60" -> [30, 60]. Null if it is not 1 to 4 whole sizes between 5 and 500 ml.
function parseSizes(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 5 || n > 500) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

// Works out, per brand, how many ml of pegs are sold, whether a new bottle must be opened,
// and what is left in the open bottle afterwards. All whole numbers.
function makePlans(lines: LineView[], info: Map<string, StockRow>, open: OpenMap): BrandPlan[] {
  const byBrand = new Map<string, LineView[]>();
  for (const l of lines) {
    if (l.qty <= 0) continue;
    const arr = byBrand.get(l.brandId) ?? [];
    arr.push(l);
    byBrand.set(l.brandId, arr);
  }
  const plans: BrandPlan[] = [];
  byBrand.forEach((ls, brandId) => {
    const r = info.get(brandId);
    const size = r?.size_ml ?? 0;
    let whole = 0;
    let pegMl = 0;
    for (const l of ls) {
      if (l.kind === "bottle") whole += l.qty;
      else pegMl += l.qty * l.ml;
    }
    const openBefore = open[brandId] ?? 0;
    let toOpen = 0;
    if (pegMl > 0 && size > 0 && pegMl > openBefore) toOpen = Math.ceil((pegMl - openBefore) / size);
    const openAfter = pegMl > 0 ? openBefore + toOpen * size - pegMl : openBefore;
    plans.push({
      brandId,
      name: r?.name ?? "Unknown brand",
      size_ml: size,
      whole,
      pegMl,
      openBefore,
      toOpen,
      openAfter,
      record: whole + toOpen,
      left: r ? r.received - r.sold : 0,
    });
  });
  return plans;
}

export default function ExciseCounterView() {
  const { isOwner } = useOwnerAccess();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [cfg, setCfg] = useState<PegCfg>({ sizes: DEFAULT_SIZES, prices: {} });
  const [openMap, setOpenMap] = useState<OpenMap>({});
  const [sizesText, setSizesText] = useState("30, 60");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("Cash");
  const [customer, setCustomer] = useState("");
  const [slip, setSlip] = useState<Slip | null>(null);
  const [recent, setRecent] = useState<Slip[]>([]);
  const [editId, setEditId] = useState("");
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [editOpen, setEditOpen] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([getStockSummary(), listExciseBrands()]);
      setStock(s);
      setBrands(b);
    } catch (e: any) {
      setMsg(`Could not load: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Saved settings are read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setDate(localDate());
    load();
    (async () => {
      try {
        setSettings(await getExciseSettings());
      } catch {
        // the hotel name on the slip is optional
      }
    })();
    const c = readCfg();
    setCfg(c);
    setSizesText(c.sizes.join(", "));
    setOpenMap(readOpen());
    try {
      const raw = localStorage.getItem(SLIPS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecent(parsed.filter(isSlip).slice(0, MAX_SLIPS));
      }
    } catch {
      // storage can be blocked or unreadable; start with no saved slips
    }
  }, [load]);

  const rateOf = useMemo(() => new Map(brands.map((b) => [b.id, Number(b.rate) || 0])), [brands]);
  const info = useMemo(() => new Map(stock.map((r) => [r.brand_id, r])), [stock]);

  // The price shown for a peg or a bottle: the saved one, otherwise in proportion to the brand rate.
  const priceFor = useCallback(
    (r: StockRow, kind: "peg" | "bottle", ml: number): string => {
      const key = kind === "bottle" ? "b" : String(ml);
      const saved = cfg.prices[r.brand_id]?.[key];
      if (saved !== undefined && saved !== "") return saved;
      const rate = rateOf.get(r.brand_id) ?? 0;
      if (kind === "bottle") return String(rate);
      if (r.size_ml <= 0 || rate <= 0) return "0";
      return String(Math.round((rate * ml) / r.size_ml));
    },
    [cfg, rateOf]
  );

  const inCart = useMemo(() => new Set(Object.values(cart).map((c) => c.brandId)), [cart]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock.filter((r) => {
      const inUse =
        showAll ||
        r.received !== 0 ||
        r.sold !== 0 ||
        inCart.has(r.brand_id) ||
        (openMap[r.brand_id] ?? 0) > 0;
      return inUse && (q === "" || r.name.toLowerCase().includes(q));
    });
  }, [stock, query, showAll, inCart, openMap]);

  const lineViews: LineView[] = useMemo(
    () =>
      Object.entries(cart).map(([key, c]) => {
        const r = info.get(c.brandId);
        return {
          key,
          brandId: c.brandId,
          name: r?.name ?? "Unknown brand",
          size_ml: r?.size_ml ?? 0,
          kind: c.kind,
          ml: c.ml,
          qty: c.qty,
          price: c.price,
          unitP: priceToPaise(c.price),
        };
      }),
    [cart, info]
  );

  const plans = useMemo(() => makePlans(lineViews, info, openMap), [lineViews, info, openMap]);

  const totalP = lineViews.reduce((s, l) => (l.unitP !== null && l.qty > 0 ? s + l.qty * l.unitP : s), 0);
  const totalUnits = lineViews.reduce((s, l) => s + (l.qty > 0 ? l.qty : 0), 0);
  const recordTotal = plans.reduce((s, p) => s + p.record, 0);

  function addLine(r: StockRow, kind: "peg" | "bottle", ml: number) {
    const key = `${r.brand_id}|${kind === "bottle" ? "b" : ml}`;
    setCart((prev) => {
      const cur = prev[key];
      return {
        ...prev,
        [key]: {
          brandId: r.brand_id,
          kind,
          ml: kind === "bottle" ? 0 : ml,
          qty: (cur?.qty ?? 0) + 1,
          price: cur?.price ?? priceFor(r, kind, ml),
        },
      };
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      const q = cur.qty + delta;
      if (q <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...cur, qty: q } };
    });
  }

  function typeQty(key: string, value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 4);
    setCart((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], qty: Number(clean || 0) } } : prev));
  }

  function typePrice(key: string, value: string) {
    if (!isOwner) return;
    const clean = value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 9);
    setCart((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], price: clean } } : prev));
  }

  function removeLine(key: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function onSaveSizes() {
    if (!isOwner) return;
    const sizes = parseSizes(sizesText);
    if (!sizes) {
      setMsg("Enter 1 to 4 peg sizes in ml, like 30, 60 (each between 5 and 500).");
      return;
    }
    const next: PegCfg = { ...cfg, sizes };
    if (!writeCfg(next)) {
      setMsg("Could not save on this phone (storage is blocked).");
      return;
    }
    setCfg(next);
    setSizesText(sizes.join(", "));
    setMsg("Peg sizes saved.");
  }

  function openEditor(r: StockRow) {
    if (editId === r.brand_id) {
      setEditId("");
      return;
    }
    const vals: Record<string, string> = {};
    for (const ml of cfg.sizes) vals[String(ml)] = priceFor(r, "peg", ml);
    vals["b"] = priceFor(r, "bottle", 0);
    setEditVals(vals);
    setEditOpen(String(openMap[r.brand_id] ?? 0));
    setEditId(r.brand_id);
  }

  function typeEdit(k: string, value: string) {
    const clean = value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 9);
    setEditVals((prev) => ({ ...prev, [k]: clean }));
  }

  function savePrices(r: StockRow) {
    if (!isOwner) return;
    const clean: Record<string, string> = {};
    for (const ml of cfg.sizes) {
      const k = String(ml);
      const v = editVals[k] ?? "";
      if (priceToPaise(v) === null) {
        setMsg(`Enter a valid price for the ${ml} ml peg.`);
        return;
      }
      clean[k] = v;
    }
    const bv = editVals["b"] ?? "";
    if (priceToPaise(bv) === null) {
      setMsg("Enter a valid bottle price.");
      return;
    }
    clean["b"] = bv;
    const openMl = Number(editOpen || 0);
    const maxOpen = r.size_ml > 0 ? r.size_ml - 1 : 0;
    if (!Number.isInteger(openMl) || openMl < 0 || openMl > maxOpen) {
      setMsg(`Open bottle ml must be a whole number from 0 to ${maxOpen}.`);
      return;
    }
    const nextCfg: PegCfg = { ...cfg, prices: { ...cfg.prices, [r.brand_id]: clean } };
    const nextOpen: OpenMap = { ...openMap };
    if (openMl > 0) nextOpen[r.brand_id] = openMl;
    else delete nextOpen[r.brand_id];
    if (!writeCfg(nextCfg) || !writeOpen(nextOpen)) {
      setMsg("Could not save on this phone (storage is blocked).");
      return;
    }
    setCfg(nextCfg);
    setOpenMap(nextOpen);
    // Lines already in the sale keep their old price; remove and add them again to use the new one.
    setEditId("");
    setMsg(`Prices and open bottle saved for ${r.name} ${r.size_ml} ml.`);
  }

  function onDiscard(r: StockRow) {
    if (!isOwner) return;
    const ml = openMap[r.brand_id] ?? 0;
    if (!confirm(`Discard the open ${r.name} bottle (${ml} ml left)? Use this when it is finished or wasted.`)) return;
    const next: OpenMap = { ...openMap };
    delete next[r.brand_id];
    setOpenMap(next);
    if (!writeOpen(next)) setMsg("Could not save on this phone (storage is blocked).");
  }

  async function onComplete() {
    const lines = lineViews.filter((l) => l.qty > 0);
    if (lines.length === 0) {
      setMsg("Add at least one item");
      return;
    }
    if (!date) {
      setMsg("Pick the date");
      return;
    }
    const badPrice = lines.find((l) => l.unitP === null || l.unitP <= 0);
    if (badPrice) {
      setMsg(`Price is not set for ${badPrice.name}. Ask the owner to set it under Prices.`);
      return;
    }
    const badPeg = lines.find((l) => l.kind === "peg" && (l.size_ml <= 0 || l.ml > l.size_ml));
    if (badPeg) {
      setMsg(`${badPeg.name}: a ${badPeg.ml} ml peg does not fit this bottle size.`);
      return;
    }
    const over = plans.filter((p) => p.record > p.left).length;
    if (over > 0 && !confirm(`${over} brand(s) need more bottles than stock. Complete the sale anyway?`)) return;

    setBusy(true);
    try {
      // First the bottles that were sold whole or opened are saved as daily sales.
      const rows = plans
        .filter((p) => p.record > 0)
        .map((p) => ({ brand_id: p.brandId, sale_date: date, bottles: p.record }));
      if (rows.length > 0) {
        const { error } = await db.from("excise_daily_sales").insert(rows);
        if (error) throw new Error(error.message);
      }

      // Only after that the ml left in the open bottles is updated.
      const nextOpen: OpenMap = { ...openMap };
      for (const p of plans) {
        if (p.pegMl > 0) {
          if (p.openAfter > 0) nextOpen[p.brandId] = p.openAfter;
          else delete nextOpen[p.brandId];
        }
      }
      setOpenMap(nextOpen);
      const ledgerSaved = writeOpen(nextOpen);

      const now = new Date();
      const slipLines: SlipLine[] = lines.map((l) => ({
        name: l.name,
        size_ml: l.size_ml,
        peg: l.kind === "peg" ? l.ml : 0,
        qty: l.qty,
        unitP: l.unitP as number,
        amountP: l.qty * (l.unitP as number),
      }));
      const newSlip: Slip = {
        no: nextSlipNo(date),
        when: `${date} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
        mode,
        customer: customer.trim(),
        lines: slipLines,
        totalP: slipLines.reduce((s, l) => s + l.amountP, 0),
      };
      setSlip(newSlip);
      setRecent((prev) => {
        const next = [newSlip, ...prev].slice(0, MAX_SLIPS);
        try {
          localStorage.setItem(SLIPS_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setCart({});
      setCustomer("");
      const recorded = plans.reduce((s, p) => s + p.record, 0);
      setMsg(
        `Sale saved: ${lines.reduce((s, l) => s + l.qty, 0)} item(s), ${recorded} bottle(s) recorded in Daily sales.` +
          (ledgerSaved ? "" : " Warning: the open bottle ml could not be saved on this phone. Set it again under Prices.")
      );
      await load();
    } catch (e: any) {
      setMsg(`Could not save: ${e.message ?? e}. Nothing was saved.`);
    }
    setBusy(false);
  }

  async function onCopy() {
    if (!slip) return;
    try {
      await navigator.clipboard.writeText(slipText(slip, settings?.hotel_name?.trim() ?? ""));
      setMsg("Slip copied. Paste it in WhatsApp.");
    } catch {
      setMsg("Copy is not allowed here. Use Print instead.");
    }
  }

  const hotel = settings?.hotel_name?.trim() ?? "";
  const waUrl = slip ? `https://wa.me/?text=${encodeURIComponent(slipText(slip, hotel))}` : "";
  const tooLong = waUrl.length > MAX_URL;
  const openRows = stock.filter((r) => (openMap[r.brand_id] ?? 0) > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Liquor counter</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <p className="text-sm text-muted-foreground no-print">
        Sell by the peg or by the whole bottle. A new bottle is counted as 1 bottle in Daily sales when a peg needs
        more than what is left in the open bottle, so stock, registers and reports keep working in bottles. Do not
        enter the same bottles again in Daily sales or Bulk sales. The slip is a counter slip, not a tax invoice, and
        is kept on this phone only (last {MAX_SLIPS}). Peg prices and open bottle ml are also kept on this phone, so
        use one phone for the counter. Ask your CA how pegs must be written in your state's excise register.
      </p>

      {isOwner && (
        <section className="space-y-2 rounded-md border p-3 no-print">
          <h2 className="font-medium">Peg sizes (owner)</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Sizes in ml, like 30, 60</span>
              <input className={input} value={sizesText} onChange={(e) => setSizesText(e.target.value)} />
            </label>
            <button className={btn} onClick={onSaveSizes}>
              Save sizes
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3 no-print">
        <h2 className="font-medium">Add items</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 grow">
            <span className="text-sm text-muted-foreground">Search brand</span>
            <input
              className={`${input} w-full`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type part of a brand name"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Sale date</span>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Also show brands that have never been stocked or sold
        </label>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No brands to show. Add brands and TP receipts first.</p>
        ) : (
          <div className="space-y-2">
            {items.map((r) => {
              const left = r.received - r.sold;
              const openMl = openMap[r.brand_id] ?? 0;
              return (
                <div key={r.brand_id} className="rounded-md border p-3 text-sm space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {r.name} {r.size_ml} ml
                      </p>
                      <p className="text-muted-foreground">
                        In stock: {left}
                        {left < 0 ? " (check)" : ""} bottle(s) | Open bottle: {openMl} ml
                      </p>
                    </div>
                    {isOwner && (
                      <button className="underline text-xs" onClick={() => openEditor(r)}>
                        {editId === r.brand_id ? "Close" : "Prices"}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {cfg.sizes.map((ml) => (
                      <button
                        key={ml}
                        className={btnSm}
                        disabled={r.size_ml <= 0 || ml > r.size_ml}
                        onClick={() => addLine(r, "peg", ml)}
                      >
                        + {ml} ml (Rs {priceFor(r, "peg", ml)})
                      </button>
                    ))}
                    <button className={btnSm} onClick={() => addLine(r, "bottle", 0)}>
                      + Bottle (Rs {priceFor(r, "bottle", 0)})
                    </button>
                  </div>

                  {isOwner && editId === r.brand_id && (
                    <div className="space-y-3 border-t pt-3">
                      <p className="text-muted-foreground">
                        Prices for this brand. Leave the proposed value if it is fine. The bottle price is also used
                        when a whole bottle is sold.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {cfg.sizes.map((ml) => (
                          <label key={ml} className="block space-y-1">
                            <span className="text-muted-foreground">{ml} ml peg price</span>
                            <input
                              className={`${input} w-full`}
                              inputMode="decimal"
                              value={editVals[String(ml)] ?? ""}
                              onChange={(e) => typeEdit(String(ml), e.target.value)}
                            />
                          </label>
                        ))}
                        <label className="block space-y-1">
                          <span className="text-muted-foreground">Whole bottle price</span>
                          <input
                            className={`${input} w-full`}
                            inputMode="decimal"
                            value={editVals["b"] ?? ""}
                            onChange={(e) => typeEdit("b", e.target.value)}
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-muted-foreground">Open bottle: ml left now</span>
                          <input
                            className={`${input} w-full`}
                            inputMode="numeric"
                            value={editOpen}
                            onChange={(e) => setEditOpen(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          />
                        </label>
                      </div>
                      <button className={btn} onClick={() => savePrices(r)}>
                        Save
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 no-print">
        <h2 className="font-medium">Current sale</h2>
        {lineViews.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing added yet.</p>
        ) : (
          <div className="space-y-2">
            {lineViews.map((l) => (
              <div key={l.key} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">
                    {l.name} {l.size_ml} ml {l.kind === "peg" ? `(${l.ml} ml peg)` : "(bottle)"}
                  </span>
                  <button className="text-destructive" onClick={() => removeLine(l.key)}>
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    <button className={btn} onClick={() => changeQty(l.key, -1)}>
                      -
                    </button>
                    <input
                      className={`${input} w-16 text-center`}
                      inputMode="numeric"
                      value={String(l.qty)}
                      onChange={(e) => typeQty(l.key, e.target.value)}
                    />
                    <button className={btn} onClick={() => changeQty(l.key, 1)}>
                      +
                    </button>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="text-muted-foreground">Price</span>
                    {isOwner ? (
                      <input
                        className={`${input} w-24 text-right`}
                        inputMode="decimal"
                        value={l.price}
                        onChange={(e) => typePrice(l.key, e.target.value)}
                      />
                    ) : (
                      <span>{l.price}</span>
                    )}
                  </label>
                  <span className="ml-auto">{l.unitP !== null && l.qty > 0 ? inr(l.qty * l.unitP) : "-"}</span>
                </div>
                {(l.unitP === null || l.unitP <= 0) && (
                  <p className="text-destructive">Price is not set. Ask the owner to set it under Prices.</p>
                )}
              </div>
            ))}

            {plans
              .filter((p) => p.pegMl > 0)
              .map((p) => (
                <p key={p.brandId} className="text-xs text-muted-foreground">
                  {p.name} {p.size_ml} ml: {p.pegMl} ml of pegs.{" "}
                  {p.toOpen > 0 ? `Opens ${p.toOpen} new bottle(s). ` : "Uses the open bottle. "}
                  Open bottle after this sale: {p.openAfter} ml.
                  {p.record > p.left ? " More than stock." : ""}
                </p>
              ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Payment mode (shown on the slip)</span>
            <select className={`${input} w-full`} value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Customer name (optional)</span>
            <input
              className={`${input} w-full`}
              maxLength={40}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </label>
        </div>

        <p className="font-medium">
          {totalUnits} item(s) | Total {inr(totalP)} | {recordTotal} bottle(s) will be recorded in Daily sales
        </p>
        <button className={btn} disabled={busy || totalUnits === 0} onClick={onComplete}>
          {busy ? "Saving..." : "Complete sale"}
        </button>
      </section>

      {openRows.length > 0 && (
        <section className="space-y-2 no-print">
          <h2 className="font-medium">Open bottles ({openRows.length})</h2>
          {openRows.map((r) => (
            <div key={r.brand_id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span>
                {r.name} {r.size_ml} ml: {openMap[r.brand_id] ?? 0} ml left
              </span>
              {isOwner && (
                <button className="underline" onClick={() => onDiscard(r)}>
                  Discard
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {slip && (
        <section className="space-y-3">
          <div id="counter-slip" className="rounded-md border p-4 text-sm space-y-2">
            <p className="text-base font-semibold">{hotel || "Counter slip"}</p>
            {settings?.licence_no && <p>Licence no.: {settings.licence_no}</p>}
            <p>
              Slip {slip.no} | {slip.when}
            </p>
            {slip.customer && <p>Customer: {slip.customer}</p>}
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-2">Item</th>
                  <th className="pr-2 text-right">Qty</th>
                  <th className="pr-2 text-right">Price</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {slip.lines.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-1 pr-2">{lineLabel(l)}</td>
                    <td className="pr-2 text-right">{l.qty}</td>
                    <td className="pr-2 text-right">{inr(l.unitP)}</td>
                    <td className="text-right">{inr(l.amountP)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="font-medium">Total: {inr(slip.totalP)}</p>
            <p>Paid by: {slip.mode}</p>
            <p className="text-xs text-muted-foreground">Counter slip, not a tax invoice.</p>
          </div>
          {tooLong && (
            <p className="text-sm rounded-md border p-2 no-print">
              This slip is too long for a WhatsApp link. Use Copy slip and paste it in WhatsApp.
            </p>
          )}
          <div className="flex flex-wrap gap-3 no-print">
            <button className={btn} onClick={() => window.print()}>
              Print slip
            </button>
            {tooLong ? (
              <button className={btn} disabled>
                Send on WhatsApp
              </button>
            ) : (
              <a className={btn} href={waUrl} target="_blank" rel="noopener noreferrer">
                Send on WhatsApp
              </a>
            )}
            <button className={btn} onClick={onCopy}>
              Copy slip
            </button>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="space-y-2 no-print">
          <h2 className="font-medium">Recent slips on this phone ({recent.length})</h2>
          {recent.slice(0, 10).map((s) => (
            <div key={s.no + s.when} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>
                {s.no} | {s.when} | {inr(s.totalP)} | {s.mode}
              </span>
              <button className="underline" onClick={() => setSlip(s)}>
                Show
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
