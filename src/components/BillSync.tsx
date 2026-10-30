import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { loadState } from "../data";
import { getCloudClient } from "../lib/adminCheck";

const MAP_PREFIX = "pt_bill_sync_map:";
const LOCK_KEY = "pt_bill_sync_lock";
const BATCH = 40;
const FIRST_MS = 15000;
const EVERY_MS = 60000;
const ONLINE_DELAY_MS = 3000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
const MAX_BILL_CHARS = 200000;
const OK_SHOW_MS = 8000;

type SyncMap = Record<string, string>;
type Status = "idle" | "syncing" | "failed";
interface Prepared {
  key: string;
  hash: string;
  row: Record<string, any>;
}

// Small fingerprint of a bill, used only to tell whether it changed since the last upload.
function hashOf(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

const money = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(n * 100) / 100;
  return Math.max(-999999999999, Math.min(999999999999, r));
};

// Turns one POS bill into a cloud row. Returns null for a bill that cannot be saved safely.
function prepare(inv: any): Prepared | null {
  if (!inv || typeof inv !== "object") return null;
  const ts = String(inv.timestamp ?? "");
  const t = new Date(ts);
  if (!ts || Number.isNaN(t.getTime())) return null;
  let json = "";
  try {
    json = JSON.stringify(inv);
  } catch {
    return null;
  }
  if (json.length > MAX_BILL_CHARS) return null;
  const no = String(inv.invoiceNo ?? "").slice(0, 60);
  const key = `${no}|${ts}`.slice(0, 160);
  return {
    key,
    hash: hashOf(json),
    row: {
      bill_key: key,
      invoice_no: no,
      billed_at: t.toISOString(),
      customer_name: String(inv.customerName ?? "").slice(0, 100),
      payment_method: String(inv.paymentMethod ?? "").slice(0, 30),
      status: String(inv.status ?? "").slice(0, 30),
      total: money(inv.total),
      tax: money(inv.tax),
      paid_amount: money(inv.paidAmount),
      balance_due: money(inv.balanceDue),
      items: Array.isArray(inv.items) ? inv.items : [],
      data: inv,
    },
  };
}

// What was already saved is remembered per signed-in user, so two logins on one phone never mix.
function readMap(uid: string): SyncMap {
  try {
    const raw = localStorage.getItem(MAP_PREFIX + uid);
    const p = raw ? JSON.parse(raw) : {};
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out: SyncMap = {};
    for (const [k, v] of Object.entries<any>(p)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function writeMap(uid: string, map: SyncMap) {
  try {
    localStorage.setItem(MAP_PREFIX + uid, JSON.stringify(map));
  } catch {
    // storage can be blocked; bills may be sent again, which is harmless
  }
}

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Inner() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [okVisible, setOkVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const busyRef = useRef(false);
  const failuresRef = useRef(0);
  const nextAllowedRef = useRef(0);
  const okTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (force: boolean) => {
    if (busyRef.current) return;
    let started = false;
    try {
      const c = getCloudClient();
      if (!c) return; // cloud backup was never set up on this phone
      if (!force && Date.now() < nextAllowedRef.current) return; // waiting after a failure
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const lock = Number(localStorage.getItem(LOCK_KEY) || 0);
      if (Date.now() - lock < 90000) return; // another tab is already doing it

      started = true;
      busyRef.current = true;
      localStorage.setItem(LOCK_KEY, String(Date.now()));

      const { data: s } = await c.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return; // not signed in; nothing can be saved

      const db: any = loadState();
      const invoices: any[] = Array.isArray(db?.invoices) ? db.invoices : [];
      const prepared: Prepared[] = [];
      let skip = 0;
      for (const inv of invoices) {
        const p = prepare(inv);
        if (p) prepared.push(p);
        else skip += 1;
      }
      setSkipped(skip);

      const map = readMap(uid);
      const todo = prepared.filter((p) => map[p.key] !== p.hash);
      if (todo.length === 0) {
        const keep = new Set(prepared.map((p) => p.key));
        for (const k of Object.keys(map)) if (!keep.has(k)) delete map[k];
        writeMap(uid, map);
        setPending(0);
        setStatus((prev) => (prev === "idle" ? prev : "idle"));
        return;
      }

      setPending(todo.length);
      setStatus("syncing");
      setMessage("");

      let done = 0;
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        const rows = batch.map((p) => ({ ...p.row, user_id: uid }));
        const { error } = await c.from("pos_bills").upsert(rows, { onConflict: "user_id,bill_key" });
        if (error) throw new Error(error.message);
        for (const p of batch) map[p.key] = p.hash;
        writeMap(uid, map);
        done += batch.length;
        setPending(todo.length - done);
        localStorage.setItem(LOCK_KEY, String(Date.now()));
      }

      const keep = new Set(prepared.map((p) => p.key));
      for (const k of Object.keys(map)) if (!keep.has(k)) delete map[k];
      writeMap(uid, map);

      failuresRef.current = 0;
      nextAllowedRef.current = 0;
      setSaved(prepared.length);
      setPending(0);
      setStatus("idle");
      setOkVisible(true);
      if (okTimerRef.current) clearTimeout(okTimerRef.current);
      okTimerRef.current = setTimeout(() => setOkVisible(false), OK_SHOW_MS);
    } catch (e: any) {
      failuresRef.current += 1;
      const wait = Math.min(MAX_BACKOFF_MS, 60000 * 2 ** (failuresRef.current - 1));
      nextAllowedRef.current = Date.now() + wait;
      setStatus("failed");
      setMessage(e?.message ?? String(e));
    } finally {
      if (started) {
        busyRef.current = false;
        try {
          localStorage.removeItem(LOCK_KEY);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => run(false), FIRST_MS);
    const every = setInterval(() => run(false), EVERY_MS);
    let onlineTimer: ReturnType<typeof setTimeout> | undefined;
    const goOnline = () => {
      if (onlineTimer) clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => {
        nextAllowedRef.current = 0;
        run(false);
      }, ONLINE_DELAY_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run(false);
    };
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      if (onlineTimer) clearTimeout(onlineTimer);
      if (okTimerRef.current) clearTimeout(okTimerRef.current);
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run]);

  if (hidden) return null;

  let text = "";
  let color = "#22c55e";
  if (status === "syncing") {
    color = "#3b82f6";
    text = `Saving bills to the cloud (${pending} left)...`;
  } else if (status === "failed") {
    color = "#ef4444";
    text = `Bills not saved to the cloud: ${message}. Will retry.`;
  } else if (pending > 0) {
    color = "#f59e0b";
    text = `${pending} bill(s) waiting to be saved to the cloud.`;
  } else if (okVisible) {
    text = `${saved} bill(s) saved in the cloud.${skipped > 0 ? ` ${skipped} skipped (bad date or too big).` : ""}`;
  } else {
    return null;
  }

  return (
    <div className="fixed bottom-40 left-2 z-50 flex max-w-xs flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: color, display: "inline-block" }} />
      <span>{text}</span>
      {status !== "syncing" && (
        <button className="underline" onClick={() => run(true)}>
          Sync now
        </button>
      )}
      <button className="underline" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}

export default function BillSync() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
