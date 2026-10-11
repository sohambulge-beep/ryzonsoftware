import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type ExciseBrand,
  type ExciseSettings,
  getExciseSettings,
  listExciseBrands,
} from "@/lib/exciseService";
import { type StockRow, getStockSummary } from "@/lib/exciseSalesService";

// The table was created by a later migration, so it is not in the generated types. Cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const SLIPS_KEY = "taptrack_recent_slips";
const MAX_SLIPS = 30;
const MAX_URL = 1900;
const MODES = ["Cash", "UPI", "Card", "Tab"];

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
  qty: number;
  price: string;
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
        typeof l.qty === "number" &&
        typeof l.unitP === "number" &&
        typeof l.amountP === "number"
    )
  );
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
    out.push(`${i + 1}. ${l.name} ${l.size_ml} ml x ${l.qty} @ ${inr(l.unitP)} = ${inr(l.amountP)}`);
  });
  out.push("");
  out.push(`Total: Rs ${inr(slip.totalP)}`);
  out.push(`Paid by: ${slip.mode}`);
  return out.join("\n");
}

export default function ExciseCounterView() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("Cash");
  const [customer, setCustomer] = useState("");
  const [slip, setSlip] = useState<Slip | null>(null);
  const [recent, setRecent] = useState<Slip[]>([]);
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

  const rateText = useMemo(
    () => new Map(brands.map((b) => [b.id, String(Number(b.rate) || 0)])),
    [brands]
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock.filter((r) => {
      const inUse = showAll || r.received !== 0 || r.sold !== 0 || cart[r.brand_id] !== undefined;
      return inUse && (q === "" || r.name.toLowerCase().includes(q));
    });
  }, [stock, query, showAll, cart]);

  const cartLines = useMemo(() => {
    const info = new Map(stock.map((r) => [r.brand_id, r]));
    return Object.entries(cart).map(([id, c]) => {
      const r = info.get(id);
      return {
        id,
        name: r?.name ?? "Unknown brand",
        size_ml: r?.size_ml ?? 0,
        qty: c.qty,
        price: c.price,
        unitP: priceToPaise(c.price),
        left: r ? r.received - r.sold : 0,
      };
    });
  }, [cart, stock]);

  const totalP = cartLines.reduce((s, l) => (l.unitP !== null && l.qty > 0 ? s + l.qty * l.unitP : s), 0);
  const totalBottles = cartLines.reduce((s, l) => s + (l.qty > 0 ? l.qty : 0), 0);

  function addOne(id: string) {
    setCart((prev) => {
      const cur = prev[id];
      return { ...prev, [id]: { qty: (cur?.qty ?? 0) + 1, price: cur?.price ?? rateText.get(id) ?? "0" } };
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const q = cur.qty + delta;
      if (q <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { ...cur, qty: q } };
    });
  }

  function typeQty(id: string, value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 4);
    setCart((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], qty: Number(clean || 0) } } : prev));
  }

  function typePrice(id: string, value: string) {
    const clean = value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 9);
    setCart((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], price: clean } } : prev));
  }

  function removeLine(id: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function onComplete() {
    const lines = cartLines.filter((l) => l.qty > 0);
    if (lines.length === 0) {
      setMsg("Add at least one bottle");
      return;
    }
    if (!date) {
      setMsg("Pick the date");
      return;
    }
    const bad = lines.find((l) => l.unitP === null);
    if (bad) {
      setMsg(`Enter a valid price for ${bad.name} ${bad.size_ml} ml`);
      return;
    }
    const over = lines.filter((l) => l.qty > l.left).length;
    if (over > 0 && !confirm(`${over} brand(s) have more bottles than stock. Complete the sale anyway?`)) return;

    setBusy(true);
    try {
      const { error } = await db
        .from("excise_daily_sales")
        .insert(lines.map((l) => ({ brand_id: l.id, sale_date: date, bottles: l.qty })));
      if (error) throw new Error(error.message);

      const now = new Date();
      const slipLines: SlipLine[] = lines.map((l) => ({
        name: l.name,
        size_ml: l.size_ml,
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
      setMsg(`Sale saved: ${lines.length} brand(s), ${lines.reduce((s, l) => s + l.qty, 0)} bottles`);
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Liquor counter</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <p className="text-sm text-muted-foreground no-print">
        Pick the bottles sold and complete the sale. Each sale is saved as a daily sale entry, so stock, registers
        and reports update. Do not enter the same bottles again in Daily sales or Bulk sales. The slip is not a GST
        invoice and is kept on this phone only (last {MAX_SLIPS}). Reports value sales at the brand rate, not at the
        price typed here.
      </p>

      <section className="space-y-3 no-print">
        <h2 className="font-medium">Add bottles</h2>
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
              return (
                <div
                  key={r.brand_id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.name} {r.size_ml} ml
                    </p>
                    <p className="text-muted-foreground">
                      In stock: {left}
                      {left < 0 ? " (check)" : ""} | Rate {rateText.get(r.brand_id) ?? "0"}
                    </p>
                  </div>
                  <button className={btn} onClick={() => addOne(r.brand_id)}>
                    + Add
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 no-print">
        <h2 className="font-medium">Current sale</h2>
        {cartLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bottles added yet.</p>
        ) : (
          <div className="space-y-2">
            {cartLines.map((l) => (
              <div key={l.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">
                    {l.name} {l.size_ml} ml
                  </span>
                  <button className="text-destructive" onClick={() => removeLine(l.id)}>
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    <button className={btn} onClick={() => changeQty(l.id, -1)}>
                      -
                    </button>
                    <input
                      className={`${input} w-16 text-center`}
                      inputMode="numeric"
                      value={String(l.qty)}
                      onChange={(e) => typeQty(l.id, e.target.value)}
                    />
                    <button className={btn} onClick={() => changeQty(l.id, 1)}>
                      +
                    </button>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="text-muted-foreground">Price</span>
                    <input
                      className={`${input} w-24 text-right`}
                      inputMode="decimal"
                      value={l.price}
                      onChange={(e) => typePrice(l.id, e.target.value)}
                    />
                  </label>
                  <span className="ml-auto">
                    {l.unitP !== null && l.qty > 0 ? inr(l.qty * l.unitP) : "-"}
                  </span>
                </div>
                {l.qty > l.left && <p className="text-destructive">More than stock ({l.left})</p>}
                {l.unitP === null && <p className="text-destructive">Enter a valid price</p>}
              </div>
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
          {totalBottles} bottle(s) | Total {inr(totalP)}
        </p>
        <button className={btn} disabled={busy || totalBottles === 0} onClick={onComplete}>
          {busy ? "Saving..." : "Complete sale"}
        </button>
      </section>

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
                    <td className="py-1 pr-2">
                      {l.name} {l.size_ml} ml
                    </td>
                    <td className="pr-2 text-right">{l.qty}</td>
                    <td className="pr-2 text-right">{inr(l.unitP)}</td>
                    <td className="text-right">{inr(l.amountP)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="font-medium">Total: {inr(slip.totalP)}</p>
            <p>Paid by: {slip.mode}</p>
            <p className="text-xs text-muted-foreground">Counter slip, not a GST tax invoice.</p>
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
