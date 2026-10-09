import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type ExciseSettings, getExciseSettings, listExciseBrands } from "@/lib/exciseService";
import { type StockRow, getStockSummary } from "@/lib/exciseSalesService";
import type { ExciseBrand } from "@/lib/exciseService";

// The table was created by a later migration, so it is not in the generated types. Cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const PAGE = 1000;
const WINDOWS = [7, 14, 30, 60];
const PHONE_KEY = "taptrack_distributor_phone";
const NAME_KEY = "taptrack_distributor_name";
const MAX_URL = 1900;

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// Local date (not UTC).
const localToday = () => {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

const shiftDays = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

// Turns what the owner typed into a WhatsApp number (country code 91, digits only). Empty if not valid.
function waNumber(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return "";
}

interface SaleLine {
  brand_id: string;
  bottles: number;
}

async function fetchSales(from: string): Promise<SaleLine[]> {
  const all: SaleLine[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("excise_daily_sales")
      .select("brand_id, bottles")
      .gte("sale_date", from)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows.map((r: any) => ({ brand_id: r.brand_id, bottles: Number(r.bottles) || 0 })));
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function firstSaleDate(): Promise<string | null> {
  const { data, error } = await db
    .from("excise_daily_sales")
    .select("sale_date")
    .order("sale_date", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0].sale_date : null;
}

interface Loaded {
  stock: StockRow[];
  brands: ExciseBrand[];
  soldInWindow: Map<string, number>;
  effectiveDays: number;
  today: string;
}

const unitText = (q: number, perCase: number) =>
  perCase > 1
    ? `${q} case${q > 1 ? "s" : ""} (${q * perCase} bottles)`
    : `${q} bottle${q > 1 ? "s" : ""}`;

export default function ExciseOrderView() {
  const [windowDays, setWindowDays] = useState(30);
  const [coverStr, setCoverStr] = useState("15");
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState("");
  const [distName, setDistName] = useState("");
  const [extra, setExtra] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setSettings(await getExciseSettings());
      } catch {
        // the hotel name in the message is optional
      }
    })();
    try {
      const p = localStorage.getItem(PHONE_KEY);
      if (p) setPhone(p.slice(0, 16));
      const n = localStorage.getItem(NAME_KEY);
      if (n) setDistName(n.slice(0, 40));
    } catch {
      // storage can be blocked; the fields start empty
    }
  }, []);

  useEffect(() => {
    const id = ++reqRef.current;
    setLoading(true);
    setMsg("");
    (async () => {
      try {
        const today = localToday();
        const from = shiftDays(today, -(windowDays - 1));
        const [stock, brands, sales, first] = await Promise.all([
          getStockSummary(),
          listExciseBrands(),
          fetchSales(from),
          firstSaleDate(),
        ]);
        if (id !== reqRef.current) return;
        const sold = new Map<string, number>();
        for (const s of sales) sold.set(s.brand_id, (sold.get(s.brand_id) ?? 0) + s.bottles);
        const history = first ? Math.max(1, daysBetween(first, today) + 1) : windowDays;
        setData({
          stock,
          brands,
          soldInWindow: sold,
          effectiveDays: Math.min(windowDays, history),
          today,
        });
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    })();
  }, [windowDays]);

  const cover = Number(coverStr);
  const coverOk = Number.isInteger(cover) && cover >= 1 && cover <= 365;

  const rows = useMemo(() => {
    if (!data || !coverOk) return [];
    const perCaseOf = new Map(data.brands.map((b) => [b.id, Math.max(1, Number(b.bottles_per_case) || 1)]));
    const list = data.stock
      .filter((r) => r.received !== 0 || r.sold !== 0)
      .map((r) => {
        const left = r.received - r.sold;
        const soldW = data.soldInWindow.get(r.brand_id) ?? 0;
        const perCase = perCaseOf.get(r.brand_id) ?? 1;
        // Whole-number maths, so there is no rounding slip of one bottle.
        const need =
          soldW > 0
            ? Math.max(0, Math.ceil((soldW * cover - left * data.effectiveDays) / data.effectiveDays))
            : 0;
        const suggested = need > 0 ? Math.ceil(need / perCase) : 0;
        const daysLeft = left <= 0 ? 0 : soldW > 0 ? (left * data.effectiveDays) / soldW : null;
        return { ...r, left, perCase, suggested, daysLeft };
      });
    list.sort((a, b) => {
      const dA = a.daysLeft === null ? Infinity : a.daysLeft;
      const dB = b.daysLeft === null ? Infinity : b.daysLeft;
      return dA - dB || a.name.localeCompare(b.name) || a.size_ml - b.size_ml;
    });
    return list;
  }, [data, cover, coverOk]);

  const listed = showAll ? rows : rows.filter((r) => r.suggested > 0);

  const qtyOf = (r: { brand_id: string; suggested: number }) => {
    const v = qty[r.brand_id];
    return v === undefined ? r.suggested : Number(v || 0);
  };

  const items = rows.filter((r) => qtyOf(r) > 0);

  const message = useMemo(() => {
    const hotel = settings?.hotel_name?.trim();
    const date = data?.today ?? "";
    const lines = rows
      .filter((r) => {
        const v = qty[r.brand_id];
        return (v === undefined ? r.suggested : Number(v || 0)) > 0;
      })
      .map((r, i) => {
        const v = qty[r.brand_id];
        const q = v === undefined ? r.suggested : Number(v || 0);
        return `${i + 1}. ${r.name} ${r.size_ml} ml - ${unitText(q, r.perCase)}`;
      });
    const greet = `Namaste${distName.trim() ? ` ${distName.trim()} ji` : ""},`;
    const head = hotel ? `${hotel} ka order (${date})` : `Order (${date})`;
    const extraLine = extra.trim() ? `\n${extra.trim()}` : "";
    return `${greet}\n${head}:\n\n${lines.join("\n")}\n${extraLine}\nKripya confirm karein aur delivery ka time batayein. Dhanyavaad.`;
  }, [rows, qty, settings, data, distName, extra]);

  const num = waNumber(phone);
  const phoneInvalid = phone.trim() !== "" && num === "";
  const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  const tooLong = url.length > MAX_URL;

  function onWindowChange(v: number) {
    setWindowDays(v);
    setQty({});
  }

  function onCoverChange(v: string) {
    setCoverStr(v.replace(/\D/g, "").slice(0, 3));
    setQty({});
  }

  function setQtyFor(brandId: string, value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 4);
    setQty((prev) => ({ ...prev, [brandId]: clean }));
  }

  function onPhone(value: string) {
    const clean = value.replace(/[^\d+\s-]/g, "").slice(0, 16);
    setPhone(clean);
    try {
      localStorage.setItem(PHONE_KEY, clean);
    } catch {
      // ignore
    }
  }

  function onName(value: string) {
    const clean = value.slice(0, 40);
    setDistName(clean);
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      // ignore
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setMsg("Message copied. Paste it in WhatsApp.");
    } catch {
      setMsg("Copy is not allowed here. Press and hold the message box, select all, and copy by hand.");
    }
  }

  const totalCases = items.filter((r) => r.perCase > 1).reduce((s, r) => s + qtyOf(r), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Order on WhatsApp</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Brands that will run short are listed with a suggested order. Change any quantity, then send the order
        to your distributor on WhatsApp. The app only opens WhatsApp with the message ready; you press send there.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Look at sales of the last</span>
          <select className={input} value={windowDays} onChange={(e) => onWindowChange(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w} days
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">I want stock for (days)</span>
          <input
            className={`${input} w-28`}
            inputMode="numeric"
            value={coverStr}
            onChange={(e) => onCoverChange(e.target.value)}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show all brands (so you can add a brand that is not running short)
      </label>

      <section className="space-y-2">
        <h2 className="font-medium">Order quantities</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !coverOk ? (
          <p className="text-sm text-muted-foreground">Enter the days of stock you want (1 to 365).</p>
        ) : listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No brand needs ordering right now. Tick "Show all brands" to add one by hand.
          </p>
        ) : (
          <div className="space-y-2">
            {listed.map((r) => (
              <div
                key={r.brand_id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.name} {r.size_ml} ml
                  </p>
                  <p className="text-muted-foreground">
                    In stock: {r.left}
                    {r.left < 0 ? " (check)" : ""}
                    {r.left <= 0 ? " | Out of stock" : ""}
                    {r.perCase > 1 ? ` | ${r.perCase} per case` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className={`${input} w-20 text-right`}
                    inputMode="numeric"
                    value={qty[r.brand_id] ?? String(r.suggested)}
                    onChange={(e) => setQtyFor(r.brand_id, e.target.value)}
                  />
                  <span className="text-muted-foreground">{r.perCase > 1 ? "case" : "btl"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Set a quantity to 0 or empty to leave that brand out of the message.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Distributor</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Name (optional)</span>
            <input className={`${input} w-full`} value={distName} onChange={(e) => onName(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">WhatsApp number (optional)</span>
            <input
              className={`${input} w-full`}
              inputMode="tel"
              value={phone}
              onChange={(e) => onPhone(e.target.value)}
              placeholder="10 digit number"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-sm text-muted-foreground">Extra line for the message (optional)</span>
            <input
              className={`${input} w-full`}
              value={extra}
              maxLength={120}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="For example: delivery needed by tomorrow evening"
            />
          </label>
        </div>
        {phoneInvalid && (
          <p className="text-sm rounded-md border p-2">
            This number does not look right. WhatsApp will open without a contact and you can pick one.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          The name and number are saved on this phone only, so you do not type them again.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Message</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a quantity above to see the message.</p>
        ) : (
          <>
            <textarea className={`${input} w-full h-56 font-mono`} readOnly value={message} />
            <p className="text-sm">
              {items.length} brand(s){totalCases > 0 ? `, ${totalCases} case(s)` : ""} in this order.
            </p>
            {tooLong && (
              <p className="text-sm rounded-md border p-2">
                This message is too long for a WhatsApp link. Use "Copy message" and paste it in WhatsApp, or remove a
                few brands.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {tooLong ? (
                <button className={btn} disabled>
                  Send on WhatsApp
                </button>
              ) : (
                <a className={btn} href={url} target="_blank" rel="noopener noreferrer">
                  Send on WhatsApp
                </a>
              )}
              <button className={btn} onClick={onCopy}>
                Copy message
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
