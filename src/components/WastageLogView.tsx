import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const KEY = "pt_wastage_log";
const MAX_KEEP = 2000;
const OTHER = "__other__";
const REASONS = [
  "Foam / spill",
  "Spoiled / expired",
  "Breakage",
  "Free / complimentary",
  "Staff drink",
  "Test pour",
  "Other",
];

interface Entry {
  id: string;
  date: string;
  item: string;
  ml: number;
  reason: string;
  valueP: number;
  note: string;
}

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
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
// Money is handled in paise (whole numbers).
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const litres = (ml: number) => (ml / 1000).toFixed(3);

function cleanL(v: string): string {
  const t = v.replace(/[^\d.]/g, "");
  const i = t.indexOf(".");
  if (i === -1) return t.slice(0, 4);
  return `${t.slice(0, i).slice(0, 4)}.${t.slice(i + 1).replace(/\./g, "").slice(0, 3)}`;
}
function cleanMoney(v: string): string {
  const t = v.replace(/[^\d.]/g, "");
  const i = t.indexOf(".");
  if (i === -1) return t.slice(0, 8);
  return `${t.slice(0, i).slice(0, 8)}.${t.slice(i + 1).replace(/\./g, "").slice(0, 2)}`;
}
function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function cell(v: string | number): string {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function clean(v: any): Entry | null {
  if (!v || typeof v !== "object") return null;
  const date = String(v.date ?? "");
  if (!isRealDate(date)) return null;
  const item = String(v.item ?? "").trim().slice(0, 60);
  if (!item) return null;
  const ml = Number(v.ml);
  if (!Number.isInteger(ml) || ml < 1 || ml > 10000000) return null;
  const valueP = Number(v.valueP);
  if (!Number.isInteger(valueP) || valueP < 0 || valueP > 1000000000) return null;
  const reason = REASONS.includes(v.reason) ? String(v.reason) : "Other";
  return {
    id: String(v.id || newId()).slice(0, 40),
    date,
    item,
    ml,
    reason,
    valueP,
    note: String(v.note ?? "").slice(0, 150),
  };
}

function loadAll(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const out: Entry[] = [];
    const seen = new Set<string>();
    for (const v of parsed) {
      const e = clean(v);
      if (e && !seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
    return out.slice(0, MAX_KEEP);
  } catch {
    return [];
  }
}

// Saves the list (newest dates kept) and returns what was saved. Throws if the phone refuses to store it.
function persist(list: Entry[]): Entry[] {
  const capped = [...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_KEEP);
  localStorage.setItem(KEY, JSON.stringify(capped));
  return capped;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">The wastage log could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { db } = useStore();
  const [list, setList] = useState<Entry[]>([]);
  const [today, setToday] = useState("");
  const [period, setPeriod] = useState("month");
  const [date, setDate] = useState("");
  const [tapSel, setTapSel] = useState("");
  const [otherName, setOtherName] = useState("");
  const [lit, setLit] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [valueStr, setValueStr] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  // Saved entries are read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    const t = localToday();
    setToday(t);
    setDate(t);
    setList(loadAll());
  }, []);

  const taps: any[] = Array.isArray((db as any)?.taps) ? (db as any).taps : [];
  const tap = taps.find((t) => String(t?.id) === tapSel);

  const ml = (() => {
    if (lit === "" || lit === ".") return 0;
    const n = Number(lit);
    return Number.isFinite(n) ? Math.round(n * 1000) : 0;
  })();
  const suggestionP = tap && ml > 0 ? Math.round((ml * paise(tap.costPerLiter)) / 1000) : 0;

  function onSave() {
    const item = tapSel === OTHER ? otherName.trim() : tap ? String(tap.name ?? "Tap") : "";
    if (!item) {
      setMsg("Choose the item, or choose Other and type its name");
      return;
    }
    if (!isRealDate(date)) {
      setMsg("Pick a valid date");
      return;
    }
    if (today && date > today) {
      setMsg("The date cannot be in the future");
      return;
    }
    if (ml < 1 || ml > 10000000) {
      setMsg("Enter the litres lost (more than 0)");
      return;
    }
    const valueP = valueStr !== "" && valueStr !== "." ? paise(valueStr) : suggestionP;
    const rec: Entry = {
      id: newId(),
      date,
      item: item.slice(0, 60),
      ml,
      reason,
      valueP,
      note: note.trim().slice(0, 150),
    };
    try {
      setList(persist([rec, ...list]));
    } catch {
      setMsg("Could not save on this phone (storage is blocked or full). Nothing was changed.");
      return;
    }
    setMsg(
      `Saved: ${litres(ml)} L of ${rec.item}, loss ${inr(valueP)}.` +
        (valueP === 0 ? " The loss value is 0; type the value next time if you want it counted." : "")
    );
    setLit("");
    setValueStr("");
    setNote("");
    setOtherName("");
  }

  function onDelete(e: Entry) {
    if (!confirm(`Delete this entry (${e.item}, ${litres(e.ml)} L)?`)) return;
    try {
      setList(persist(list.filter((x) => x.id !== e.id)));
      setMsg("Entry deleted.");
    } catch {
      setMsg("Could not save on this phone (storage is blocked). Nothing was changed.");
    }
  }

  function onCsv() {
    if (list.length === 0) {
      setMsg("No entry saved yet.");
      return;
    }
    const head = ["date", "item", "litres", "reason", "loss_value", "note"];
    const rows = [...list]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => [e.date, e.item, litres(e.ml), e.reason, (e.valueP / 100).toFixed(2), e.note]);
    const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-wastage-${localToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg(`${list.length} entr${list.length === 1 ? "y" : "ies"} downloaded.`);
    } catch {
      setMsg("The download did not work here.");
    }
  }

  const view = useMemo(() => {
    if (!today) return null;
    const monthStart = `${today.slice(0, 7)}-01`;
    const from30 = shiftDays(today, -29);
    const inPeriod = (d: string) => {
      if (!d || d > today) return false;
      if (period === "month") return d >= monthStart;
      if (period === "30") return d >= from30;
      return true;
    };
    const rows = list.filter((e) => inPeriod(e.date));
    const totalMl = rows.reduce((s, e) => s + e.ml, 0);
    const totalP = rows.reduce((s, e) => s + e.valueP, 0);

    const byReason = new Map<string, { ml: number; valueP: number }>();
    const byItem = new Map<string, number>();
    for (const e of rows) {
      const r = byReason.get(e.reason) ?? { ml: 0, valueP: 0 };
      r.ml += e.ml;
      r.valueP += e.valueP;
      byReason.set(e.reason, r);
      byItem.set(e.item, (byItem.get(e.item) ?? 0) + e.ml);
    }
    const reasons = Array.from(byReason.entries()).sort((a, b) => b[1].valueP - a[1].valueP || b[1].ml - a[1].ml);
    const items = Array.from(byItem.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const invoices: any[] = Array.isArray((db as any)?.invoices) ? (db as any).invoices : [];
    let salesP = 0;
    for (const inv of invoices) {
      if (inPeriod(dateOf(String(inv?.timestamp ?? "")))) salesP += paise(inv?.total);
    }
    return { rows, totalMl, totalP, reasons, items, salesP };
  }, [list, db, today, period]);

  if (!view) return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;

  const recent = [...view.rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Wastage log</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Note down beer or stock that was lost: foam, spills, breakage, free pours, staff drinks, expired stock. This log
        does not change the stock, so if litres left a keg, also correct it in Stock and Kegs. Entries are saved on this
        phone only; download the CSV now and then.
      </p>

      <section className="space-y-3 rounded-md border p-3">
        <h2 className="font-medium">New entry</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Date</span>
            <input type="date" className={`${input} w-full`} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Item</span>
            <select className={`${input} w-full`} value={tapSel} onChange={(e) => setTapSel(e.target.value)}>
              <option value="">Choose item</option>
              {taps.map((t) => (
                <option key={String(t?.id)} value={String(t?.id)}>
                  {String(t?.name ?? "Tap")}
                </option>
              ))}
              <option value={OTHER}>Other (type the name)</option>
            </select>
          </label>
          {tapSel === OTHER && (
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm text-muted-foreground">Item name</span>
              <input
                className={`${input} w-full`}
                maxLength={60}
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
              />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Litres lost</span>
            <input
              className={`${input} w-full`}
              inputMode="decimal"
              value={lit}
              onChange={(e) => setLit(cleanL(e.target.value))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Reason</span>
            <select className={`${input} w-full`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Loss value (leave empty to use the cost)</span>
            <input
              className={`${input} w-full`}
              inputMode="decimal"
              placeholder={suggestionP > 0 ? `Auto: ${inr(suggestionP)}` : "0.00"}
              value={valueStr}
              onChange={(e) => setValueStr(cleanMoney(e.target.value))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Note (optional)</span>
            <input className={`${input} w-full`} maxLength={150} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <button className={btn} onClick={onSave}>
          Save entry
        </button>
      </section>

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">Period</span>
        <select className={`${input} w-full`} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="month">This month</option>
          <option value="30">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </label>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p>
          {view.rows.length} entr{view.rows.length === 1 ? "y" : "ies"} | {litres(view.totalMl)} L lost
        </p>
        <p className="font-medium">Loss value {inr(view.totalP)}</p>
        {view.salesP > 0 && view.totalP > 0 && (
          <p className="text-muted-foreground">
            That is {(Math.round((view.totalP * 1000) / view.salesP) / 10).toFixed(1)}% of the POS sales of this period
            (liquor counter sales are not in this figure).
          </p>
        )}
        <button className="underline" onClick={onCsv}>
          Download wastage (CSV)
        </button>
      </section>

      {view.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entry in this period.</p>
      ) : (
        <>
          <section className="space-y-1 text-sm">
            <h2 className="font-medium">By reason</h2>
            {view.reasons.map(([name, v]) => (
              <p key={name}>
                {name} | {litres(v.ml)} L | {inr(v.valueP)}
              </p>
            ))}
          </section>

          <section className="space-y-1 text-sm">
            <h2 className="font-medium">Most wasted items (litres)</h2>
            {view.items.map(([name, v]) => (
              <p key={name}>
                {name} | {litres(v)} L
              </p>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Recent entries</h2>
            {recent.map((e) => (
              <div key={e.id} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{e.item}</span>
                  <span className="font-medium">{litres(e.ml)} L</span>
                </div>
                <p className="text-muted-foreground">
                  {e.date} | {e.reason} | loss {inr(e.valueP)}
                  {e.note ? ` | ${e.note}` : ""}
                </p>
                <button className="underline" onClick={() => onDelete(e)}>
                  Delete
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export default function WastageLogView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
