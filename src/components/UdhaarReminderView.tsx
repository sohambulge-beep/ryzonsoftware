import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const REM_KEY = "pt_udhaar_reminded";
const MAX_URL = 1900;

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
    if (this.state.failed) return <p className="p-4 text-sm">The reminder page could not open here.</p>;
    return this.props.children;
  }
}

interface Row {
  id: string;
  name: string;
  phoneRaw: string;
  num: string;
  balanceP: number;
  limitP: number;
  days: number | null;
  over: boolean;
  message: string;
  url: string;
}

function Inner() {
  const { db } = useStore();
  const [today, setToday] = useState("");
  const [reminded, setReminded] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [minDays, setMinDays] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setToday(localDate());
    try {
      const raw = localStorage.getItem(REM_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") clean[k] = v;
        setReminded(clean);
      }
    } catch {
      // storage can be blocked or unreadable; start empty
    }
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!today) return [];
    const bar = String((db as any)?.settings?.barName ?? "").trim();
    const customers: any[] = Array.isArray((db as any)?.customers) ? (db as any).customers : [];
    const invoices: any[] = Array.isArray((db as any)?.invoices) ? (db as any).invoices : [];

    // Oldest unpaid bill date for each customer.
    const oldest = new Map<string, string>();
    for (const inv of invoices) {
      if (!inv || paise(inv.balanceDue) <= 0) continue;
      const d = dateOf(String(inv.timestamp ?? ""));
      if (!d) continue;
      const cur = oldest.get(String(inv.customerId));
      if (!cur || d < cur) oldest.set(String(inv.customerId), d);
    }

    const out: Row[] = [];
    for (const c of customers) {
      const balanceP = paise(c?.currentBalance);
      if (balanceP <= 0) continue;
      const id = String(c.id);
      const name = String(c.name ?? "Customer");
      const since = oldest.get(id);
      const days = since ? Math.max(0, daysBetween(since, today)) : null;
      const num = waNumber(String(c.phone ?? ""));
      const message =
        `Namaste ${name} ji,\n` +
        `${bar ? `${bar} ki taraf se ` : ""}yaad dilana hai ki aapka Rs ${inr(balanceP)} baaki hai` +
        `${days !== null && days > 0 ? ` (${days} din se)` : ""}.\n` +
        `Kripya jaldi chuka dein. Dhanyavaad.`;
      out.push({
        id,
        name,
        phoneRaw: String(c.phone ?? ""),
        num,
        balanceP,
        limitP: paise(c.tabLimit),
        days,
        over: paise(c.tabLimit) > 0 && balanceP > paise(c.tabLimit),
        message,
        url: num ? `https://wa.me/${num}?text=${encodeURIComponent(message)}` : "",
      });
    }
    out.sort((a, b) => b.balanceP - a.balanceP || a.name.localeCompare(b.name));
    return out;
  }, [db, today]);

  const shown = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (minDays > 0 && !(r.days !== null && r.days >= minDays)) return false;
    return true;
  });
  const totalP = shown.reduce((s, r) => s + r.balanceP, 0);

  function markReminded(id: string) {
    const next = { ...reminded, [id]: today };
    setReminded(next);
    try {
      localStorage.setItem(REM_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  async function onCopy(r: Row) {
    try {
      await navigator.clipboard.writeText(r.message);
      setMsg(`Message for ${r.name} copied. Paste it in WhatsApp.`);
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Udhaar reminder</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Customers who still owe money. Tap WhatsApp to open a ready message and press send there. The app does not send
        anything by itself.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Search customer</span>
          <input className={`${input} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Owing for</span>
          <select className={`${input} w-full`} value={minDays} onChange={(e) => setMinDays(Number(e.target.value))}>
            <option value={0}>Any time</option>
            <option value={7}>7 days or more</option>
            <option value={15}>15 days or more</option>
            <option value={30}>30 days or more</option>
          </select>
        </label>
      </div>

      <section className="rounded-md border p-3 text-sm">
        <p>
          {shown.length} customer(s) | Total owed {inr(totalP)}
        </p>
      </section>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? "Nobody owes money right now." : "No customer matches this filter."}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const tooLong = r.url.length > MAX_URL;
            return (
              <div key={r.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{r.name}</span>
                  <span className="font-medium">{inr(r.balanceP)}</span>
                </div>
                <p className="text-muted-foreground">
                  {r.days !== null ? `Owing for ${r.days} day(s)` : "Owing since an unknown date"}
                  {r.over ? ` | Over limit (${inr(r.limitP)})` : ""}
                </p>
                <p className="text-muted-foreground">
                  {r.num ? r.phoneRaw : "No valid phone number saved for this customer"}
                  {reminded[r.id] ? ` | Last reminded: ${reminded[r.id]}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {r.num && !tooLong ? (
                    <a
                      className={btn}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markReminded(r.id)}
                    >
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function UdhaarReminderView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
