import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";

const input = "rounded-md border px-3 py-2 text-sm bg-background";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">The rush hours page could not open here.</p>;
    return this.props.children;
  }
}

function Bar({ value, max }: { value: number; max: number }) {
  if (value <= 0) return <div style={{ height: 8 }} />;
  const w = Math.max(2, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div
      aria-hidden="true"
      style={{ width: `${w}%`, height: 8, borderRadius: 9999, background: "linear-gradient(90deg,#f59e0b,#fbbf24)" }}
    />
  );
}

function Inner() {
  const { db } = useStore();
  const [range, setRange] = useState("30");
  const [metric, setMetric] = useState<"bills" | "sales">("bills");
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(localToday());
  }, []);

  const model = useMemo(() => {
    if (!today) return null;
    const invoices: any[] = Array.isArray((db as any)?.invoices) ? (db as any).invoices : [];
    const days = range === "all" ? 0 : Number(range);
    const from = days > 0 ? shiftDays(today, -(days - 1)) : "";

    const hourBills: number[] = new Array(24).fill(0);
    const hourSalesP: number[] = new Array(24).fill(0);
    const dayBills: number[] = new Array(7).fill(0);
    const daySalesP: number[] = new Array(7).fill(0);
    let total = 0;
    let earliest = "";

    for (const inv of invoices) {
      const d = dateOf(String(inv?.timestamp ?? ""));
      if (!d) continue;
      if (from && d < from) continue;
      if (d > today) continue;
      const t = new Date(String(inv.timestamp));
      const h = t.getHours();
      const wd = t.getDay();
      hourBills[h] += 1;
      hourSalesP[h] += paise(inv?.total);
      dayBills[wd] += 1;
      daySalesP[wd] += paise(inv?.total);
      total += 1;
      if (!earliest || d < earliest) earliest = d;
    }

    // How many times each weekday happened in the period, so busy days can be compared fairly.
    const occ: number[] = new Array(7).fill(0);
    const start = from || earliest;
    if (start) {
      let d = start;
      let guard = 0;
      while (d <= today && guard < 4000) {
        const [y, m, dd] = d.split("-").map(Number);
        occ[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] += 1;
        d = shiftDays(d, 1);
        guard += 1;
      }
    }
    return { hourBills, hourSalesP, dayBills, daySalesP, occ, total };
  }, [db, today, range]);

  if (!model) return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;

  const hourVal = (h: number) => (metric === "bills" ? model.hourBills[h] : model.hourSalesP[h]);
  const dayVal = (d: number) => {
    const raw = metric === "bills" ? model.dayBills[d] : model.daySalesP[d];
    return model.occ[d] > 0 ? raw / model.occ[d] : 0;
  };
  const show = (v: number) => (metric === "bills" ? String(Math.round(v * 10) / 10) : inr(Math.round(v)));

  const hourMax = Math.max(1, ...HOURS.map(hourVal));
  const dayMax = Math.max(1, ...DAYS.map((_, d) => dayVal(d)));

  const topHours = HOURS.filter((h) => hourVal(h) > 0)
    .sort((a, b) => hourVal(b) - hourVal(a) || a - b)
    .slice(0, 3);
  const topDay = DAYS.map((_, d) => d)
    .filter((d) => dayVal(d) > 0)
    .sort((a, b) => dayVal(b) - dayVal(a) || a - b)[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Rush hours</h1>

      <p className="text-sm text-muted-foreground">
        Shows when your POS bills happen, by hour and by day of the week, using the time of each bill on this phone.
        Liquor counter sales are not included.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
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
          <span className="text-sm text-muted-foreground">Measure by</span>
          <select
            className={`${input} w-full`}
            value={metric}
            onChange={(e) => setMetric(e.target.value === "sales" ? "sales" : "bills")}
          >
            <option value="bills">Number of bills</option>
            <option value="sales">Sales amount</option>
          </select>
        </label>
      </div>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p>{model.total} bill(s) in this period</p>
        {model.total === 0 ? (
          <p className="text-muted-foreground">No bills in this period.</p>
        ) : (
          <>
            <p className="font-medium">Busiest hours: {topHours.map(hourLabel).join(", ")}</p>
            {topDay !== undefined && <p className="font-medium">Busiest day: {DAYS[topDay]}</p>}
          </>
        )}
      </section>

      {model.total > 0 && (
        <>
          <section className="space-y-2">
            <h2 className="font-medium">By hour (total in the period)</h2>
            {HOURS.map((h) => (
              <div key={h} className="text-sm">
                <div className="flex justify-between">
                  <span>{hourLabel(h)}</span>
                  <span className="text-muted-foreground">{hourVal(h) > 0 ? show(hourVal(h)) : "-"}</span>
                </div>
                <Bar value={hourVal(h)} max={hourMax} />
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">By day of the week (average per day)</h2>
            {DAYS.map((name, d) => (
              <div key={name} className="text-sm">
                <div className="flex justify-between">
                  <span>{name}</span>
                  <span className="text-muted-foreground">{dayVal(d) > 0 ? show(dayVal(d)) : "-"}</span>
                </div>
                <Bar value={dayVal(d)} max={dayMax} />
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export default function RushHoursView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
