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
interface StockRow {
  item_key: string;
  name: string;
  liters: number;
  price: number;
  cost: number;
  device_id: string;
  updated_at: string;
}
interface CustRow {
  item_key: string;
  name: string;
  phone: string;
  balance: number;
  tab_limit: number;
  device_id: string;
  updated_at: string;
}

const paise = (v: any) => Math.round((Number(v) || 0) * 100);
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Cloud stock could not open here.</p>;
    return this.props.children;
  }
}

type Phase = "loading" | "nokey" | "signin" | "notadmin" | "error" | "ready";

function Inner() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [list, setList] = useState<Biz[]>([]);
  const [selected, setSelected] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [custs, setCusts] = useState<CustRow[]>([]);
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
    loadList();
  }, [loadList]);

  useEffect(() => {
    setStock([]);
    setCusts([]);
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
        const [s, u] = await Promise.all([
          c
            .from("pos_stock")
            .select("item_key, name, liters, price, cost, device_id, updated_at")
            .eq("user_id", biz.user_id as string)
            .order("name")
            .range(0, 999),
          c
            .from("pos_customers")
            .select("item_key, name, phone, balance, tab_limit, device_id, updated_at")
            .eq("user_id", biz.user_id as string)
            .order("name")
            .range(0, 999),
        ]);
        if (id !== reqRef.current) return;
        if (s.error) throw new Error(s.error.message);
        if (u.error) throw new Error(u.error.message);
        setStock((s.data ?? []) as StockRow[]);
        setCusts((u.data ?? []) as CustRow[]);
      } catch (e: any) {
        if (id === reqRef.current) setMsg(`Could not load: ${e.message ?? e}`);
      } finally {
        if (id === reqRef.current) setLoadingData(false);
      }
    })();
  }, [selected, list, reload]);

  const view = useMemo(() => {
    const valueP = stock.reduce((s, r) => s + Math.round((Number(r.liters) || 0) * (Number(r.cost) || 0) * 100), 0);
    const owing = custs
      .filter((c) => paise(c.balance) > 0)
      .sort((a, b) => paise(b.balance) - paise(a.balance));
    const owedP = owing.reduce((s, c) => s + paise(c.balance), 0);
    let last = "";
    for (const r of [...stock, ...custs]) if (r.updated_at > last) last = r.updated_at;
    return { valueP, owing, owedP, last };
  }, [stock, custs]);

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
      <h1 className="text-xl font-semibold">Cloud stock</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Read-only view of the stock (kegs) and customer udhaar a customer's phone has saved to the cloud. Values appear
        about a minute after they change, when the customer is signed in with My account and has internet.
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

      {selected && (
        <button className="underline text-sm" onClick={() => setReload((n) => n + 1)}>
          Refresh
        </button>
      )}
      {loadingData && <p className="text-sm text-muted-foreground">Loading...</p>}

      {selected && !loadingData && stock.length === 0 && custs.length === 0 && (
        <p className="text-sm rounded-md border p-2">
          Nothing saved yet. Check that the customer is signed in with My account on the phone and has internet.
        </p>
      )}

      {(stock.length > 0 || custs.length > 0) && (
        <>
          <section className="rounded-md border p-3 text-sm space-y-1">
            <p>
              {stock.length} tap(s) | Stock value at cost {inr(view.valueP)}
            </p>
            <p>
              {view.owing.length} customer(s) owe money | Total udhaar {inr(view.owedP)}
            </p>
            <p className="text-muted-foreground">Last saved from the phone: {view.last ? when(view.last) : "-"}</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Stock</h2>
            {stock.map((r) => {
              const low = (Number(r.liters) || 0) < 10;
              return (
                <div key={r.item_key} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{r.name || r.item_key}</span>
                    <span className={low ? "font-medium text-destructive" : "font-medium"}>
                      {(Number(r.liters) || 0).toFixed(1)} L
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    Price {inr(paise(r.price))} | Cost per litre {inr(paise(r.cost))} | {when(r.updated_at)}
                  </p>
                </div>
              );
            })}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Customer udhaar</h2>
            {view.owing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody owes money.</p>
            ) : (
              view.owing.map((c) => (
                <div key={c.item_key} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{c.name || c.item_key}</span>
                    <span className="font-medium">{inr(paise(c.balance))}</span>
                  </div>
                  <p className="text-muted-foreground">
                    Limit {inr(paise(c.tab_limit))} | {c.phone || "no phone"} | {when(c.updated_at)}
                  </p>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function AdminStockView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
