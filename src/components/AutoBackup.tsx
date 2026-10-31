import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadState } from "../data";
import PremiumTheme from "./PremiumTheme";
import BillSync from "./BillSync";
import StockSync from "./StockSync";

const LS_URL = "pt_cloud_url";
const LS_KEY = "pt_cloud_key";
const LAST_HASH = "pt_auto_last_hash";
const LAST_AT = "pt_auto_last_at";
const PEND_ID = "pt_auto_pending_id";
const PEND_HASH = "pt_auto_pending_hash";
const LOCK = "pt_auto_lock";
const MIN_GAP_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 20000;
const EVERY_MS = 5 * 60 * 1000;
const ONLINE_DELAY_MS = 3000;
const MAX_BYTES = 4000000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

let cached: { sig: string; client: SupabaseClient } | null = null;

function getClient(url: string, key: string): SupabaseClient {
  const sig = `${url}|${key}`;
  if (cached && cached.sig === sig) return cached.client;
  const client = createClient(url.trim(), key.trim(), {
    auth: { storageKey: "pt-cloud-backup-auth", persistSession: true, autoRefreshToken: true },
  });
  cached = { sig, client };
  return client;
}

// Small fingerprint of the data, used only to tell whether anything changed.
function hashOf(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// A fixed id per backup attempt, so a retry can never create a second copy.
function newId(): string {
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function stamp(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Status = "idle" | "syncing" | "synced" | "failed";

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
  const [online, setOnline] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [lastAt, setLastAt] = useState(0);
  const [hidden, setHidden] = useState(false);
  const busyRef = useRef(false);
  const failuresRef = useRef(0);
  const nextAllowedRef = useRef(0);

  const run = useCallback(async (force: boolean) => {
    if (busyRef.current) return;
    let started = false;
    try {
      const url = localStorage.getItem(LS_URL);
      const key = localStorage.getItem(LS_KEY);
      if (!url || !key) {
        setConfigured(false);
        return; // cloud backup was never set up, so there is nothing to do
      }
      setConfigured(true);
      if (!force && Date.now() < nextAllowedRef.current) return; // waiting after a failure

      const lock = Number(localStorage.getItem(LOCK) || 0);
      if (Date.now() - lock < 120000) return; // another tab is already doing it

      const db = loadState();
      const json = JSON.stringify(db);
      const hash = hashOf(json);

      let pendId = localStorage.getItem(PEND_ID);
      const pendHash = localStorage.getItem(PEND_HASH);
      if (pendId && pendHash !== hash) {
        // The data changed after the waiting backup was made: the newest data replaces it.
        pendId = null;
        localStorage.removeItem(PEND_ID);
        localStorage.removeItem(PEND_HASH);
      }

      if (!pendId && hash === localStorage.getItem(LAST_HASH)) {
        setPending(false);
        setStatus("synced");
        setMessage(force ? "already up to date" : "");
        return;
      }

      const last = Number(localStorage.getItem(LAST_AT) || 0);
      if (!pendId && !force && last && Date.now() - last < MIN_GAP_MS) return; // too soon, wait

      const bytes = new Blob([json]).size;
      if (bytes > MAX_BYTES) {
        setStatus("failed");
        setMessage(`the data is too big (${Math.round(bytes / 1024)} KB) for automatic backup`);
        return;
      }

      if (!pendId) pendId = newId();
      localStorage.setItem(PEND_ID, pendId);
      localStorage.setItem(PEND_HASH, hash);
      setPending(true);

      if (typeof navigator !== "undefined" && navigator.onLine === false) return; // stays waiting

      started = true;
      busyRef.current = true;
      localStorage.setItem(LOCK, String(Date.now()));
      setStatus("syncing");
      setMessage("");

      const client = getClient(url, key);
      const { data: s } = await client.auth.getSession();
      if (!s.session) throw new Error("you are not signed in (open Excise, Cloud backup, and sign in)");

      const summary = {
        taps: db.taps.length,
        customers: db.customers.length,
        invoices: db.invoices.length,
        expenses: db.expenses.length,
        size_kb: Math.round(bytes / 1024),
        hash,
      };
      const { error } = await client
        .from("app_backups")
        .insert({ id: pendId, label: "auto", summary, data: db });
      // 23505 means this exact backup was already saved earlier (a reply was lost), which is fine.
      if (error && (error as any).code !== "23505") throw new Error(error.message);

      const now = Date.now();
      localStorage.setItem(LAST_HASH, hash);
      localStorage.setItem(LAST_AT, String(now));
      localStorage.removeItem(PEND_ID);
      localStorage.removeItem(PEND_HASH);
      failuresRef.current = 0;
      nextAllowedRef.current = 0;
      setLastAt(now);
      setPending(false);
      setStatus("synced");
      setMessage("");
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
          localStorage.removeItem(LOCK);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    try {
      setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
      const t = Number(localStorage.getItem(LAST_AT) || 0);
      if (t) setLastAt(t);
      setPending(!!localStorage.getItem(PEND_ID));
      setConfigured(!!(localStorage.getItem(LS_URL) && localStorage.getItem(LS_KEY)));
    } catch {
      // storage can be blocked; the pill just stays hidden
    }

    const first = setTimeout(() => run(false), FIRST_CHECK_MS);
    const every = setInterval(() => run(false), EVERY_MS);
    let onlineTimer: ReturnType<typeof setTimeout> | undefined;
    const goOnline = () => {
      setOnline(true);
      if (onlineTimer) clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => {
        nextAllowedRef.current = 0;
        run(false);
      }, ONLINE_DELAY_MS);
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") run(false);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      if (onlineTimer) clearTimeout(onlineTimer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run]);

  const renderPill = (): ReactNode => {
    if (online === null || hidden) return null;

    let text = "";
    let color = "#22c55e";
    if (online === false) {
      color = "#f59e0b";
      text = pending
        ? "Offline: 1 backup waiting. POS data stays on this phone."
        : "Offline: POS data stays on this phone.";
    } else if (!configured) {
      return null;
    } else if (status === "syncing") {
      color = "#3b82f6";
      text = "Syncing...";
    } else if (status === "failed") {
      color = "#ef4444";
      text = `Sync failed: ${message}. Will retry.`;
    } else if (pending) {
      color = "#f59e0b";
      text = "1 backup waiting to sync.";
    } else {
      text = lastAt ? `Synced ${stamp(lastAt)}` : "Cloud backup is on.";
      if (message) text += ` (${message})`;
    }

    return (
      <div className="fixed bottom-24 left-2 z-50 flex max-w-xs flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
        <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: color, display: "inline-block" }} />
        <span>{text}</span>
        {online !== false && status !== "syncing" && (
          <button className="underline" onClick={() => run(true)}>
            Sync now
          </button>
        )}
        <button className="underline" onClick={() => setHidden(true)}>
          Hide
        </button>
      </div>
    );
  };

  return (
    <>
      <PremiumTheme />
      <BillSync />
      <StockSync />
      {renderPill()}
    </>
  );
}

export default function AutoBackup() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
