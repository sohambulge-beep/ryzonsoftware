import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import { CLOUD_KEY, CLOUD_URL, keyLooksSecret, keyLooksUnset, loginToEmail } from "../lib/cloudConfig";
import { getCloudClient } from "../lib/adminCheck";
import { GATE_ENABLED } from "../lib/gateConfig";
import { PROVIDER_PHONE } from "../lib/providerConfig";

const SESSION_KEY = "pt-cloud-backup-auth";
const LS_URL = "pt_cloud_url";
const LS_KEY = "pt_cloud_key";
const LS_EMAIL = "pt_cloud_email";
const OK_KEY = "pt_gate_ok_at";
const ON_KEY = "pt_gate_on";
const MAX_OFFLINE_MS = 14 * 24 * 60 * 60 * 1000;
const RECHECK_MS = 10 * 60 * 1000;

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

type Status = "open" | "checking" | "gate";

// Is the gate on for this device? (?nogate=1 only works while the gate is off for everybody.)
function gateEnabled(): boolean {
  if (GATE_ENABLED) return true;
  try {
    const q = window.location.search;
    if (q.includes("nogate=1")) {
      localStorage.removeItem(ON_KEY);
      return false;
    }
    if (q.includes("gate=1")) localStorage.setItem(ON_KEY, "1");
    return localStorage.getItem(ON_KEY) === "1";
  } catch {
    return false;
  }
}

// Pages anyone may read without signing in.
function isPublicPath(): boolean {
  try {
    const p = window.location.pathname.replace(/\/+$/, "");
    return p === "/terms" || p === "/privacy";
  } catch {
    return false;
  }
}

// A sign-in saved on this phone, read without internet.
function storedUser(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const p = raw ? JSON.parse(raw) : null;
    const id = p?.user?.id ?? p?.currentSession?.user?.id;
    return typeof id === "string" && id !== "";
  } catch {
    return false;
  }
}

async function verify(): Promise<"open" | "gate"> {
  if (!gateEnabled()) return "open";
  if (isPublicPath()) return "open";
  // A setup mistake must never lock everybody out.
  if (keyLooksUnset() || keyLooksSecret()) return "open";
  try {
    localStorage.setItem(LS_URL, CLOUD_URL);
    localStorage.setItem(LS_KEY, CLOUD_KEY);
  } catch {
    // ignore
  }
  if (!storedUser()) return "gate";

  let okAt = 0;
  try {
    okAt = Number(localStorage.getItem(OK_KEY) || 0);
  } catch {
    okAt = 0;
  }
  const fresh = Date.now() - okAt < MAX_OFFLINE_MS;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) return fresh ? "open" : "gate";

  const c = getCloudClient();
  if (!c) return fresh ? "open" : "gate";
  try {
    const { data, error } = await c.auth.getUser();
    if (data?.user && !error) {
      try {
        localStorage.setItem(OK_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      return "open";
    }
    const code = Number((error as any)?.status ?? 0);
    if (code >= 400 && code < 500) {
      // The server clearly says this sign-in is no longer valid (for example the customer was removed).
      try {
        await c.auth.signOut({ scope: "local" });
      } catch {
        // ignore
      }
      return "gate";
    }
    return fresh ? "open" : "gate"; // the server could not be reached
  } catch {
    return fresh ? "open" : "gate";
  }
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
  const [status, setStatus] = useState<Status>("open");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  const recheck = useCallback(async () => {
    const next = await verify();
    if (aliveRef.current) setStatus(next);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!gateEnabled() || isPublicPath()) {
      return () => {
        aliveRef.current = false;
      };
    }
    setStatus("checking");
    recheck();
    const every = setInterval(recheck, RECHECK_MS);
    const onOnline = () => {
      setTimeout(recheck, 2000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      aliveRef.current = false;
      clearInterval(every);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [recheck]);

  async function onSignIn() {
    const mail = loginToEmail(username);
    if (!mail) {
      setMsg("Enter your username (3 to 30 letters or numbers) or your email");
      return;
    }
    if (!password) {
      setMsg("Enter your password");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setMsg("Internet is needed for the first sign-in on this phone.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      localStorage.setItem(LS_URL, CLOUD_URL);
      localStorage.setItem(LS_KEY, CLOUD_KEY);
      const c = createClient(CLOUD_URL.trim(), CLOUD_KEY.trim(), {
        auth: { storageKey: SESSION_KEY, persistSession: true, autoRefreshToken: true },
      });
      const { error } = await c.auth.signInWithPassword({ email: mail, password });
      if (error) throw new Error(error.message);
      try {
        localStorage.setItem(LS_EMAIL, mail);
        localStorage.setItem(OK_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      setPassword("");
      setStatus("open");
    } catch (e: any) {
      const text = String(e?.message ?? e);
      setMsg(text.includes("Invalid login credentials") ? "Wrong username or password." : `Could not sign in: ${text}`);
    }
    setBusy(false);
  }

  if (status === "open") return null;
  if (status === "checking") {
    return <div className="fixed inset-0 bg-background" style={{ zIndex: 110 }} />;
  }

  const digits = PROVIDER_PHONE.replace(/\D/g, "");
  const wa =
    digits.length >= 10
      ? `https://wa.me/${digits}?text=${encodeURIComponent("Hello, I need help to sign in to Prime Terminal.")}`
      : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      className="fixed inset-0 overflow-y-auto bg-background text-foreground"
      style={{ zIndex: 110 }}
    >
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold">Sign in to TapTrack</h1>
        <p className="text-sm text-muted-foreground">
          Use the username and password given to you. The first sign-in on a phone needs internet.
        </p>
        {msg && <p className="rounded-md border p-2 text-sm">{msg}</p>}
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Username (or email)</span>
          <input
            className={`${input} w-full`}
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Password</span>
          <input
            type="password"
            className={`${input} w-full`}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) onSignIn();
            }}
          />
        </label>
        <button className={btn} disabled={busy} onClick={onSignIn}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
        {wa && (
          <a className="text-center text-sm underline" href={wa} target="_blank" rel="noopener noreferrer">
            Forgot your password? Contact on WhatsApp
          </a>
        )}
        <p className="text-center text-xs text-muted-foreground">
          <a className="underline" href="/terms">
            Terms
          </a>{" "}
          |{" "}
          <a className="underline" href="/privacy">
            Privacy
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginGate() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
