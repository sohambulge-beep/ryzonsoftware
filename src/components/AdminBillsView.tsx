import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCloudClient } from "@/lib/adminCheck";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const PAGE = 500;
const SHOW = 100;

interface Biz {
  id: string;
  user_id: string | null;
  business_name: string;
  login_name: string;
}
interface Bill {
  bill_key: string;
  invoice_no: string;
  billed_at: string;
  customer_name: string;
  payment_method: string;
  status: string;
  total: number;
  tax: number;
  paid_amount: number;
  balance_due: number;
  items: any;
  synced_at: string;
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
const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const itemsText = (items: any) => {
  if (!Array.isArray(items) || items.length === 0) return "";
  const head = items
    .slice(0, 3)
    .map((it: any) => `${String(it?.beerName ?? "Item")} x${Number(it?.qty) || 0}`)
    .join(", ");
  return items.length > 3 ? `${head} +${items.length - 3} more` : head;
};

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Cloud bills could not open here.</p>;
    return this.props.children;
  }
}

type Phase = "loading" | "nokey" | "signin" | "notadmin" | "error" | "ready";

function Inner() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [list, setList] = useState<Biz[]>([]);
  const [selected, setSelected] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bills, setBills] = useState<Bill[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingData, setLoadingData] = useState(false);
  const [msg, setMsg] = useState("");
  const [reload, setReload] = useState(0);
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
    setTo(t);
    setFrom(shiftDays(t, -6));
    loadList();
  }, [loadList]);

  useEffect(() => {
    setBills([]);
    setTotalCount(0);
    const biz = list.find((b) => b.id === selected);
    if (!biz || !biz.user_id) {
      reqRef.current++;
      setLoadingData(false);
      return;
    }
    if (from && to && from > to) return;
    const c = getCloudClient();
    if (!c) return;
    const id = ++reqRef.current;
    setLoadingData(true);
    setMsg("");
    (async () => {
      try {
        let q = c
          .from("pos_bills")
          .select(
            "bill_key, invoice_no, billed_at, customer_name, payment_method, status, total, tax, paid_amount, balance_due, items, synced_at",
            { count: "exact" }
          )
          .eq("user_id", biz.user_id as string);
        if (from) q = q.gte("billed_at", new Date(`${from}T00:00:00`).toISOString());
        if (to) q = q.lte("billed_at", new Date(`${to}T23:59:59.999`).toISOString());
        const { data, error, count } = await q.order("billed_at", { ascending: false }).range(0, PAGE - 1);
        if (id !== reqRef.current) return;
        if (error) throw new Error(error.message);
        setBills((data ?? []) as Bill[]);
        setTotalCount(count ?? (data ?? []).length);
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load the bills: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoadingData(false);
      }
    })();
  }, [selected, list, from, to, reload]);

  const view = useMemo(() => {
    const sum = (f: (b: Bill) => any) => bills.reduce((s, b) => s + paise(f(b)), 0);
    const byMethod = new Map<string, { n: number; totalP: number }>();
    let lastSync = "";
    for (const b of bills) {
      const k = b.payment_method || "unknown";
      const cur = byMethod.get(k) ?? { n: 0, totalP: 0 };
      cur.n += 1;
      cur.totalP += paise(b.total);
      byMethod.set(k, cur);
      if (b.synced_at > lastSync) lastSync = b.synced_at;
    }
    return {
      salesP: sum((b) => b.total),
      taxP: sum((b) => b.tax),
      paidP: sum((b) => b.paid_amount),
      dueP: sum((b) => b.balance_due),
      methods: Array.from(byMethod.entries()).sort((a, b) => b[1].totalP - a[1].totalP),
      lastSync,
    };
  }, [bills]);

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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Cloud bills</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Read-only list of the POS bills a customer's phone has saved to the cloud. Bills appear here about a minute
        after they are made, only when the customer is signed in with My account on that phone and has internet.
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

      {selected && (
        <button className="underline text-sm" onClick={() => setReload((n) => n + 1)}>
          Refresh
        </button>
      )}

      {loadingData && <p className="text-sm text-muted-foreground">Loading the bills...</p>}

      {selected && !loadingData && bills.length === 0 && (
        <p className="text-sm rounded-md border p-2">
          No bill in this period. If the customer has made bills, check that they are signed in with My account and
          that the phone has internet.
        </p>
      )}

      {bills.length > 0 && (
        <>
          <section className="rounded-md border p-3 text-sm space-y-1">
            <p className="font-medium">
              {totalCount} bill(s) in this period
              {totalCount > PAGE ? ` (the latest ${PAGE} are counted below, narrow the dates)` : ""}
            </p>
            <p>
              Sales {inr(view.salesP)} (tax {inr(view.taxP)})
            </p>
            <p>
              Collected on bills {inr(view.paidP)} | Still due {inr(view.dueP)}
            </p>
            <p className="text-muted-foreground">Last saved from the phone: {view.lastSync ? when(view.lastSync) : "-"}</p>
          </section>

          <section className="space-y-1 text-sm">
            <h2 className="font-medium">By payment method</h2>
            {view.methods.map(([name, v]) => (
              <p key={name}>
                {name} | {v.n} bill(s) | {inr(v.totalP)}
              </p>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Bills (latest first)</h2>
            {bills.slice(0, SHOW).map((b) => (
              <div key={b.bill_key} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{b.invoice_no || "Bill"}</span>
                  <span className="font-medium">{inr(paise(b.total))}</span>
                </div>
                <p className="text-muted-foreground">
                  {when(b.billed_at)} | {b.customer_name || "Walk-in"} | {b.payment_method || "unknown"} | {b.status}
                </p>
                {itemsText(b.items) && <p>{itemsText(b.items)}</p>}
                {paise(b.balance_due) > 0 && <p className="text-destructive">Due {inr(paise(b.balance_due))}</p>}
              </div>
            ))}
            {bills.length > SHOW && (
              <p className="text-xs text-muted-foreground">{bills.length - SHOW} more bills are counted above but not listed.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function AdminBillsView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
