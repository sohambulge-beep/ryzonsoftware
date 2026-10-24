import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLOUD_KEY, CLOUD_URL, keyLooksSecret, keyLooksUnset, loginToEmail } from "@/lib/cloudConfig";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const LS_URL = "pt_cloud_url";
const LS_KEY = "pt_cloud_key";
const LS_EMAIL = "pt_cloud_email";

interface Biz {
  business_name: string;
  owner_name: string;
  plan: string;
  price: number;
  paid_until: string | null;
}
interface Pay {
  id: string;
  amount: number;
  paid_on: string;
  method: string;
  reference: string;
}

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
const inr = (n: number) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url.trim(), key.trim(), {
    auth: { storageKey: "pt-cloud-backup-auth", persistSession: true, autoRefreshToken: true },
  });
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">My account could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [biz, setBiz] = useState<Biz | null>(null);
  const [pays, setPays] = useState<Pay[]>([]);
  const [noBiz, setNoBiz] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState("");

  const loadAccount = useCallback(async (c: SupabaseClient) => {
    const { data: u } = await c.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const { data, error } = await c
      .from("businesses")
      .select("id, business_name, owner_name, plan, price, paid_until")
      .eq("user_id", uid)
      .limit(1);
    if (error) throw new Error(error.message);
    const row: any = (data ?? [])[0];
    if (!row) {
      setBiz(null);
      setPays([]);
      setNoBiz(true);
      return;
    }
    setNoBiz(false);
    setBiz({
      business_name: row.business_name,
      owner_name: row.owner_name,
      plan: row.plan,
      price: Number(row.price) || 0,
      paid_until: row.paid_until,
    });
    const { data: p, error: pe } = await c
      .from("business_payments")
      .select("id, amount, paid_on, method, reference")
      .eq("business_id", row.id)
      .order("paid_on", { ascending: false })
      .limit(5);
    if (pe) throw new Error(pe.message);
    setPays((p ?? []).map((x: any) => ({ ...x, amount: Number(x.amount) || 0 })));
  }, []);

  useEffect(() => {
    setToday(localDate());
    let url = "";
    let key = "";
    try {
      url = localStorage.getItem(LS_URL) ?? "";
      key = localStorage.getItem(LS_KEY) ?? "";
    } catch {
      // storage can be blocked; the person signs in again
    }
    if (!url || !key) return;
    (async () => {
      try {
        const c = makeClient(url, key);
        const { data } = await c.auth.getSession();
        if (data.session) {
          setClient(c);
          setEmail(data.session.user.email ?? "");
          await loadAccount(c);
        }
      } catch {
        // the person can sign in again
      }
    })();
  }, [loadAccount]);

  async function onSignIn() {
    if (keyLooksUnset()) {
      setMsg("Setup is not finished: the key is missing in the cloud settings file. Tell the provider.");
      return;
    }
    if (keyLooksSecret()) {
      setMsg("The app was given a secret key by mistake. Tell the provider. Nothing was done.");
      return;
    }
    const mail = loginToEmail(username);
    if (!mail) {
      setMsg("Enter your username (3 to 30 letters or numbers) or your full email");
      return;
    }
    if (!password) {
      setMsg("Enter your password");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const c = makeClient(CLOUD_URL, CLOUD_KEY);
      const { error } = await c.auth.signInWithPassword({ email: mail, password });
      if (error) throw new Error(error.message);
      try {
        localStorage.setItem(LS_URL, CLOUD_URL);
        localStorage.setItem(LS_KEY, CLOUD_KEY);
        localStorage.setItem(LS_EMAIL, mail);
      } catch {
        // ignore
      }
      setClient(c);
      setEmail(mail);
      setPassword("");
      await loadAccount(c);
      setMsg("Signed in");
    } catch (e: any) {
      setMsg(`Could not sign in: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onSignOut() {
    try {
      await client?.auth.signOut();
    } catch {
      // ignore
    }
    setClient(null);
    setBiz(null);
    setPays([]);
    setNoBiz(false);
    setEmail("");
    setMsg("Signed out");
  }

  async function onChangePassword() {
    if (!client) return;
    if (newPw.length < 10) {
      setMsg("The new password must have at least 10 characters");
      return;
    }
    if (newPw !== newPw2) {
      setMsg("The two passwords are not the same");
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.auth.updateUser({ password: newPw });
      if (error) throw new Error(error.message);
      setNewPw("");
      setNewPw2("");
      setMsg("Password changed. Keep it safe; if you forget it, the provider can reset it.");
    } catch (e: any) {
      setMsg(`Could not change the password: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  let statusText = "";
  if (biz) {
    if (!biz.paid_until) statusText = "Paid-until date is not set yet";
    else {
      const diff = daysBetween(today || localDate(), biz.paid_until);
      statusText =
        diff < 0
          ? `Overdue by ${-diff} day(s) (was paid till ${biz.paid_until})`
          : `Paid till ${biz.paid_until} (${diff} day(s) left)`;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">My account</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      {!client ? (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign in with the username and password given to you. Signing in also turns on your cloud backup. If an
            admin and a customer use the same phone, each must sign in again when switching.
          </p>
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
            />
          </label>
          <button className={btn} disabled={busy} onClick={onSignIn}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </section>
      ) : (
        <>
          <section className="space-y-2 text-sm">
            <p>Signed in as {email}</p>
            <button className="underline" onClick={onSignOut}>
              Sign out
            </button>
          </section>

          {noBiz && (
            <p className="text-sm rounded-md border p-2">
              No business is linked to this login (this is normal for an admin login).
            </p>
          )}

          {biz && (
            <>
              <section className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">{biz.business_name}</p>
                <p className="text-muted-foreground">{biz.owner_name}</p>
                <p>
                  Plan {biz.plan} | Price {inr(biz.price)}
                </p>
                <p className="font-medium">{statusText}</p>
              </section>

              <section className="space-y-2">
                <h2 className="font-medium">Latest payments</h2>
                {pays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment recorded yet.</p>
                ) : (
                  pays.map((p) => (
                    <p key={p.id} className="text-sm">
                      {p.paid_on} | {inr(p.amount)} | {p.method}
                      {p.reference ? ` | ${p.reference}` : ""}
                    </p>
                  ))
                )}
              </section>
            </>
          )}

          <section className="space-y-3">
            <h2 className="font-medium">Change my password</h2>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">New password (at least 10 characters)</span>
              <input
                type="password"
                className={`${input} w-full`}
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Type it again</span>
              <input
                type="password"
                className={`${input} w-full`}
                autoComplete="new-password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
              />
            </label>
            <button className={btn} disabled={busy} onClick={onChangePassword}>
              {busy ? "Saving..." : "Change password"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

export default function CustomerLoginView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
