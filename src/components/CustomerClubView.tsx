import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const RED_KEY = "pt_club_redeemed";
const RATE_KEY = "pt_club_rate";
const MAX_URL = 1900;

// Spend needed (in paise) for each level.
const TIERS: { name: string; minP: number }[] = [
  { name: "VIP", minP: 500000 },
  { name: "Gold", minP: 200000 },
  { name: "Silver", minP: 50000 },
];
const tierOf = (p: number) => TIERS.find((t) => p >= t.minP)?.name ?? "Member";

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Turns what is saved into a WhatsApp number (country code 91, digits only). Empty if not valid.
function waNumber(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return "";
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">The customer club could not open here.</p>;
    return this.props.children;
  }
}

interface Row {
  id: string;
  name: string;
  phoneRaw: string;
  num: string;
  spentP: number;
  visits: number;
  avgP: number;
  last: string;
  days: number | null;
  earned: number;
  balance: number;
  tier: string;
}

function Inner() {
  const { db } = useStore();
  const [today, setToday] = useState("");
  const [rate, setRate] = useState("100");
  const [redeemed, setRedeemed] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [away, setAway] = useState(0);
  const [offer, setOffer] = useState("");
  const [openId, setOpenId] = useState("");
  const [pts, setPts] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setToday(localDate());
    try {
      const r = localStorage.getItem(RATE_KEY);
      if (r && /^\d{1,6}$/.test(r) && Number(r) > 0) setRate(r);
      const raw = localStorage.getItem(RED_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries<any>(parsed)) {
          if (typeof v === "number" && Number.isInteger(v) && v >= 0) clean[k] = v;
        }
        setRedeemed(clean);
      }
    } catch {
      // storage can be blocked or unreadable; start empty
    }
  }, []);

  const rateNum = /^\d{1,6}$/.test(rate) && Number(rate) > 0 ? Number(rate) : 100;
  const bar = String((db as any)?.settings?.barName ?? "").trim();

  const rows = useMemo<Row[]>(() => {
    const customers: any[] = Array.isArray((db as any)?.customers) ? (db as any).customers : [];
    const invoices: any[] = Array.isArray((db as any)?.invoices) ? (db as any).invoices : [];
    const agg = new Map<string, { spentP: number; visits: number; last: string }>();
    for (const inv of invoices) {
      const id = String(inv?.customerId ?? "");
      if (!id) continue;
      const d = dateOf(String(inv?.timestamp ?? ""));
      const cur = agg.get(id) ?? { spentP: 0, visits: 0, last: "" };
      cur.spentP += paise(inv?.total);
      cur.visits += 1;
      if (d && d > cur.last) cur.last = d;
      agg.set(id, cur);
    }
    const out: Row[] = customers.map((c) => {
      const id = String(c?.id ?? "");
      const a = agg.get(id);
      const spentP = a?.spentP ?? 0;
      const visits = a?.visits ?? 0;
      const last = a?.last ?? "";
      const earned = Math.floor(spentP / (rateNum * 100));
      const balance = Math.max(0, earned - (redeemed[id] ?? 0));
      return {
        id,
        name: String(c?.name ?? "Customer"),
        phoneRaw: String(c?.phone ?? ""),
        num: waNumber(String(c?.phone ?? "")),
        spentP,
        visits,
        avgP: visits > 0 ? Math.round(spentP / visits) : 0,
        last,
        days: last && today ? Math.max(0, daysBetween(last, today)) : null,
        earned,
        balance,
        tier: tierOf(spentP),
      };
    });
    out.sort((a, b) => b.spentP - a.spentP || a.name.localeCompare(b.name));
    return out;
  }, [db, today, rateNum, redeemed]);

  const shown = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (away > 0 && !(r.days === null || r.days >= away)) return false;
    return true;
  });

  const totalSpentP = rows.reduce((s, r) => s + r.spentP, 0);
  const pointsOut = rows.reduce((s, r) => s + r.balance, 0);
  const atRisk = rows.filter((r) => r.days !== null && r.days >= 30).length;

  function message(r: Row) {
    const o = offer.trim();
    return (
      `Namaste ${r.name} ji,\n` +
      `${bar ? `${bar} ` : "Hume "}ko aapki yaad aa rahi hai. ` +
      `${o ? `${o}. ` : ""}` +
      `${r.balance > 0 ? `Aapke ${r.balance} points baaki hain. ` : ""}` +
      `Jaldi aaiye, hum intezaar kar rahe hain!`
    );
  }

  function onRate(v: string) {
    const clean = v.replace(/\D/g, "").slice(0, 6);
    setRate(clean);
    try {
      if (clean !== "" && Number(clean) > 0) localStorage.setItem(RATE_KEY, clean);
    } catch {
      // ignore
    }
  }

  function redeem(r: Row) {
    const n = Number(pts);
    if (!Number.isInteger(n) || n <= 0) {
      setMsg("Enter whole points (1 or more)");
      return;
    }
    if (n > r.balance) {
      setMsg(`${r.name} has only ${r.balance} points`);
      return;
    }
    if (!confirm(`Use ${n} points of ${r.name}?`)) return;
    const next = { ...redeemed, [r.id]: (redeemed[r.id] ?? 0) + n };
    try {
      localStorage.setItem(RED_KEY, JSON.stringify(next));
    } catch {
      setMsg("Could not save on this phone (storage is blocked). Nothing was changed.");
      return;
    }
    setRedeemed(next);
    setOpenId("");
    setPts("");
    setMsg(`${n} points used for ${r.name}. Give the discount at the counter.`);
  }

  async function onCopy(r: Row) {
    try {
      await navigator.clipboard.writeText(message(r));
      setMsg(`Message for ${r.name} copied. Paste it in WhatsApp.`);
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Customer club</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Points are earned from the bills of registered customers (walk-in guests are not counted). Redeemed points are
        remembered on this phone only. Changing the rate changes everyone's points. The app only opens WhatsApp with a
        ready message; you press send there.
      </p>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p>
          {rows.length} member(s) | Total spent {inr(totalSpentP)}
        </p>
        <p>
          Points outstanding {pointsOut} | Not seen for 30+ days: {atRisk}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Rupees spent for 1 point</span>
          <input className={`${input} w-full`} inputMode="numeric" value={rate} onChange={(e) => onRate(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Offer line for the WhatsApp message (optional)</span>
          <input
            className={`${input} w-full`}
            maxLength={80}
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="For example: 10% off this week"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Search customer</span>
          <input className={`${input} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Not seen for</span>
          <select className={`${input} w-full`} value={away} onChange={(e) => setAway(Number(e.target.value))}>
            <option value={0}>Everyone</option>
            <option value={7}>7 days or more</option>
            <option value={15}>15 days or more</option>
            <option value={30}>30 days or more</option>
            <option value={60}>60 days or more</option>
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? "No customer is saved yet." : "No customer matches this filter."}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const url = r.num ? `https://wa.me/${r.num}?text=${encodeURIComponent(message(r))}` : "";
            const tooLong = url.length > MAX_URL;
            return (
              <div key={r.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{r.name}</span>
                  <span className="font-medium">{r.tier}</span>
                </div>
                <p>
                  Spent {inr(r.spentP)} | {r.visits} bill(s) | Average {inr(r.avgP)}
                </p>
                <p className="text-muted-foreground">
                  {r.days === null ? "No bill yet" : `Last visit ${r.last} (${r.days} day(s) ago)`}
                </p>
                <p className="font-medium">
                  Points: {r.balance} <span className="text-muted-foreground">(earned {r.earned})</span>
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {r.num && !tooLong ? (
                    <a className={btn} href={url} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  ) : (
                    <button className={btn} disabled>
                      WhatsApp
                    </button>
                  )}
                  <button className="underline" onClick={() => onCopy(r)}>
                    Copy message
                  </button>
                  <button
                    className="underline"
                    disabled={r.balance === 0}
                    onClick={() => {
                      setOpenId(openId === r.id ? "" : r.id);
                      setPts("");
                    }}
                  >
                    Redeem points
                  </button>
                </div>
                {!r.num && <p className="text-muted-foreground">No valid phone number saved for this customer.</p>}
                {openId === r.id && (
                  <div className="flex items-end gap-3 border-t pt-3">
                    <label className="block space-y-1">
                      <span className="text-muted-foreground">Points to use (up to {r.balance})</span>
                      <input
                        className={`${input} w-28`}
                        inputMode="numeric"
                        value={pts}
                        onChange={(e) => setPts(e.target.value.replace(/\D/g, "").slice(0, 7))}
                      />
                    </label>
                    <button className={btn} onClick={() => redeem(r)}>
                      Use points
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CustomerClubView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
