import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { getCloudClient } from "@/lib/adminCheck";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

interface Business {
  id: string;
  user_id: string | null;
  login_name: string;
  business_name: string;
  owner_name: string;
  phone: string;
  plan: string;
  price: number;
  paid_until: string | null;
  active: boolean;
  notes: string;
}
interface Payment {
  id: string;
  business_id: string;
  amount: number;
  paid_on: string;
  method: string;
  reference: string;
  note: string;
}
interface BackupInfo {
  created_at: string;
  summary: { invoices?: number; customers?: number; taps?: number } | null;
}
interface Created {
  name: string;
  login: string;
  password: string;
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
// Adds months and stops at the last day of a shorter month (31 Jan + 1 month = 28 or 29 Feb).
const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + n;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
};
const paise = (n: any) => Math.round((Number(n) || 0) * 100);
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
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function statusOf(b: Business, today: string): { text: string; warn: boolean } {
  if (!b.active) return { text: "Inactive", warn: true };
  if (!b.paid_until) return { text: "No paid-until date", warn: true };
  const diff = daysBetween(today, b.paid_until);
  if (diff < 0) return { text: `Overdue by ${-diff} day(s)`, warn: true };
  if (diff <= 7) return { text: `Due in ${diff} day(s)`, warn: true };
  return { text: `Paid till ${b.paid_until}`, warn: false };
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">The admin panel could not open here.</p>;
    return this.props.children;
  }
}

type Phase = "loading" | "nokey" | "signin" | "notadmin" | "error" | "ready";

// Asks the server function to make a login or reset a password. The password comes back only once.
async function callFn(body: Record<string, unknown>): Promise<{ login: string; password: string }> {
  const c = getCloudClient();
  if (!c) throw new Error("Sign in first.");
  const { data, error } = await c.functions.invoke("admin-customers", { body });
  if (error) {
    let detail = "";
    try {
      const j = await (error as any).context?.json?.();
      detail = j?.error ? String(j.error) : "";
    } catch {
      // ignore
    }
    throw new Error(detail || error.message || "The request failed.");
  }
  if (!data || data.ok !== true) throw new Error(String(data?.error ?? "The request failed."));
  return { login: String(data.login), password: String(data.password) };
}

function Inner() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [lastBackup, setLastBackup] = useState<Record<string, BackupInfo>>({});
  const [today, setToday] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState("");
  const [mode, setMode] = useState<"" | "pay" | "edit" | "history">("");

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState("UPI");
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payUntil, setPayUntil] = useState("");

  const [eName, setEName] = useState("");
  const [eOwner, setEOwner] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [ePlan, setEPlan] = useState("monthly");
  const [ePrice, setEPrice] = useState("");
  const [eUntil, setEUntil] = useState("");
  const [eActive, setEActive] = useState(true);
  const [eNotes, setENotes] = useState("");

  const [nName, setNName] = useState("");
  const [nOwner, setNOwner] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [nPlan, setNPlan] = useState("monthly");
  const [nPrice, setNPrice] = useState("");
  const [nLogin, setNLogin] = useState("");
  const [appLink, setAppLink] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  const load = useCallback(async () => {
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
      const [b, p, k] = await Promise.all([
        c.from("businesses").select("*").order("business_name"),
        c
          .from("business_payments")
          .select("*")
          .order("paid_on", { ascending: false })
          .order("created_at", { ascending: false })
          .range(0, 999),
        c
          .from("app_backups")
          .select("user_id, created_at, summary")
          .order("created_at", { ascending: false })
          .range(0, 499),
      ]);
      if (b.error) throw new Error(b.error.message);
      if (p.error) throw new Error(p.error.message);
      if (k.error) throw new Error(k.error.message);
      setBusinesses((b.data ?? []).map((x: any) => ({ ...x, price: Number(x.price) || 0 })));
      setPayments((p.data ?? []).map((x: any) => ({ ...x, amount: Number(x.amount) || 0 })));
      const map: Record<string, BackupInfo> = {};
      for (const r of k.data ?? []) {
        if (!map[r.user_id]) map[r.user_id] = { created_at: r.created_at, summary: r.summary };
      }
      setLastBackup(map);
      setPhase("ready");
    } catch (e: any) {
      setMsg(`Could not load: ${e.message ?? e}`);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    setToday(localDate());
    try {
      setAppLink(window.location.origin);
    } catch {
      // ignore
    }
    load();
  }, [load]);

  function openPay(b: Business) {
    const base = b.paid_until && b.paid_until > today ? b.paid_until : today;
    setPayAmount(b.price > 0 ? String(b.price) : "");
    setPayDate(today);
    setPayMethod("UPI");
    setPayRef("");
    setPayNote("");
    setPayUntil(addMonths(base, b.plan === "yearly" ? 12 : 1));
    setOpenId(b.id);
    setMode("pay");
    setMsg("");
  }

  function openEdit(b: Business) {
    setEName(b.business_name);
    setEOwner(b.owner_name);
    setEPhone(b.phone);
    setEPlan(b.plan);
    setEPrice(String(b.price));
    setEUntil(b.paid_until ?? "");
    setEActive(b.active);
    setENotes(b.notes);
    setOpenId(b.id);
    setMode("edit");
    setMsg("");
  }

  function closeForm() {
    setOpenId("");
    setMode("");
  }

  async function savePayment(b: Business) {
    const c = getCloudClient();
    if (!c) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg("Enter an amount more than 0");
      return;
    }
    if (!isDate(payDate)) {
      setMsg("Pick the payment date");
      return;
    }
    if (payUntil !== "" && !isDate(payUntil)) {
      setMsg("The paid-until date is not valid");
      return;
    }
    setBusy(true);
    try {
      const { error } = await c.from("business_payments").insert({
        business_id: b.id,
        amount: Math.round(amount * 100) / 100,
        paid_on: payDate,
        method: payMethod,
        reference: payRef.trim(),
        note: payNote.trim(),
      });
      if (error) throw new Error(error.message);
      if (payUntil !== "") {
        const { error: ue } = await c.from("businesses").update({ paid_until: payUntil }).eq("id", b.id);
        if (ue) {
          setMsg(`Payment saved, but the paid-until date was not updated (${ue.message}). Set it with Edit.`);
          await load();
          setBusy(false);
          return;
        }
      }
      setMsg(`Payment of ${inr(paise(amount))} saved for ${b.business_name}`);
      closeForm();
      await load();
    } catch (e: any) {
      setMsg(`Could not save the payment: ${e.message ?? e}. Nothing was saved.`);
    }
    setBusy(false);
  }

  async function saveEdit(b: Business) {
    const c = getCloudClient();
    if (!c) return;
    const price = Number(ePrice);
    if (!eName.trim()) {
      setMsg("Business name cannot be empty");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMsg("Price must be a number (0 or more)");
      return;
    }
    if (eUntil !== "" && !isDate(eUntil)) {
      setMsg("The paid-until date is not valid");
      return;
    }
    setBusy(true);
    try {
      const { error } = await c
        .from("businesses")
        .update({
          business_name: eName.trim(),
          owner_name: eOwner.trim(),
          phone: ePhone.trim(),
          plan: ePlan.trim() || "monthly",
          price: Math.round(price * 100) / 100,
          paid_until: eUntil === "" ? null : eUntil,
          active: eActive,
          notes: eNotes.trim(),
        })
        .eq("id", b.id);
      if (error) throw new Error(error.message);
      setMsg(`${eName.trim()} updated`);
      closeForm();
      await load();
    } catch (e: any) {
      setMsg(`Could not save: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onCreate() {
    const name = nName.trim();
    if (!name) {
      setMsg("Enter the business name");
      return;
    }
    const price = nPrice.trim() === "" ? 0 : Number(nPrice);
    if (!Number.isFinite(price) || price < 0) {
      setMsg("The price must be a number (0 or more)");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const r = await callFn({
        action: "create",
        business_name: name,
        owner_name: nOwner.trim(),
        phone: nPhone.trim(),
        plan: nPlan,
        price: Math.round(price * 100) / 100,
        login_name: nLogin.trim(),
      });
      setCreated({ name, login: r.login, password: r.password });
      setNName("");
      setNOwner("");
      setNPhone("");
      setNPrice("");
      setNLogin("");
      await load();
    } catch (e: any) {
      setMsg(`Could not create the login: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  async function onReset(b: Business) {
    if (!confirm(`Make a new password for ${b.business_name}? The old password will stop working.`)) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await callFn({ action: "reset_password", business_id: b.id });
      setCreated({ name: b.business_name, login: r.login, password: r.password });
    } catch (e: any) {
      setMsg(`Could not reset the password: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  const credText = (c: Created) =>
    `Prime Terminal login\nApp: ${appLink}\nUsername: ${c.login}\nPassword: ${c.password}\n` +
    `Open the app, go to Excise, then My account, sign in and change your password.`;

  async function copyCreds() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(credText(created));
      setMsg("Copied.");
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  if (phase === "loading") return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;
  if (phase === "nokey") {
    return (
      <p className="p-4 text-sm">
        Open the Cloud backup tab first and sign in with your admin email. Then come back here.
      </p>
    );
  }
  if (phase === "signin") {
    return <p className="p-4 text-sm">You are not signed in. Open the Cloud backup tab and sign in with your admin email.</p>;
  }
  if (phase === "notadmin") {
    return <p className="p-4 text-sm">This account is not an admin, so there is nothing to show here.</p>;
  }
  if (phase === "error") {
    return (
      <div className="space-y-3 p-4">
        {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}
        <button className={btn} onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  const paidP = new Map<string, number>();
  const countOf = new Map<string, number>();
  for (const p of payments) {
    paidP.set(p.business_id, (paidP.get(p.business_id) ?? 0) + paise(p.amount));
    countOf.set(p.business_id, (countOf.get(p.business_id) ?? 0) + 1);
  }
  const totalReceivedP = payments.reduce((s, p) => s + paise(p.amount), 0);
  const attention = businesses.filter((b) => statusOf(b, today).warn).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Admin panel</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      {created && (
        <section className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">Login for {created.name}</p>
          <p>
            Username: <span className="font-mono">{created.login}</span>
          </p>
          <p>
            Password: <span className="font-mono">{created.password}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            This password is shown only now and is not saved anywhere. Give it to the customer and ask them to change
            it in My account. If it is lost, use Reset password.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button className={btn} onClick={copyCreds}>
              Copy
            </button>
            <a
              className="underline"
              href={`https://wa.me/?text=${encodeURIComponent(credText(created))}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Send on WhatsApp
            </a>
            <button
              className="underline"
              onClick={() => {
                if (confirm("Hide this password? It cannot be shown again.")) setCreated(null);
              }}
            >
              Done
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-md border p-3">
        <h2 className="font-medium">Add customer</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Business name</span>
            <input className={`${input} w-full`} maxLength={80} value={nName} onChange={(e) => setNName(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Owner name</span>
            <input className={`${input} w-full`} maxLength={80} value={nOwner} onChange={(e) => setNOwner(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Phone</span>
            <input
              className={`${input} w-full`}
              inputMode="tel"
              value={nPhone}
              onChange={(e) => setNPhone(e.target.value.replace(/[^\d+ ]/g, "").slice(0, 15))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Plan</span>
            <select className={`${input} w-full`} value={nPlan} onChange={(e) => setNPlan(e.target.value)}>
              <option value="monthly">monthly</option>
              <option value="yearly">yearly</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Price</span>
            <input
              className={`${input} w-full`}
              inputMode="decimal"
              value={nPrice}
              onChange={(e) => setNPrice(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Username (leave empty to make one)</span>
            <input
              className={`${input} w-full`}
              autoCapitalize="none"
              maxLength={30}
              value={nLogin}
              onChange={(e) => setNLogin(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-sm text-muted-foreground">App link to send with the login</span>
            <input className={`${input} w-full`} value={appLink} onChange={(e) => setAppLink(e.target.value)} />
          </label>
        </div>
        <button className={btn} disabled={busy} onClick={onCreate}>
          {busy ? "Please wait..." : "Create login"}
        </button>
      </section>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p>
          {businesses.length} customer(s) | {attention} need attention
        </p>
        <p>Total received (latest 1000 payments): {inr(totalReceivedP)}</p>
        <p className="text-xs text-muted-foreground">
          Customer passwords are never shown here after they are made. If a customer forgets a password, use Reset
          password on their card. This panel shows billing and backup details, not live activity.
        </p>
      </section>

      {businesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customers yet. Add one above.</p>
      ) : (
        <div className="space-y-3">
          {businesses.map((b) => {
            const st = statusOf(b, today);
            const bk = b.user_id ? lastBackup[b.user_id] : undefined;
            const old = bk ? daysBetween(bk.created_at.slice(0, 10), today) > 2 : true;
            const list = payments.filter((p) => p.business_id === b.id);
            return (
              <div key={b.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{b.business_name}</span>
                  <span className={st.warn ? "font-medium text-destructive" : "font-medium"}>{st.text}</span>
                </div>
                <p className="text-muted-foreground">
                  Login: {b.login_name} | {b.owner_name || "no owner name"} | {b.phone || "no phone"}
                </p>
                <p>
                  Plan {b.plan} | Price {inr(paise(b.price))} | Paid so far {inr(paidP.get(b.id) ?? 0)} (
                  {countOf.get(b.id) ?? 0} payment(s))
                </p>
                <p className={old ? "text-destructive" : "text-muted-foreground"}>
                  {bk
                    ? `Last backup: ${when(bk.created_at)} | ${bk.summary?.invoices ?? "?"} bills, ${
                        bk.summary?.customers ?? "?"
                      } customers`
                    : "No backup yet"}
                  {bk && old ? " (older than 2 days)" : ""}
                </p>
                {b.notes && <p className="text-muted-foreground">Note: {b.notes}</p>}
                <div className="flex flex-wrap gap-4">
                  <button className="underline" onClick={() => openPay(b)}>
                    Add payment
                  </button>
                  <button className="underline" onClick={() => openEdit(b)}>
                    Edit
                  </button>
                  <button
                    className="underline"
                    onClick={() => {
                      setOpenId(b.id);
                      setMode("history");
                    }}
                  >
                    Payments
                  </button>
                  <button className="underline" disabled={busy} onClick={() => onReset(b)}>
                    Reset password
                  </button>
                </div>

                {openId === b.id && mode === "pay" && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Amount</span>
                        <input
                          className={`${input} w-full`}
                          inputMode="decimal"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Paid on</span>
                        <input type="date" className={`${input} w-full`} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Method</span>
                        <select className={`${input} w-full`} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                          <option>UPI</option>
                          <option>Cash</option>
                          <option>Bank</option>
                          <option>Cheque</option>
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Reference (UTR / cheque no.)</span>
                        <input className={`${input} w-full`} value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Paid until (new date)</span>
                        <input type="date" className={`${input} w-full`} value={payUntil} onChange={(e) => setPayUntil(e.target.value)} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Note</span>
                        <input className={`${input} w-full`} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                      </label>
                    </div>
                    <div className="flex gap-3">
                      <button className={btn} disabled={busy} onClick={() => savePayment(b)}>
                        {busy ? "Saving..." : "Save payment"}
                      </button>
                      <button className="underline" onClick={closeForm}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {openId === b.id && mode === "edit" && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Business name</span>
                        <input className={`${input} w-full`} value={eName} onChange={(e) => setEName(e.target.value)} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Owner name</span>
                        <input className={`${input} w-full`} value={eOwner} onChange={(e) => setEOwner(e.target.value)} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Phone</span>
                        <input className={`${input} w-full`} value={ePhone} onChange={(e) => setEPhone(e.target.value)} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Plan (monthly or yearly)</span>
                        <input className={`${input} w-full`} value={ePlan} onChange={(e) => setEPlan(e.target.value)} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Price</span>
                        <input
                          className={`${input} w-full`}
                          inputMode="decimal"
                          value={ePrice}
                          onChange={(e) => setEPrice(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-muted-foreground">Paid until</span>
                        <input type="date" className={`${input} w-full`} value={eUntil} onChange={(e) => setEUntil(e.target.value)} />
                      </label>
                      <label className="block space-y-1 sm:col-span-2">
                        <span className="text-muted-foreground">Notes</span>
                        <input className={`${input} w-full`} value={eNotes} onChange={(e) => setENotes(e.target.value)} />
                      </label>
                    </div>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
                      Active (this is only a mark for now, it does not block the customer's login)
                    </label>
                    <div className="flex gap-3">
                      <button className={btn} disabled={busy} onClick={() => saveEdit(b)}>
                        {busy ? "Saving..." : "Save"}
                      </button>
                      <button className="underline" onClick={closeForm}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {openId === b.id && mode === "history" && (
                  <div className="space-y-2 border-t pt-3">
                    {list.length === 0 ? (
                      <p className="text-muted-foreground">No payments yet.</p>
                    ) : (
                      list.slice(0, 20).map((p) => (
                        <p key={p.id}>
                          {p.paid_on} | {inr(paise(p.amount))} | {p.method}
                          {p.reference ? ` | ${p.reference}` : ""}
                          {p.note ? ` | ${p.note}` : ""}
                        </p>
                      ))
                    )}
                    <button className="underline" onClick={closeForm}>
                      Close
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminPanelView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
