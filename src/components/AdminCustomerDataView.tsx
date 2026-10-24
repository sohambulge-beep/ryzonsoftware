import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCloudClient } from "@/lib/adminCheck";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

interface Biz {
  id: string;
  user_id: string | null;
  business_name: string;
  login_name: string;
}
interface Snap {
  created_at: string;
  data: any;
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
const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const validData = (x: any) =>
  !!x &&
  typeof x === "object" &&
  Array.isArray(x.invoices) &&
  Array.isArray(x.customers) &&
  Array.isArray(x.taps) &&
  Array.isArray(x.expenses);

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Customer data could not open here.</p>;
    return this.props.children;
  }
}

type Phase = "loading" | "nokey" | "signin" | "notadmin" | "error" | "ready";

function Inner() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [list, setList] = useState<Biz[]>([]);
  const [selected, setSelected] = useState("");
  const [snap, setSnap] = useState<Snap | null>(null);
  const [noBackup, setNoBackup] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [today, setToday] = useState("");
  const [msg, setMsg] = useState("");
  const reqRef = useRef(0);

  const loadList = useCallback(async () => {
    setMsg("");
    const c = getCloudClient();
    if (!c) {
      setPhase("nokey");
      return;
    }
    try {
      const { data: s } = await c.auth.getSession();
      if (!s.session) {
        setPhase("signin");
        return;
      }
      const { data: adm, error: ae } = await c.rpc("is_admin");
      if (ae) throw new Error(ae.message);
      if (adm !== true) {
        setPhase("notadmin");
        return;
      }
      const { data, error } = await c
        .from("businesses")
        .select("id, user_id, business_name, login_name")
        .order("business_name");
      if (error) throw new Error(error.message);
      setList((data ?? []) as Biz[]);
      setPhase("ready");
    } catch (e: any) {
      setMsg(`Could not load: ${e.message ?? e}`);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    const t = localToday();
    setToday(t);
    setTo(t);
    setFrom(shiftDays(t, -29));
    loadList();
  }, [loadList]);

  useEffect(() => {
    setSnap(null);
    setNoBackup(false);
    const biz = list.find((b) => b.id === selected);
    if (!biz || !biz.user_id) {
      reqRef.current++;
      setLoadingData(false);
      return;
    }
    const c = getCloudClient();
    if (!c) return;
    const id = ++reqRef.current;
    setLoadingData(true);
    setMsg("");
    (async () => {
      try {
        const { data, error } = await c
          .from("app_backups")
          .select("created_at, data")
          .eq("user_id", biz.user_id as string)
          .order("created_at", { ascending: false })
          .limit(1);
        if (id !== reqRef.current) return;
        if (error) throw new Error(error.message);
        const row: any = (data ?? [])[0];
        if (!row) {
          setNoBackup(true);
        } else if (!validData(row.data)) {
          setMsg("The latest backup of this customer is not in the expected format.");
        } else {
          setSnap({ created_at: row.created_at, data: row.data });
        }
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load the backup: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoadingData(false);
      }
    })();
  }, [selected, list]);

  const view = useMemo(() => {
    if (!snap) return null;
    const d = snap.data;
    const inRange = (day: string) => day !== "" && (!from || day >= from) && (!to || day <= to);
    const sum = (arr: any[], f: (x: any) => any) => arr.reduce((s, x) => s + paise(f(x)), 0);

    const bills = d.invoices.filter((i: any) => inRange(dateOf(String(i.timestamp))));
    const expenses = d.expenses.filter((e: any) => inRange(String(e.date ?? "")));
    const payments = (Array.isArray(d.payments) ? d.payments : []).filter((p: any) =>
      inRange(dateOf(String(p.timestamp)))
    );

    const items = new Map<string, { qty: number; totalP: number }>();
    for (const b of bills) {
      for (const it of Array.isArray(b.items) ? b.items : []) {
        const name = String(it.beerName ?? "Unknown");
        const cur = items.get(name) ?? { qty: 0, totalP: 0 };
        cur.qty += Number(it.qty) || 0;
        cur.totalP += paise(it.total);
        items.set(name, cur);
      }
    }
    const top = Array.from(items.entries())
      .sort((a, b) => b[1].totalP - a[1].totalP)
      .slice(0, 5);

    return {
      billCount: bills.length,
      salesP: sum(bills, (b) => b.total),
      taxP: sum(bills, (b) => b.tax),
      collectedP: sum(bills, (b) => b.paidAmount),
      dueP: sum(bills, (b) => b.balanceDue),
      expenseCount: expenses.length,
      expenseP: sum(expenses, (e) => e.amount),
      settledP: sum(payments, (p) => p.amount),
      top,
      recent: [...bills]
        .sort((a: any, b: any) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, 10),
      owing: d.customers
        .filter((c: any) => paise(c.currentBalance) > 0)
        .sort((a: any, b: any) => paise(b.currentBalance) - paise(a.currentBalance))
        .slice(0, 10),
      owingTotalP: d.customers.reduce((s: number, c: any) => s + Math.max(0, paise(c.currentBalance)), 0),
      lowTaps: d.taps
        .filter((t: any) => (Number(t.currentLiters) || 0) < 5)
        .sort((a: any, b: any) => (Number(a.currentLiters) || 0) - (Number(b.currentLiters) || 0)),
    };
  }, [snap, from, to]);

  if (phase === "loading") return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;
  if (phase === "nokey" || phase === "signin") {
    return <p className="p-4 text-sm">Open the Cloud backup tab and sign in with your admin email. Then come back here.</p>;
  }
  if (phase === "notadmin") return <p className="p-4 text-sm">This account is not an admin, so there is nothing to show here.</p>;
  if (phase === "error") {
    return (
      <div className="space-y-3 p-4">
        {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}
        <button className={btn} onClick={loadList}>
          Retry
        </button>
      </div>
    );
  }

  const ageDays = snap && today ? daysBetween(snap.created_at.slice(0, 10), today) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Customer data</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Read-only view of a customer's latest cloud backup. It shows the data as of that backup, not live. Customer
        passwords are never shown.
      </p>

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">Customer</span>
        <select className={`${input} w-full`} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select a customer</option>
          {list.map((b) => (
            <option key={b.id} value={b.id} disabled={!b.user_id}>
              {b.business_name} ({b.login_name}){b.user_id ? "" : " - no login linked"}
            </option>
          ))}
        </select>
      </label>

      {loadingData && <p className="text-sm text-muted-foreground">Loading the backup...</p>}
      {noBackup && <p className="text-sm rounded-md border p-2">This customer has not made any backup yet.</p>}

      {snap && view && (
        <>
          <p className={ageDays > 1 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            Backup of {when(snap.created_at)}
            {ageDays > 1 ? ` (${ageDays} days old, the customer may have newer data)` : ""}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">From date</span>
              <input type="date" className={`${input} w-full`} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">To date</span>
              <input type="date" className={`${input} w-full`} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          {from && to && from > to && <p className="text-sm rounded-md border p-2">From date is after To date.</p>}

          <section className="rounded-md border p-3 text-sm space-y-1">
            <p className="font-medium">This period</p>
            <p>
              {view.billCount} bill(s) | Sales {inr(view.salesP)} (tax {inr(view.taxP)})
            </p>
            <p>
              Collected on bills {inr(view.collectedP)} | Still due on these bills {inr(view.dueP)}
            </p>
            <p>Tab payments received {inr(view.settledP)}</p>
            <p>
              {view.expenseCount} expense(s) | {inr(view.expenseP)}
            </p>
          </section>

          <section className="space-y-1 text-sm">
            <h2 className="font-medium">Top sellers</h2>
            {view.top.length === 0 ? (
              <p className="text-muted-foreground">No sales in this period.</p>
            ) : (
              view.top.map(([name, v]) => (
                <p key={name}>
                  {name} | {v.qty} sold | {inr(v.totalP)}
                </p>
              ))
            )}
          </section>

          <section className="space-y-1 text-sm">
            <h2 className="font-medium">Recent bills</h2>
            {view.recent.length === 0 ? (
              <p className="text-muted-foreground">No bills in this period.</p>
            ) : (
              view.recent.map((b: any, i: number) => (
                <p key={`${b.invoiceNo}-${i}`}>
                  {dateOf(String(b.timestamp))} | {b.invoiceNo} | {b.customerName} | {b.paymentMethod} |{" "}
                  {inr(paise(b.total))} | {b.status}
                </p>
              ))
            )}
          </section>

          <section className="space-y-1 text-sm">
            <h2 className="font-medium">Customers who owe money (now)</h2>
            {view.owing.length === 0 ? (
              <p className="text-muted-foreground">Nobody owes money.</p>
            ) : (
              <>
                {view.owing.map((c: any, i: number) => (
                  <p key={`${c.name}-${i}`}>
                    {c.name} | owes {inr(paise(c.currentBalance))} | limit {inr(paise(c.tabLimit))}
                  </p>
                ))}
                <p className="font-medium">Total owed: {inr(view.owingTotalP)}</p>
              </>
            )}
          </section>

          <section className="space-y-1 text-sm">
            <h2 className="font-medium">Low stock (below 5 litres)</h2>
            {view.lowTaps.length === 0 ? (
              <p className="text-muted-foreground">No tap is below 5 litres.</p>
            ) : (
              view.lowTaps.map((t: any, i: number) => (
                <p key={`${t.name}-${i}`}>
                  {t.name} | {(Math.round((Number(t.currentLiters) || 0) * 10) / 10).toFixed(1)} L left
                </p>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function AdminCustomerDataView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
