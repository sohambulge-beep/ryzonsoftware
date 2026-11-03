import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCloudClient } from "../lib/adminCheck";
import { loadState } from "../data";
import { PROVIDER_PHONE } from "../lib/providerConfig";
import FreshStart from "./FreshStart";
import OfflineQueue from "./OfflineQueue";
import EventSync from "./EventSync";
import PwaSetup from "./PwaSetup";

const GRACE_DAYS = 7; // the app keeps working this many days after the plan ends
const WARN_DAYS = 7; // a yellow reminder this many days before the plan ends
const FIRST_MS = 4000;
const EVERY_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 30000;
const CACHE_KEY = "pt_plan_state";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_KEY = "pt-cloud-backup-auth";

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

interface Banner {
  text: string;
  red: boolean;
}
interface Lock {
  title: string;
  text: string;
}
interface PlanState {
  banner: Banner | null;
  lock: Lock | null;
}
interface Cached extends PlanState {
  uid: string;
  at: number;
}

const EMPTY: PlanState = { banner: null, lock: null };

// The login saved on this phone, read without internet.
function cachedUid(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const p = raw ? JSON.parse(raw) : null;
    const id = p?.user?.id ?? p?.currentSession?.user?.id;
    return typeof id === "string" ? id : "";
  } catch {
    return "";
  }
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || typeof p.uid !== "string" || typeof p.at !== "number") return null;
    const lock =
      p.lock && typeof p.lock.title === "string" && typeof p.lock.text === "string"
        ? { title: p.lock.title, text: p.lock.text }
        : null;
    const banner = p.banner && typeof p.banner.text === "string" ? { text: p.banner.text, red: !!p.banner.red } : null;
    return { uid: p.uid, at: p.at, banner, lock };
  } catch {
    return null;
  }
}

function writeCache(uid: string, state: PlanState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, at: Date.now(), ...state }));
  } catch {
    // ignore
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

function stateFor(row: any, today: string): PlanState {
  if (row.active === false) {
    return {
      banner: null,
      lock: {
        title: "Your account is paused",
        text: "Your Prime Terminal account has been paused by the provider. Please contact the provider to continue. Your data is safe and you can download it below.",
      },
    };
  }
  if (!row.paid_until) return EMPTY; // no date set yet: never lock
  const diff = daysBetween(today, String(row.paid_until));
  if (diff < -GRACE_DAYS) {
    return {
      banner: null,
      lock: {
        title: "Your plan has ended",
        text: `Your plan ended ${-diff} days ago (${row.paid_until}). Please renew to continue. Your data is safe and you can download it below.`,
      },
    };
  }
  if (diff < 0) {
    const left = GRACE_DAYS + diff;
    return {
      banner: {
        red: true,
        text: `Your plan ended ${-diff} day(s) ago (${row.paid_until}). Please renew. ${
          left <= 0 ? "The app will pause tomorrow." : `The app will pause in ${left} day(s).`
        }`,
      },
      lock: null,
    };
  }
  if (diff <= WARN_DAYS) {
    return {
      banner: {
        red: false,
        text:
          diff === 0
            ? `Your plan ends today (${row.paid_until}). Please renew.`
            : `Your plan ends in ${diff} day(s) (${row.paid_until}). Please renew.`,
      },
      lock: null,
    };
  }
  return EMPTY;
}

// Returns null when nobody is signed in. Throws when the server cannot be asked (no lock is applied then).
async function compute(c: SupabaseClient): Promise<{ uid: string; state: PlanState } | null> {
  const { data: s } = await c.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return null;
  const { data, error } = await c
    .from("businesses")
    .select("business_name, paid_until, active")
    .eq("user_id", uid)
    .limit(1);
  if (error) throw new Error(error.message);
  const row: any = (data ?? [])[0];
  if (!row) return { uid, state: EMPTY }; // an admin or a login without a business: never locked
  return { uid, state: stateFor(row, localDate()) };
}

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Inner() {
  const [state, setState] = useState<PlanState>(EMPTY);
  const [hidden, setHidden] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const busyRef = useRef(false);
  const lastRunRef = useRef(0);

  const run = useCallback(async (force: boolean) => {
    if (busyRef.current) return;
    if (!force && Date.now() - lastRunRef.current < MIN_GAP_MS) return;
    busyRef.current = true;
    lastRunRef.current = Date.now();
    if (force) {
      setChecking(true);
      setMsg("");
    }
    try {
      const c = getCloudClient();
      if (!c) {
        setState(EMPTY); // My account was never used on this phone
        return;
      }
      const r = await compute(c);
      if (r) {
        setState(r.state);
        writeCache(r.uid, r.state);
        if (force) setMsg(r.state.lock ? "The plan is still not renewed." : "Done. The app is open.");
      } else if (typeof navigator !== "undefined" && navigator.onLine !== false) {
        setState(EMPTY); // online and not signed in
        clearCache();
      }
    } catch {
      // The server could not be asked: keep what was last known and do not lock because of an error.
      if (force) setMsg("Could not check right now. Please try again with internet.");
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCache();
    if (cached && cached.uid === cachedUid() && Date.now() - cached.at < CACHE_MAX_AGE_MS) {
      setState({ banner: cached.banner, lock: cached.lock });
    }
    const first = setTimeout(() => run(false), FIRST_MS);
    const every = setInterval(() => run(false), EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") run(false);
    };
    const onOnline = () => {
      setTimeout(() => run(true), 2000);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [run]);

  function downloadData() {
    try {
      const json = JSON.stringify(loadState(), null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-my-data-${localDate()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg("Your data file was downloaded.");
    } catch {
      setMsg("The download did not work here.");
    }
  }

  if (state.lock) {
    const digits = PROVIDER_PHONE.replace(/\D/g, "");
    const wa =
      digits.length >= 10
        ? `https://wa.me/${digits}?text=${encodeURIComponent("Hello, I want to renew my Prime Terminal plan.")}`
        : "";
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={state.lock.title}
        className="fixed inset-0 overflow-y-auto bg-background text-foreground"
        style={{ zIndex: 100 }}
      >
        <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">{state.lock.title}</h1>
          <p className="text-sm">{state.lock.text}</p>
          {msg && <p className="rounded-md border p-2 text-sm">{msg}</p>}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              disabled={checking}
              onClick={() => run(true)}
            >
              {checking ? "Checking..." : "I have paid, check again"}
            </button>
            {wa && (
              <a className="underline text-sm" href={wa} target="_blank" rel="noopener noreferrer">
                Contact on WhatsApp
              </a>
            )}
          </div>
          <button className="underline text-sm" onClick={downloadData}>
            Download my data (backup file)
          </button>
        </div>
      </div>
    );
  }

  if (!state.banner || hidden) return null;
  return (
    <div className="fixed top-2 left-2 right-2 z-50 mx-auto flex max-w-md items-start gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <span
        style={{
          width: 8,
          height: 8,
          marginTop: 4,
          borderRadius: 9999,
          backgroundColor: state.banner.red ? "#ef4444" : "#f59e0b",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span className="grow">{state.banner.text}</span>
      <button className="underline" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}

export default function PlanBanner() {
  return (
    <>
      <FreshStart />
      <OfflineQueue />
      <EventSync />
      <PwaSetup />
      <Guard>
        <Inner />
      </Guard>
    </>
  );
}
