import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listBankAccounts } from "@/lib/bankService";
import { type ExciseSettings, getExciseSettings } from "@/lib/exciseService";

// Tables created by later migrations are not in the generated types yet, so cast.
const db = supabase as any;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const PAGE = 1000;

const printCss = `
@media print {
  body * { visibility: hidden; }
  #day-close, #day-close * { visibility: visible; color: #000 !important; background: #fff !important; }
  #day-close { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

// Local date (not UTC).
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Money is added up in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

interface SaleRow {
  brand_id: string;
  name: string;
  size_ml: number;
  bottles: number;
  valueP: number;
}
interface ReceiptRow {
  id: string;
  tp_no: string;
  party: string;
  bottles: number;
}
interface AccountRow {
  id: string;
  name: string;
  last4: string;
  inP: number;
  outP: number;
  closingP: number;
}
interface Loaded {
  date: string;
  sales: SaleRow[];
  receipts: ReceiptRow[];
  accounts: AccountRow[];
  transfersP: number;
}

export default function DayCloseView() {
  const [date, setDate] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<ExciseSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    setDate(localToday());
    (async () => {
      try {
        setSettings(await getExciseSettings());
      } catch {
        // the hotel name on the printout is optional
      }
    })();
  }, []);

  useEffect(() => {
    if (!date) return;
    const id = ++reqRef.current;
    setLoading(true);
    setMsg("");
    (async () => {
      try {
        const [salesRows, receiptRows, entryRows, bankAccounts, transferRows] = await Promise.all([
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
              .select("id, tp_no, party, excise_tp_items(bottles_total)")
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
        ]);
        if (id !== reqRef.current) return;

        const salesMap = new Map<string, SaleRow>();
        for (const r of salesRows) {
          const bottles = Number(r.bottles) || 0;
          const ratePaise = paise(r.excise_brands?.rate);
          const cur = salesMap.get(r.brand_id) ?? {
            brand_id: r.brand_id,
            name: r.excise_brands?.name ?? "Unknown brand",
            size_ml: Number(r.excise_brands?.size_ml) || 0,
            bottles: 0,
            valueP: 0,
          };
          cur.bottles += bottles;
          cur.valueP += bottles * ratePaise;
          salesMap.set(r.brand_id, cur);
        }
        const sales = Array.from(salesMap.values()).sort(
          (a, b) => b.bottles - a.bottles || a.name.localeCompare(b.name) || a.size_ml - b.size_ml
        );

        const receipts: ReceiptRow[] = receiptRows.map((r: any) => ({
          id: r.id,
          tp_no: r.tp_no,
          party: r.party ?? "",
          bottles: (r.excise_tp_items ?? []).reduce((s: number, i: any) => s + (Number(i.bottles_total) || 0), 0),
        }));

        const accMap = new Map<string, AccountRow>();
        for (const a of bankAccounts) {
          accMap.set(a.id, {
            id: a.id,
            name: a.name,
            last4: a.last4,
            inP: 0,
            outP: 0,
            closingP: paise(a.opening_balance),
          });
        }
        for (const e of entryRows) {
          const acc = accMap.get(e.account_id);
          if (!acc) continue;
          const p = paise(e.amount);
          const isDay = e.entry_date === date;
          if (e.direction === "credit") {
            acc.closingP += p;
            if (isDay) acc.inP += p;
          } else {
            acc.closingP -= p;
            if (isDay) acc.outP += p;
          }
        }

        setData({
          date,
          sales,
          receipts,
          accounts: Array.from(accMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
          transfersP: transferRows.reduce((s: number, t: any) => s + paise(t.amount), 0),
        });
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    })();
  }, [date]);

  const totals = useMemo(() => {
    if (!data) return null;
    const salesBottles = data.sales.reduce((s, r) => s + r.bottles, 0);
    const salesValueP = data.sales.reduce((s, r) => s + r.valueP, 0);
    const receivedBottles = data.receipts.reduce((s, r) => s + r.bottles, 0);
    const inAllP = data.accounts.reduce((s, a) => s + a.inP, 0);
    const outAllP = data.accounts.reduce((s, a) => s + a.outP, 0);
    return {
      salesBottles,
      salesValueP,
      receivedBottles,
      moneyInP: inAllP - data.transfersP,
      moneyOutP: outAllP - data.transfersP,
      balanceP: data.accounts.reduce((s, a) => s + a.closingP, 0),
      empty:
        data.sales.length === 0 &&
        data.receipts.length === 0 &&
        data.accounts.every((a) => a.inP === 0 && a.outP === 0),
    };
  }, [data]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Day close report</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <div className="flex flex-wrap items-end gap-3 no-print">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Date</span>
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className={btn} disabled={loading || !data} onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <section id="day-close" className="space-y-5 text-sm">
        <div>
          <h2 className="text-lg font-semibold">{settings?.hotel_name || "Hotel / bar name"}</h2>
          <p className="font-medium pt-1">Day close report: {date || "-"}</p>
        </div>

        {loading || !data || !totals ? (
          <p className="text-muted-foreground">{date ? "Loading..." : "Pick a date."}</p>
        ) : (
          <>
            {totals.empty && (
              <p className="rounded-md border p-2">Nothing was recorded on this date. Bank balances are as on this date.</p>
            )}

            <div className="space-y-1">
              <h3 className="font-medium">Sales (bottles)</h3>
              {data.sales.length === 0 ? (
                <p className="text-muted-foreground">No sales entered for this date.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-1 pr-3">Brand</th>
                        <th className="pr-3 text-right">Bottles</th>
                        <th className="text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales.map((r) => (
                        <tr key={r.brand_id} className="border-b">
                          <td className="py-1 pr-3">
                            {r.name} {r.size_ml} ml
                          </td>
                          <td className="pr-3 text-right">{r.bottles}</td>
                          <td className="text-right">{inr(r.valueP)}</td>
                        </tr>
                      ))}
                      <tr className="font-medium">
                        <td className="py-1 pr-3">Total</td>
                        <td className="pr-3 text-right">{totals.salesBottles}</td>
                        <td className="text-right">{inr(totals.salesValueP)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Value is bottles times the rate saved for each brand.</p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium">Stock received (TP receipts)</h3>
              {data.receipts.length === 0 ? (
                <p className="text-muted-foreground">No TP receipt dated this day.</p>
              ) : (
                <ul className="space-y-1">
                  {data.receipts.map((r) => (
                    <li key={r.id} className="flex justify-between border-b py-1">
                      <span>
                        TP {r.tp_no}
                        {r.party ? ` | ${r.party}` : ""}
                      </span>
                      <span>{r.bottles} bottles</span>
                    </li>
                  ))}
                  <li className="flex justify-between font-medium">
                    <span>Total received</span>
                    <span>{totals.receivedBottles} bottles</span>
                  </li>
                </ul>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="font-medium">Bank</h3>
              {data.accounts.length === 0 ? (
                <p className="text-muted-foreground">No bank accounts added.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-1 pr-3">Account</th>
                          <th className="pr-3 text-right">In</th>
                          <th className="pr-3 text-right">Out</th>
                          <th className="text-right">Closing balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.accounts.map((a) => (
                          <tr key={a.id} className="border-b">
                            <td className="py-1 pr-3">
                              {a.name}
                              {a.last4 ? ` (xxxx ${a.last4})` : ""}
                            </td>
                            <td className="pr-3 text-right">{inr(a.inP)}</td>
                            <td className="pr-3 text-right">{inr(a.outP)}</td>
                            <td className="text-right">{inr(a.closingP)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>Money in (without transfers): {inr(totals.moneyInP)}</p>
                  <p>Money out (without transfers): {inr(totals.moneyOutP)}</p>
                  <p>Transfers between your own accounts: {inr(data.transfersP)}</p>
                  <p className="font-medium">Total bank balance: {inr(totals.balanceP)}</p>
                  <p className="text-xs text-muted-foreground">
                    The account rows include transfer entries. Closing balance is the balance at the end of this date.
                  </p>
                </>
              )}
            </div>
          </>
        )}

        <p className="pt-8">Prepared by: ____________________ Checked by: ____________________</p>
      </section>
    </div>
  );
}
