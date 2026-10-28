import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const KEY = "pt_cash_closings";
const KEEP = 120;
const DENOMS = [500, 200, 100, 50, 20, 10];

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isCash = (m: any) => String(m ?? "").toLowerCase().includes("cash");
const digits = (s: string, max: number) => s.replace(/[^\d]/g, "").slice(0, max);
const decimals = (s: string) => s.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 10);
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

interface Closing {
  date: string;
  openingP: number;
  expectedP: number;
  countedP: number;
  diffP: number;
  cashSalesP: number;
  cashTabP: number;
  otherInP: number;
  cashExpP: number;
  takenOutP: number;
  note: string;
  savedAt: string;
  f: { opening: string; takenOut: string; otherIn: string; otherCounted: string; counts: Record<string, string> };
}

const NUMS = [
  "openingP", "expectedP", "countedP", "diffP", "cashSalesP", "cashTabP", "otherInP", "cashExpP", "takenOutP",
] as const;

function loadAll(): Record<string, Closing> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out: Record<string, Closing> = {};
    for (const [k, v] of Object.entries<any>(p)) {
      if (!isDate(k) || !v || typeof v !== "object") continue;
      if (!NUMS.every((n) => Number.isFinite(v[n]))) continue;
      const f = v.f && typeof v.f === "object" ? v.f : {};
      const counts: Record<string, string> = {};
      for (const d of DENOMS) counts[String(d)] = digits(String(f.counts?.[String(d)] ?? ""), 5);
      out[k] = {
        date: k,
        openingP: v.openingP,
        expectedP: v.expectedP,
        countedP: v.countedP,
        diffP: v.diffP,
        cashSalesP: v.cashSalesP,
        cashTabP: v.cashTabP,
        otherInP: v.otherInP,
        cashExpP: v.cashExpP,
        takenOutP: v.takenOutP,
        note: String(v.note ?? "").slice(0, 200),
        savedAt: String(v.savedAt ?? ""),
        f: {
          opening: decimals(String(f.opening ?? "")),
          takenOut: decimals(String(f.takenOut ?? "")),
          otherIn: decimals(String(f.otherIn ?? "")),
          otherCounted: decimals(String(f.otherCounted ?? "")),
          counts,
        },
      };
    }
    return out;
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, Closing>) {
  const keys = Object.keys(map).sort().reverse().slice(0, KEEP);
  const out: Record<string, Closing> = {};
  for (const k of keys) out[k] = map[k];
  localStorage.setItem(KEY, JSON.stringify(out));
  return out;
}

function cell(v: string | number): string {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Cash closing could not open here.</p>;
    return this.props.children;
  }
}

const emptyCounts = () => Object.fromEntries(DENOMS.map((d) => [String(d), ""])) as Record<string, string>;

function Inner() {
  const { db } = useStore();
  const [date, setDate] = useState("");
  const [saved, setSaved] = useState<Record<string, Closing>>({});
  const [opening, setOpening] = useState("");
  const [takenOut, setTakenOut] = useState("");
  const [otherIn, setOtherIn] = useState("");
  const [otherCounted, setOtherCounted] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>(emptyCounts());
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setDate(localDate());
    setSaved(loadAll());
  }, []);

  // Fills the form from the saved closing of this date, or starts fresh with yesterday's counted cash as the opening.
  useEffect(() => {
    if (!date) return;
    const rec = saved[date];
    if (rec) {
      setOpening(rec.f.opening);
      setTakenOut(rec.f.takenOut);
      setOtherIn(rec.f.otherIn);
      setOtherCounted(rec.f.otherCounted);
      setCounts({ ...emptyCounts(), ...rec.f.counts });
      setNote(rec.note);
      return;
    }
    const earlier = Object.keys(saved).filter((k) => k < date).sort().reverse()[0];
    setOpening(earlier ? String(saved[earlier].countedP / 100) : "");
    setTakenOut("");
    setOtherIn("");
    setOtherCounted("");
    setCounts(emptyCounts());
    setNote("");
  }, [date, saved]);

  const pos = useMemo(() => {
    let cashSalesP = 0;
    let cardSalesP = 0;
    let tabGivenP = 0;
    let bills = 0;
    let cashTabP = 0;
    let otherTabP = 0;
    let cashExpP = 0;
    let otherExpP = 0;
    if (date) {
      const invoices: any[] = Array.isArray((db as any)?.invoices) ? (db as any).invoices : [];
      for (const i of invoices) {
        if (!i || dateOf(String(i.timestamp ?? "")) !== date) continue;
        bills += 1;
        const method = String(i.paymentMethod ?? "");
        if (method.toLowerCase() === "tab") tabGivenP += paise(i.total);
        else if (isCash(method)) cashSalesP += paise(i.paidAmount);
        else cardSalesP += paise(i.paidAmount);
      }
      const payments: any[] = Array.isArray((db as any)?.payments) ? (db as any).payments : [];
      for (const p of payments) {
        if (!p || dateOf(String(p.timestamp ?? "")) !== date) continue;
        if (isCash(p.paymentMethod)) cashTabP += paise(p.amount);
        else otherTabP += paise(p.amount);
      }
      const expenses: any[] = Array.isArray((db as any)?.expenses) ? (db as any).expenses : [];
      for (const e of expenses) {
        if (!e || String(e.date ?? "") !== date) continue;
        if (isCash(e.paymentMethod)) cashExpP += paise(e.amount);
        else otherExpP += paise(e.amount);
      }
    }
    return { cashSalesP, cardSalesP, tabGivenP, bills, cashTabP, otherTabP, cashExpP, otherExpP };
  }, [db, date]);

  const openingP = paise(num(opening));
  const takenOutP = paise(num(takenOut));
  const otherInP = paise(num(otherIn));
  const countedP =
    DENOMS.reduce((s, d) => s + d * 100 * (parseInt(counts[String(d)] || "0", 10) || 0), 0) +
    paise(num(otherCounted));
  const touched = otherCounted !== "" || DENOMS.some((d) => counts[String(d)] !== "");
  const expectedP = openingP + pos.cashSalesP + pos.cashTabP + otherInP - pos.cashExpP - takenOutP;
  const diffP = countedP - expectedP;

  function onSave() {
    if (!isDate(date)) {
      setMsg("Pick the date");
      return;
    }
    if (!touched) {
      setMsg("Enter the counted cash first");
      return;
    }
    if (saved[date] && !confirm(`A closing for ${date} is already saved. Replace it?`)) return;
    const rec: Closing = {
      date,
      openingP,
      expectedP,
      countedP,
      diffP,
      cashSalesP: pos.cashSalesP,
      cashTabP: pos.cashTabP,
      otherInP,
      cashExpP: pos.cashExpP,
      takenOutP,
      note: note.trim().slice(0, 200),
      savedAt: new Date().toISOString(),
      f: { opening, takenOut, otherIn, otherCounted, counts },
    };
    try {
      setSaved(saveAll({ ...saved, [date]: rec }));
      setMsg(
        diffP === 0
          ? "Closing saved. The cash matches."
          : `Closing saved. Cash is ${diffP < 0 ? "short" : "extra"} by ${inr(Math.abs(diffP))}.`
      );
    } catch {
      setMsg("Could not save on this phone (storage is blocked or full).");
    }
  }

  function onCsv() {
    const keys = Object.keys(saved).sort();
    if (keys.length === 0) {
      setMsg("No closing saved yet.");
      return;
    }
    const head = [
      "date", "opening", "cash_sales", "tab_cash_received", "other_cash_in", "cash_expenses",
      "taken_out", "expected", "counted", "difference", "note",
    ];
    const rows = keys.map((k) => {
      const r = saved[k];
      return [
        r.date, r.openingP, r.cashSalesP, r.cashTabP, r.otherInP, r.cashExpP, r.takenOutP, r.expectedP, r.countedP, r.diffP,
      ]
        .map((x, i) => (i === 0 ? String(x) : (Number(x) / 100).toFixed(2)))
        .concat([r.note]);
    });
    const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-cash-closing-${localDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg(`${keys.length} closing(s) downloaded.`);
    } catch {
      setMsg("The download did not work here.");
    }
  }

  const history = Object.keys(saved).sort().reverse().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Cash closing</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Compare the cash the app expects in the drawer with the cash you actually count. Only bills and payments whose
        method says "cash" are counted as cash. Liquor counter sales are not in the POS, so type that cash under "Other
        cash received". Closings are kept on this phone only; download the CSV now and then.
      </p>

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">Date</span>
        <input type="date" className={`${input} w-full`} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {date && saved[date] && (
        <p className="text-sm rounded-md border p-2">
          A closing for this date was saved ({new Date(saved[date].savedAt).toLocaleString("en-IN")}). Saving again
          replaces it.
        </p>
      )}

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p className="font-medium">From the POS on this date ({pos.bills} bill(s))</p>
        <p>Cash bills: {inr(pos.cashSalesP)}</p>
        <p>Cash received from tab customers: {inr(pos.cashTabP)}</p>
        <p>Cash expenses: {inr(pos.cashExpP)}</p>
        <p className="text-muted-foreground">
          Not cash (card or other): bills {inr(pos.cardSalesP)}, tab payments {inr(pos.otherTabP)}, expenses{" "}
          {inr(pos.otherExpP)}. Udhaar given today: {inr(pos.tabGivenP)}.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Opening cash</span>
          <input
            className={`${input} w-full`}
            inputMode="decimal"
            value={opening}
            onChange={(e) => setOpening(decimals(e.target.value))}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Other cash received (counter etc.)</span>
          <input
            className={`${input} w-full`}
            inputMode="decimal"
            value={otherIn}
            onChange={(e) => setOtherIn(decimals(e.target.value))}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Cash taken out (bank, owner)</span>
          <input
            className={`${input} w-full`}
            inputMode="decimal"
            value={takenOut}
            onChange={(e) => setTakenOut(decimals(e.target.value))}
          />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Count the cash in the drawer</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DENOMS.map((d) => (
            <label key={d} className="block space-y-1">
              <span className="text-sm text-muted-foreground">{d} notes</span>
              <input
                className={`${input} w-full`}
                inputMode="numeric"
                value={counts[String(d)]}
                onChange={(e) => setCounts({ ...counts, [String(d)]: digits(e.target.value, 5) })}
              />
            </label>
          ))}
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Coins / other amount</span>
            <input
              className={`${input} w-full`}
              inputMode="decimal"
              value={otherCounted}
              onChange={(e) => setOtherCounted(decimals(e.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p>Expected in drawer: {inr(expectedP)}</p>
        <p>Counted: {touched ? inr(countedP) : "not counted yet"}</p>
        {touched && (
          <p className={`font-medium ${diffP !== 0 ? "text-destructive" : ""}`}>
            {diffP === 0
              ? "Matches"
              : diffP < 0
                ? `Short by ${inr(-diffP)}`
                : `Extra by ${inr(diffP)}`}
          </p>
        )}
      </section>

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">Note (optional)</span>
        <input className={`${input} w-full`} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="flex flex-wrap gap-3">
        <button className={btn} disabled={!touched} onClick={onSave}>
          Save closing
        </button>
        <button className={btn} onClick={onCsv}>
          Download history (CSV)
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Recent closings</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closing saved yet.</p>
        ) : (
          history.map((k) => {
            const r = saved[k];
            return (
              <div key={k} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span>
                  {r.date} | expected {inr(r.expectedP)} | counted {inr(r.countedP)}
                </span>
                <span className={r.diffP !== 0 ? "font-medium text-destructive" : "font-medium"}>
                  {r.diffP === 0 ? "OK" : `${r.diffP < 0 ? "-" : "+"}${inr(Math.abs(r.diffP))}`}
                </span>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

export default function CashClosingView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
