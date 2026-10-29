import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const localToday = () => {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const shiftDays = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">The item profit page could not open here.</p>;
    return this.props.children;
  }
}

interface ItemRow {
  key: string;
  name: string;
  qty: number;
  revenueP: number;
  costP: number;
  profitP: number;
  marginPct: number;
}
interface Review {
  name: string;
  priceP: number;
  suggestedRupees: number;
  marginPct: number;
}

function Inner() {
  const { db } = useStore();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quick, setQuick] = useState("30");
  const [target, setTarget] = useState("40");

  useEffect(() => {
    const t = localToday();
    setTo(t);
    setFrom(shiftDays(t, -29));
  }, []);

  function onQuick(v: string) {
    setQuick(v);
    if (v === "custom") return;
    if (v === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const t = localToday();
    setTo(t);
    setFrom(shiftDays(t, -(Number(v) - 1)));
  }

  const tgt = /^\d{1,2}$/.test(target) && Number(target) >= 1 && Number(target) <= 90 ? Number(target) : 0;

  const data = useMemo(() => {
    const invoices: any[] = Array.isArray((db as any)?.invoices) ? (db as any).invoices : [];
    const taps: any[] = Array.isArray((db as any)?.taps) ? (db as any).taps : [];

    const map = new Map<string, { name: string; qty: number; revenueP: number; costP: number }>();
    let bills = 0;
    for (const inv of invoices) {
      const d = dateOf(String(inv?.timestamp ?? ""));
      if (!d) continue;
      if (from && d < from) continue;
      if (to && d > to) continue;
      bills += 1;
      for (const it of Array.isArray(inv?.items) ? inv.items : []) {
        const key = String(it?.beerId || it?.beerName || "");
        if (!key) continue;
        const cur = map.get(key) ?? { name: String(it?.beerName ?? "Unknown"), qty: 0, revenueP: 0, costP: 0 };
        cur.qty += Number(it?.qty) || 0;
        cur.revenueP += paise(it?.total);
        cur.costP += paise(it?.costTotal);
        map.set(key, cur);
      }
    }

    const rows: ItemRow[] = Array.from(map.entries())
      .map(([key, v]) => {
        const profitP = v.revenueP - v.costP;
        return {
          key,
          name: v.name,
          qty: v.qty,
          revenueP: v.revenueP,
          costP: v.costP,
          profitP,
          marginPct: v.revenueP > 0 ? (profitP * 100) / v.revenueP : 0,
        };
      })
      .sort((a, b) => b.profitP - a.profitP || a.name.localeCompare(b.name));

    const soldKeys = new Set(rows.map((r) => r.key));
    const notSelling = taps
      .filter((t) => !soldKeys.has(String(t?.id)))
      .map((t) => ({ name: String(t?.name ?? "Tap"), liters: Number(t?.currentLiters) || 0 }));

    // A pint is half a litre. Whole-number maths keeps the suggested price exact.
    const review: Review[] = [];
    if (tgt > 0) {
      for (const t of taps) {
        const priceP = paise(t?.pricePerPint);
        const costPintP = Math.round(paise(t?.costPerLiter) / 2);
        if (priceP <= 0) continue;
        const marginNow = ((priceP - costPintP) * 100) / priceP;
        if ((priceP - costPintP) * 100 < tgt * priceP) {
          const suggestedPaise = Math.ceil((costPintP * 100) / (100 - tgt));
          review.push({
            name: String(t?.name ?? "Tap"),
            priceP,
            suggestedRupees: Math.ceil(suggestedPaise / 100),
            marginPct: marginNow,
          });
        }
      }
      review.sort((a, b) => a.marginPct - b.marginPct);
    }

    const revenueP = rows.reduce((s, r) => s + r.revenueP, 0);
    const costP = rows.reduce((s, r) => s + r.costP, 0);
    return {
      rows,
      bills,
      revenueP,
      costP,
      profitP: revenueP - costP,
      marginPct: revenueP > 0 ? ((revenueP - costP) * 100) / revenueP : 0,
      notSelling,
      review,
    };
  }, [db, from, to, tgt]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Item profit</h1>

      <p className="text-sm text-muted-foreground">
        Shows how much each beer earned from your POS bills. Sale is the item total before tax. Cost is the cost saved
        in each bill. Liquor counter sales are not included here.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Period</span>
          <select className={`${input} w-full`} value={quick} onChange={(e) => onQuick(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">From</span>
          <input
            type="date"
            className={`${input} w-full`}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setQuick("custom");
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">To</span>
          <input
            type="date"
            className={`${input} w-full`}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setQuick("custom");
            }}
          />
        </label>
      </div>
      {from && to && from > to && <p className="text-sm rounded-md border p-2">From date is after To date.</p>}

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p className="font-medium">This period</p>
        <p>
          {data.bills} bill(s) | Sale {inr(data.revenueP)} | Cost {inr(data.costP)}
        </p>
        <p className="font-medium">
          Profit {inr(data.profitP)} ({pct(data.marginPct)} margin)
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Items by profit</h2>
        {data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills in this period.</p>
        ) : (
          data.rows.map((r, i) => {
            const low = r.profitP < 0 || (tgt > 0 && r.marginPct < tgt);
            return (
              <div key={r.key} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">
                    {i + 1}. {r.name}
                  </span>
                  <span className={low ? "font-medium text-destructive" : "font-medium"}>{pct(r.marginPct)}</span>
                </div>
                <p>
                  {r.qty} sold | Sale {inr(r.revenueP)} | Cost {inr(r.costP)}
                </p>
                <p className={r.profitP < 0 ? "font-medium text-destructive" : "font-medium"}>
                  Profit {inr(r.profitP)}
                </p>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Price check</h2>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">I want at least this margin (1 to 90 %)</span>
          <input
            className={`${input} w-28`}
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
        </label>
        {tgt === 0 ? (
          <p className="text-sm text-muted-foreground">Enter a number from 1 to 90.</p>
        ) : data.review.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every tap meets {tgt}% margin at today's price.</p>
        ) : (
          data.review.map((v) => (
            <p key={v.name} className="text-sm">
              {v.name}: margin {pct(v.marginPct)} | price {inr(v.priceP)} | to reach {tgt}% keep at least{" "}
              <span className="font-medium">{inr(v.suggestedRupees * 100)}</span>
            </p>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          The suggested price uses the cost per litre saved on each tap today and is rounded up to a whole rupee. The
          final price is your decision.
        </p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-medium">Not sold in this period</h2>
        {data.notSelling.length === 0 ? (
          <p className="text-muted-foreground">Every tap sold at least once.</p>
        ) : (
          data.notSelling.map((t) => (
            <p key={t.name}>
              {t.name} | {(Math.round(t.liters * 10) / 10).toFixed(1)} L still in the keg
            </p>
          ))
        )}
      </section>
    </div>
  );
}

export default function ItemProfitView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
