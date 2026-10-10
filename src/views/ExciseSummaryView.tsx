import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listBankAccounts } from "@/lib/bankService";
import { type ExciseSettings, getExciseSettings } from "@/lib/exciseService";
import { getStockSummary } from "@/lib/exciseSalesService";

// Tables created by later migrations are not in the generated types yet, so cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const PAGE = 1000;
const PHONE_KEY = "taptrack_owner_phone";
const MAX_URL = 1900;
const TOP_N = 5;

// Local date (not UTC).
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Turns what was typed into a WhatsApp number (country code 91, digits only). Empty if not valid.
function waNumber(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return "";
}

async function fetchAll(makeQuery: () => any): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

interface Summary {
  date: string;
  salesBottles: number;
  salesValueP: number;
  top: { name: string; size_ml: number; bottles: number }[];
  receivedBottles: number;
  receiptCount: number;
  hasBank: boolean;
  moneyInP: number;
  moneyOutP: number;
  balanceP: number;
  minusCount: number;
}

export default function ExciseSummaryView() {
  const [date, setDate] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    setDate(localToday());
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
    } catch {
      // storage can be blocked; the field starts empty
    }
  }, []);

  useEffect(() => {
    if (!date) return;
    const id = ++reqRef.current;
    setLoading(true);
    setMsg("");
    (async () => {
      try {
        const [salesRows, receiptRows, entryRows, accounts, transferRows, stock] = await Promise.all([
          fetchAll(() =>
            db
              .from("excise_daily_sales")
              .select("id, brand_id, bottles, excise_brands(name, size_ml, rate)")
              .eq("sale_date", date)
              .order("id", { ascending: true })
          ),
          fetchAll(() =>
            db
              .from("excise_tp_receipts")
              .select("id, excise_tp_items(bottles_total)")
              .eq("receipt_date", date)
              .order("id", { ascending: true })
          ),
          fetchAll(() =>
            db
              .from("bank_entries")
              .select("id, account_id, entry_date, direction, amount")
              .lte("entry_date", date)
              .order("entry_date", { ascending: true })
              .order("id", { ascending: true })
          ),
          listBankAccounts(),
          fetchAll(() =>
            db
              .from("bank_transfers")
              .select("id, amount")
              .eq("transfer_date", date)
              .order("id", { ascending: true })
          ),
          getStockSummary(),
        ]);
        if (id !== reqRef.current) return;

        const byBrand = new Map<string, { name: string; size_ml: number; bottles: number; valueP: number }>();
        for (const r of salesRows) {
          const bottles = Number(r.bottles) || 0;
          const cur = byBrand.get(r.brand_id) ?? {
            name: r.excise_brands?.name ?? "Unknown brand",
            size_ml: Number(r.excise_brands?.size_ml) || 0,
            bottles: 0,
            valueP: 0,
          };
          cur.bottles += bottles;
          cur.valueP += bottles * paise(r.excise_brands?.rate);
          byBrand.set(r.brand_id, cur);
        }
        const sold = Array.from(byBrand.values()).sort(
          (a, b) => b.bottles - a.bottles || a.name.localeCompare(b.name) || a.size_ml - b.size_ml
        );

        const receivedBottles = receiptRows.reduce(
          (s: number, r: any) =>
            s + (r.excise_tp_items ?? []).reduce((t: number, i: any) => t + (Number(i.bottles_total) || 0), 0),
          0
        );

        const closing = new Map<string, number>(accounts.map((a) => [a.id, paise(a.opening_balance)]));
        let inAll = 0;
        let outAll = 0;
        for (const e of entryRows) {
          const cur = closing.get(e.account_id);
          if (cur === undefined) continue;
          const p = paise(e.amount);
          const isDay = e.entry_date === date;
          if (e.direction === "credit") {
            closing.set(e.account_id, cur + p);
            if (isDay) inAll += p;
          } else {
            closing.set(e.account_id, cur - p);
            if (isDay) outAll += p;
          }
        }
        // A transfer is one debit and one credit of the same amount, so leave it out of in and out.
        const transfersP = transferRows.reduce((s: number, t: any) => s + paise(t.amount), 0);

        setSummary({
          date,
          salesBottles: sold.reduce((s, r) => s + r.bottles, 0),
          salesValueP: sold.reduce((s, r) => s + r.valueP, 0),
          top: sold.slice(0, TOP_N).map((r) => ({ name: r.name, size_ml: r.size_ml, bottles: r.bottles })),
          receivedBottles,
          receiptCount: receiptRows.length,
          hasBank: accounts.length > 0,
          moneyInP: inAll - transfersP,
          moneyOutP: outAll - transfersP,
          balanceP: Array.from(closing.values()).reduce((s, v) => s + v, 0),
          minusCount: stock.filter((r) => r.received - r.sold < 0).length,
        });
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    })();
  }, [date]);

  const message = useMemo(() => {
    if (!summary) return "";
    const hotel = settings?.hotel_name?.trim();
    const lines: string[] = [];
    lines.push(`*${hotel ? `${hotel} - ` : ""}Daily summary (${summary.date})*`);
    lines.push("");
    lines.push(`Sales: ${summary.salesBottles} bottles | Rs ${inr(summary.salesValueP)} (at brand rate)`);
    if (summary.top.length > 0) {
      lines.push(`Top: ${summary.top.map((t) => `${t.name} ${t.size_ml} ml x ${t.bottles}`).join(", ")}`);
    }
    lines.push(`Stock received: ${summary.receivedBottles} bottles (${summary.receiptCount} TP)`);
    if (summary.hasBank) {
      lines.push(
        `Bank: in Rs ${inr(summary.moneyInP)} | out Rs ${inr(summary.moneyOutP)} | balance Rs ${inr(summary.balanceP)}`
      );
    }
    lines.push(`Minus stock brands: ${summary.minusCount}${summary.minusCount > 0 ? " (please check)" : ""}`);
    return lines.join("\n");
  }, [summary, settings]);

  const num = waNumber(phone);
  const phoneInvalid = phone.trim() !== "" && num === "";
  const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  const tooLong = url.length > MAX_URL;
  const empty =
    !!summary &&
    summary.salesBottles === 0 &&
    summary.receiptCount === 0 &&
    summary.moneyInP === 0 &&
    summary.moneyOutP === 0;

  function onPhone(value: string) {
    const clean = value.replace(/[^\d+\s-]/g, "").slice(0, 16);
    setPhone(clean);
    try {
      localStorage.setItem(PHONE_KEY, clean);
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Daily summary on WhatsApp</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Makes a short summary of the day (sales, stock received, bank, minus stock) that you can send on WhatsApp. The
        app only opens WhatsApp with the message ready; you press send there. It includes bank balances, so send it
        only to the owner.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Date</span>
          <input type="date" className={`${input} w-full`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Owner WhatsApp number (optional)</span>
          <input
            className={`${input} w-full`}
            inputMode="tel"
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="10 digit number"
          />
        </label>
      </div>
      {phoneInvalid && (
        <p className="text-sm rounded-md border p-2">
          This number does not look right. WhatsApp will open without a contact and you can pick one.
        </p>
      )}
      <p className="text-xs text-muted-foreground">The number is saved on this phone only.</p>

      <section className="space-y-3">
        <h2 className="font-medium">Message</h2>
        {loading || !summary ? (
          <p className="text-sm text-muted-foreground">{date ? "Loading..." : "Pick a date."}</p>
        ) : (
          <>
            {empty && (
              <p className="text-sm rounded-md border p-2">
                Nothing was recorded on this date. The message will show zeros.
              </p>
            )}
            <textarea className={`${input} w-full h-48 font-mono`} readOnly value={message} />
            {tooLong && (
              <p className="text-sm rounded-md border p-2">
                This message is too long for a WhatsApp link. Use "Copy message" and paste it in WhatsApp.
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
