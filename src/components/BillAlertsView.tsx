import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";

const REV_KEY = "pt_alerts_reviewed";
const HOURS_KEY = "pt_alerts_hours";
const MAX_REV = 2000;
const DUP_MS = 10 * 60 * 1000;
const SHOW_MAX = 30;

type Kind = "loss" | "nonpos" | "big" | "hours" | "dup" | "gap" | "limit";

const SECTIONS: { kind: Kind; title: string; hint: string }[] = [
  { kind: "loss", title: "Sold below cost", hint: "The item total in the bill is less than its saved cost." },
  { kind: "nonpos", title: "Zero or negative bills", hint: "The bill total is zero or less." },
  { kind: "big", title: "Unusually large bills", hint: "More than 3 times the average bill of this period." },
  { kind: "hours", title: "Bills outside opening hours", hint: "Set your opening hours above." },
  { kind: "dup", title: "Possible duplicate bills", hint: "Same customer, same items and same amount within 10 minutes." },
  {
    kind: "gap",
    title: "Missing bill numbers",
    hint: "A number is missing between the first and last bill. A deleted bill can cause this, but it can also be normal.",
  },
  { kind: "limit", title: "Customers over their tab limit", hint: "The balance is more than the limit set for the customer." },
];

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
const stamp = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hourOr = (s: string, fallback: number) => (/^\d{1,2}$/.test(s) && Number(s) <= 23 ? Number(s) : fallback);

interface B {
  inv: any;
  ms: number;
  totalP: number;
  no: string;
  cust: string;
  custId: string;
}
interface Flag {
  key: string;
  kind: Kind;
  no: string;
  ms: number;
  when: string;
  cust: string;
  amountP: number;
  note: string;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Bill alerts could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { db } = useStore();
  const [today, setToday] = useState("");
  const [range, setRange] = useState("30");
  const [openH, setOpenH] = useState("11");
  const [closeH, setCloseH] = useState("1");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [showReviewed, setShowReviewed] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setToday(localToday());
    try {
      const raw = localStorage.getItem(REV_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setReviewed(parsed.filter((x) => typeof x === "string").slice(0, MAX_REV));
      const h = localStorage.getItem(HOURS_KEY);
      if (h) {
        const p = JSON.parse(h);
        if (p && typeof p.o === "string" && /^\d{1,2}$/.test(p.o)) setOpenH(p.o);
        if (p && typeof p.c === "string" && /^\d{1,2}$/.test(p.c)) setCloseH(p.c);
      }
    } catch {
      // storage can be blocked or unreadable; start with the defaults
    }
  }, []);

  function saveHours(o: string, c: string) {
    try {
      localStorage.setItem(HOURS_KEY, JSON.stringify({ o, c }));
    } catch {
      // ignore
    }
  }

  function markReviewed(key: string, on: boolean) {
    const next = on ? [key, ...reviewed.filter((k) => k !== key)].slice(0, MAX_REV) : reviewed.filter((k) => k !== key);
    try {
      localStorage.setItem(REV_KEY, JSON.stringify(next));
    } catch {
      setMsg("Could not save on this phone (storage is blocked).");
      return;
    }
    setMsg("");
    setReviewed(next);
  }

  const flags = useMemo<Flag[]>(() => {
    if (!today) return [];
    const invoices: any[] = Array.isArray((db as any)?.invoices) ? (db as any).invoices : [];
    const customers: any[] = Array.isArray((db as any)?.customers) ? (db as any).customers : [];
    const from = range === "all" ? "" : shiftDays(today, -(Number(range) - 1));
    const openN = hourOr(openH, 11);
    const closeN = hourOr(closeH, 1);
    const inside = (h: number) =>
      openN === closeN ? true : openN < closeN ? h >= openN && h < closeN : h >= openN || h < closeN;

    const bills: B[] = [];
    for (const inv of invoices) {
      const ms = new Date(String(inv?.timestamp ?? "")).getTime();
      if (!Number.isFinite(ms)) continue;
      const d = dateOf(String(inv.timestamp));
      if (!d || (from && d < from) || d > today) continue;
      bills.push({
        inv,
        ms,
        totalP: paise(inv?.total),
        no: String(inv?.invoiceNo ?? ""),
        cust: String(inv?.customerName ?? ""),
        custId: String(inv?.customerId ?? ""),
      });
    }

    const out: Flag[] = [];
    const add = (kind: Kind, b: B, note: string) =>
      out.push({
        key: `${kind}|${b.no || b.ms}`,
        kind,
        no: b.no,
        ms: b.ms,
        when: stamp(b.ms),
        cust: b.cust,
        amountP: b.totalP,
        note,
      });

    const pos = bills.filter((b) => b.totalP > 0);
    const avgP = pos.length ? Math.round(pos.reduce((s, b) => s + b.totalP, 0) / pos.length) : 0;

    for (const b of bills) {
      const names: string[] = [];
      for (const it of Array.isArray(b.inv?.items) ? b.inv.items : []) {
        const t = paise(it?.total);
        const c = paise(it?.costTotal);
        if (c > 0 && t < c) names.push(String(it?.beerName ?? "Item"));
      }
      if (names.length > 0) add("loss", b, `${names.slice(0, 3).join(", ")} sold below cost`);
      if (b.totalP <= 0) add("nonpos", b, "Bill total is zero or less");
      if (pos.length >= 5 && avgP > 0 && b.totalP > 3 * avgP) {
        add("big", b, `${Math.round((b.totalP * 10) / avgP) / 10} times the average bill`);
      }
      const h = new Date(b.ms).getHours();
      if (!inside(h)) add("hours", b, `Made at ${pad(h)}:${pad(new Date(b.ms).getMinutes())}, outside ${pad(openN)}:00 to ${pad(closeN)}:00`);
    }

    // Duplicates: same customer, same items and same amount within 10 minutes.
    const sorted = [...bills].sort((a, b) => a.ms - b.ms);
    const last = new Map<string, { ms: number; no: string }>();
    for (const b of sorted) {
      if (b.totalP <= 0) continue;
      const sig = (Array.isArray(b.inv?.items) ? b.inv.items : [])
        .map((it: any) => `${it?.beerId ?? it?.beerName}:${it?.qty}`)
        .sort()
        .join(",");
      const k = `${b.custId || b.cust}|${b.totalP}|${sig}`;
      const prev = last.get(k);
      if (prev && b.ms - prev.ms <= DUP_MS) {
        const mins = Math.max(0, Math.round((b.ms - prev.ms) / 60000));
        add("dup", b, `Same as ${prev.no || "an earlier bill"}, ${mins} min earlier`);
      }
      last.set(k, { ms: b.ms, no: b.no });
    }

    // Missing bill numbers (only inside the period, at most 20 shown for each prefix).
    const groups = new Map<string, { nums: Set<number>; maxMs: number }>();
    for (const b of bills) {
      const m = /^(.*?)(\d{1,9})$/.exec(b.no);
      if (!m) continue;
      const g = groups.get(m[1]) ?? { nums: new Set<number>(), maxMs: 0 };
      g.nums.add(Number(m[2]));
      if (b.ms > g.maxMs) g.maxMs = b.ms;
      groups.set(m[1], g);
    }
    groups.forEach((g, prefix) => {
      if (g.nums.size < 3) return;
      const arr = Array.from(g.nums);
      let lo = arr[0];
      let hi = arr[0];
      for (const n of arr) {
        if (n < lo) lo = n;
        if (n > hi) hi = n;
      }
      if (hi - lo > 5000) return;
      let shown = 0;
      for (let n = lo; n <= hi && shown < 20; n++) {
        if (g.nums.has(n)) continue;
        out.push({
          key: `gap|${prefix}${n}`,
          kind: "gap",
          no: `${prefix}${n}`,
          ms: g.maxMs,
          when: "-",
          cust: "",
          amountP: 0,
          note: "No bill with this number in this period",
        });
        shown += 1;
      }
    });

    // Customers over their tab limit (right now, not tied to the period).
    for (const c of customers) {
      const balP = paise(c?.currentBalance);
      const limP = paise(c?.tabLimit);
      if (balP > 0 && limP > 0 && balP > limP) {
        out.push({
          key: `limit|${String(c?.id ?? c?.name ?? "")}`,
          kind: "limit",
          no: "",
          ms: 0,
          when: "Now",
          cust: String(c?.name ?? "Customer"),
          amountP: balP,
          note: `Limit is ${inr(limP)}`,
        });
      }
    }

    out.sort((a, b) => b.ms - a.ms);
    return out;
  }, [db, today, range, openH, closeH]);

  const openCount = flags.filter((f) => !reviewed.includes(f.key)).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Bill alerts</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Looks through your POS bills for things an owner should check. An alert is only a sign to look, not proof that
        something is wrong. Liquor counter sales are not included. "Reviewed" marks are kept on this phone only.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Period</span>
          <select className={`${input} w-full`} value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Shop opens at (hour 0 to 23)</span>
          <input
            className={`${input} w-full`}
            inputMode="numeric"
            value={openH}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 2);
              setOpenH(v);
              saveHours(v, closeH);
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Shop closes at (hour 0 to 23)</span>
          <input
            className={`${input} w-full`}
            inputMode="numeric"
            value={closeH}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 2);
              setCloseH(v);
              saveHours(openH, v);
            }}
          />
        </label>
      </div>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p className="font-medium">
          {openCount === 0 ? "Nothing to check right now." : `${openCount} thing(s) to check`}
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />
          Show reviewed ones too
        </label>
      </section>

      {SECTIONS.map((sec) => {
        const all = flags.filter((f) => f.kind === sec.kind);
        const list = all.filter((f) => showReviewed || !reviewed.includes(f.key));
        if (list.length === 0) return null;
        return (
          <section key={sec.kind} className="space-y-2">
            <h2 className="font-medium">
              {sec.title} ({list.length})
            </h2>
            <p className="text-xs text-muted-foreground">{sec.hint}</p>
            {list.slice(0, SHOW_MAX).map((f) => {
              const done = reviewed.includes(f.key);
              return (
                <div key={f.key} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{f.no || f.cust || "Bill"}</span>
                    {f.kind !== "gap" && <span className="font-medium">{inr(f.amountP)}</span>}
                  </div>
                  <p className="text-muted-foreground">
                    {f.when}
                    {f.cust && f.no ? ` | ${f.cust}` : ""}
                  </p>
                  <p>{f.note}</p>
                  <button className="underline" onClick={() => markReviewed(f.key, !done)}>
                    {done ? "Undo reviewed" : "Mark reviewed"}
                  </button>
                </div>
              );
            })}
            {list.length > SHOW_MAX && (
              <p className="text-xs text-muted-foreground">{list.length - SHOW_MAX} more not shown.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default function BillAlertsView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
