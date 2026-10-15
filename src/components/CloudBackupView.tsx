import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useStore } from "@/store";
import type { AppData } from "@/types";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const LS_URL = "pt_cloud_url";
const LS_KEY = "pt_cloud_key";
const LS_EMAIL = "pt_cloud_email";
const LS_SAFETY = "pt_before_restore";
const DEFAULT_URL = "https://lkssdcruhunyuqakqcup.supabase.co";
const MAX_BYTES = 4000000;

interface BackupRow {
  id: string;
  label: string;
  created_at: string;
  summary: { taps?: number; customers?: number; invoices?: number; expenses?: number; size_kb?: number } | null;
}

function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url.trim(), key.trim(), {
    auth: { storageKey: "pt-cloud-backup-auth", persistSession: true, autoRefreshToken: true },
  });
}

// Stops a secret key from being used in the app by mistake.
function looksSecret(k: string): boolean {
  const t = k.trim();
  if (t.startsWith("sb_secret_")) return true;
  const p = t.split(".");
  if (p.length === 3) {
    try {
      const json = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/")));
      return json.role === "service_role";
    } catch {
      return false;
    }
  }
  return false;
}

function validAppData(x: any): boolean {
  if (!x || typeof x !== "object") return false;
  const lists = ["taps", "customers", "invoices", "suppliers", "expenses", "purchases", "payments"];
  for (const k of lists) if (!Array.isArray(x[k])) return false;
  return !!x.settings && typeof x.settings === "object";
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <p className="p-4 text-sm">Cloud backup could not open here. Please tell the developer.</p>;
    }
    return this.props.children;
  }
}

function Inner() {
  const { db, restoreData } = useStore();
  const clientRef = useRef<SupabaseClient | null>(null);
  const [url, setUrl] = useState(DEFAULT_URL);
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState("");
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    const { data, error } = await c
      .from("app_backups")
      .select("id, label, created_at, summary")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      setMsg(`Could not load backups: ${error.message}. If it says not authorised, sign in again.`);
      return;
    }
    setBackups((data ?? []) as BackupRow[]);
  }, []);

  useEffect(() => {
    let u = "";
    let k = "";
    try {
      u = localStorage.getItem(LS_URL) ?? "";
      k = localStorage.getItem(LS_KEY) ?? "";
      const e = localStorage.getItem(LS_EMAIL) ?? "";
      if (u) setUrl(u);
      if (k) setKey(k);
      if (e) setEmail(e);
    } catch {
      // storage can be blocked; the fields start empty
    }
    if (k) {
      (async () => {
        try {
          const c = makeClient(u || DEFAULT_URL, k);
          clientRef.current = c;
          const { data } = await c.auth.getSession();
          if (data.session) {
            setSignedIn(data.session.user.email ?? "signed in");
            await loadList();
          }
        } catch {
          // the user can sign in again
        }
      })();
    }
  }, [loadList]);

  async function onSignIn() {
    if (!url.trim() || !key.trim()) {
      setMsg("Enter the project URL and the publishable key");
      return;
    }
    if (looksSecret(key)) {
      setMsg("This is a SECRET key. Do not use it here. Copy the publishable (anon) key instead.");
      return;
    }
    if (!email.trim() || !password) {
      setMsg("Enter the email and password");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const c = makeClient(url, key);
      clientRef.current = c;
      const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message);
      try {
        localStorage.setItem(LS_URL, url.trim());
        localStorage.setItem(LS_KEY, key.trim());
        localStorage.setItem(LS_EMAIL, email.trim());
      } catch {
        // ignore
      }
      setPassword("");
      setSignedIn(email.trim());
      setMsg("Signed in");
      await loadList();
    } catch (e: any) {
      setMsg(`Could not sign in: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onSignOut() {
    try {
      await clientRef.current?.auth.signOut();
    } catch {
      // ignore
    }
    setSignedIn("");
    setBackups([]);
    setMsg("Signed out");
  }

  async function onUpload() {
    const c = clientRef.current;
    if (!c || !signedIn) {
      setMsg("Sign in first");
      return;
    }
    const bytes = new Blob([JSON.stringify(db)]).size;
    if (bytes > MAX_BYTES) {
      setMsg(`Your data is ${Math.round(bytes / 1024)} KB, too big for one cloud backup. Tell the developer.`);
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const summary = {
        taps: db.taps.length,
        customers: db.customers.length,
        invoices: db.invoices.length,
        expenses: db.expenses.length,
        size_kb: Math.round(bytes / 1024),
      };
      const { error } = await c
        .from("app_backups")
        .insert({ label: label.trim().slice(0, 60), summary, data: db });
      if (error) throw new Error(error.message);
      setLabel("");
      setMsg(`Backup saved: ${summary.invoices} bills, ${summary.customers} customers, ${summary.size_kb} KB`);
      await loadList();
    } catch (e: any) {
      setMsg(`Could not save the backup: ${e.message ?? e}. Nothing was changed on this phone.`);
    }
    setBusy(false);
  }

  async function onRestore(row: BackupRow) {
    const c = clientRef.current;
    if (!c || !signedIn) {
      setMsg("Sign in first");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { data, error } = await c.from("app_backups").select("data").eq("id", row.id).single();
      if (error) throw new Error(error.message);
      const incoming = (data as any)?.data;
      if (!validAppData(incoming)) {
        throw new Error("This backup is not in the expected format. Nothing was changed.");
      }
      const ok = confirm(
        `Restore the backup of ${when(row.created_at)}?\n\n` +
          `This backup: ${incoming.invoices.length} bills, ${incoming.customers.length} customers.\n` +
          `This phone now: ${db.invoices.length} bills, ${db.customers.length} customers.\n\n` +
          `The data on this phone will be REPLACED. A safety copy of the current data is kept on this phone first.`
      );
      if (!ok) {
        setBusy(false);
        return;
      }
      try {
        localStorage.setItem(LS_SAFETY, JSON.stringify({ at: new Date().toISOString(), data: db }));
      } catch {
        if (!confirm("A safety copy of the current data could not be kept. Restore anyway?")) {
          setBusy(false);
          return;
        }
      }
      restoreData(incoming as AppData);
      setMsg("Backup restored on this phone.");
    } catch (e: any) {
      setMsg(`Could not restore: ${e.message ?? e}. Nothing was changed on this phone.`);
    }
    setBusy(false);
  }

  async function onDelete(row: BackupRow) {
    const c = clientRef.current;
    if (!c || !signedIn) return;
    if (!confirm(`Delete the backup of ${when(row.created_at)}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { error } = await c.from("app_backups").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      await loadList();
    } catch (e: any) {
      setMsg(`Could not delete: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Cloud backup</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Saves a copy of all POS data (bills, stock, customers, tabs) in your own cloud database. Each backup is a new
        version and old ones are never overwritten. Backups are made only when you press the button, not
        automatically. This is not live sync between phones.
      </p>

      {!signedIn ? (
        <section className="space-y-3">
          <h2 className="font-medium">Connect</h2>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Project URL</span>
            <input className={`${input} w-full`} value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">
              Publishable (anon) key. Never the secret or service_role key.
            </span>
            <input
              className={`${input} w-full`}
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Email</span>
            <input className={`${input} w-full`} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Password</span>
            <input
              type="password"
              className={`${input} w-full`}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className={btn} disabled={busy} onClick={onSignIn}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <p className="text-sm">Signed in as {signedIn}</p>
            <button className="text-sm underline" onClick={onSignOut}>
              Sign out
            </button>
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">Save a backup now</h2>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Note (optional)</span>
              <input
                className={`${input} w-full`}
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="For example: end of day"
              />
            </label>
            <p className="text-sm text-muted-foreground">
              This phone now has {db.invoices.length} bills, {db.customers.length} customers, {db.taps.length} taps.
            </p>
            <button className={btn} disabled={busy} onClick={onUpload}>
              {busy ? "Working..." : "Upload backup now"}
            </button>
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">Saved backups ({backups.length})</h2>
            {backups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No backup saved yet.</p>
            ) : (
              <div className="space-y-2">
                {backups.map((b) => (
                  <div key={b.id} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{when(b.created_at)}</span>
                      <span className="text-muted-foreground">{b.summary?.size_kb ?? "?"} KB</span>
                    </div>
                    {b.label && <p>{b.label}</p>}
                    <p className="text-muted-foreground">
                      {b.summary?.invoices ?? "?"} bills | {b.summary?.customers ?? "?"} customers |{" "}
                      {b.summary?.taps ?? "?"} taps | {b.summary?.expenses ?? "?"} expenses
                    </p>
                    <div className="flex gap-4">
                      <button className="underline" disabled={busy} onClick={() => onRestore(b)}>
                        Restore on this phone
                      </button>
                      <button className="text-destructive" disabled={busy} onClick={() => onDelete(b)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function CloudBackupView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
