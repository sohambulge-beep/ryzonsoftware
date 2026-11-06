import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";
import { ACTIVITY_EVENT, readActivityLog, type ActEntry } from "@/lib/activityLog";
import { VOID_EVENT, readVoidLog } from "@/lib/voidLog";
import { useOwnerAccess } from "@/lib/ownerAccess";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const SHOW_MAX = 100;

const GROUPS: { id: string; label: string; types: string[] }[] = [
  { id: "all", label: "Everything", types: [] },
  { id: "bills", label: "Bills", types: ["bill"] },
  { id: "payments", label: "Payments", types: ["payment"] },
  { id: "stock", label: "Stock and purchases", types: ["purchase", "stock"] },
  { id: "expenses", label: "Expenses", types: ["expense", "expense-deleted"] },
  { id: "customers", label: "Customers", types: ["customer"] },
  { id: "prices", label: "Price changes", types: ["price"] },
  { id: "cancel", label: "Cancelled bills", types: ["cancel"] },
  { id: "settings", label: "Settings and other", types: ["settings", "bulk"] },
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
const whenLong = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function cell(v: string | number): string {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">The activity log could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { db } = useStore();
  const { isOwner } = useOwnerAccess();
  const [entries, setEntries] = useState<ActEntry[]>([]);
  const [voids, setVoids] = useState(() => [] as ReturnType<typeof readVoidLog>);
  const [today, setToday] = useState("");
  const [period, setPeriod] = useState("7");
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");

  const cur = String(db.settings?.currency ?? "₹");

  // Saved entries are read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setToday(localToday());
    const load = () => {
      setEntries(readActivityLog());
      setVoids(readVoidLog());
    };
    load();
    window.addEventListener(ACTIVITY_EVENT, load);
    window.addEventListener(VOID_EVENT, load);
    return () => {
      window.removeEventListener(ACTIVITY_EVENT, load);
      window.removeEventListener(VOID_EVENT, load);
    };
  }, []);

  const rows = useMemo(() => {
    if (!today) return [];
    const all: ActEntry[] = [
      ...entries,
      ...voids.map((v) => ({
        id: `void-${v.id}`,
        at: v.at,
        type: "cancel",
        text: `Bill ${v.invoiceNo} cancelled (${cur}${v.total.toFixed(2)}, ${v.paymentMethod}): ${v.reason}`,
        by: v.by || "unknown",
      })),
    ];
    const from = period === "all" ? "" : period === "today" ? today : shiftDays(today, period === "7" ? -6 : -29);
    const types = GROUPS.find((g) => g.id === group)?.types ?? [];
    const q = query.trim().toLowerCase();
    const out = all.filter((e) => {
      const d = dateOf(e.at);
      if (from && (d === "" || d < from)) return false;
      if (types.length > 0 && !types.includes(e.type)) return false;
      if (q && !(e.text.toLowerCase().includes(q) || e.by.toLowerCase().includes(q))) return false;
      return true;
    });
    out.sort((a, b) => b.at.localeCompare(a.at));
    return out;
  }, [entries, voids, today, period, group, query, cur]);

  function onCsv() {
    if (rows.length === 0) {
      setMsg("Nothing to download for this filter.");
      return;
    }
    const head = ["time", "type", "what", "by"];
    const body = [...rows].reverse().map((e) => [e.at, e.type, e.text, e.by]);
    const csv = [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-activity-${localToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg(`${rows.length} line(s) downloaded.`);
    } catch {
      setMsg("The download did not work here.");
    }
  }

  if (!isOwner) {
    return <p className="p-4 text-sm">The activity log is for the owner only.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Activity log</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        What was done on this phone and by whom (the login that was signed in at that time). It starts from the day it
        was switched on. Excise and Bank entries, hand corrections of litres and deleting customers or beers are not
        in it. The log is kept on this phone only, so download the CSV now and then.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Period</span>
          <select className={`${input} w-full`} value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Show</span>
          <select className={`${input} w-full`} value={group} onChange={(e) => setGroup(e.target.value)}>
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Search (what or who)</span>
          <input className={`${input} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <button className="underline text-sm" onClick={onCsv}>
        Download this list (CSV)
      </button>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, SHOW_MAX).map((e) => (
            <div key={e.id} className="rounded-md border p-3 text-sm space-y-1">
              <p>{e.text}</p>
              <p className="text-muted-foreground">
                {whenLong(e.at)} | {e.by || "unknown"}
              </p>
            </div>
          ))}
          {rows.length > SHOW_MAX && (
            <p className="text-xs text-muted-foreground">{rows.length - SHOW_MAX} older lines not shown. Narrow the filter.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActivityLogView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
