import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCloudClient } from "@/lib/adminCheck";

const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const MAX_CUSTOMERS = 40;
const BASE_COLS = "id, user_id, business_name, login_name, owner_name, phone, plan, paid_until, active";
const COLS = `${BASE_COLS}, last_seen_at`;

interface Row {
  id: string;
  user_id: string | null;
  business_name: string;
  login_name: string;
  owner_name: string;
  phone: string;
  plan: string;
  paid_until: string | null;
  active: boolean;
  last_seen_at?: string | null;
  backupAt: string | null;
  billAt: string | null;
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

// How many days old a time is. Never or unreadable counts as very old.
function ageDays(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "never";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour(s) ago`;
  return `${Math.round(h / 24)} day(s) ago`;
}

// Turns what is saved into a WhatsApp number (country code 91, digits only). Empty if not valid.
function waNumber(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return "";
}

function statusOf(r: Row, today: string): { text: string; warn: boolean } {
  if (!r.active) return { text: "Inactive", warn: true };
  if (!r.paid_until) return { text: "No paid-until date", warn: true };
  const diff = daysBetween(today, r.paid_until);
  if (diff < 0) return { text: `Overdue by ${-diff} day(s)`, warn: true };
  if (diff <= 7) return { text: `Due in ${diff} day(s)`, warn: true };
  return { text: `Paid till ${r.paid_until}`, warn: false };
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">The overview could not open here.</p>;
    return this.props.children;
  }
}

type Phase = "loading" | "nokey" | "signin" | "notadmin" | "error" | "ready";

function Inner() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [noSeen, setNoSeen] = useState(false);
  const [today, setToday] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMsg("");
    setBusy(true);
    const c = getCloudClient();
    if (!c) {
      setPhase("nokey");
      setBusy(false);
      return;
    }
    try {
      const { data: s } = await c.auth.getSession();
      if (!s.session) {
        setPhase("signin");
        setBusy(false);
        return;
      }
      const { data: adm, error: ae } = await c.rpc("is_admin");
      if (ae) throw new Error(ae.message);
      if (adm !== true) {
        setPhase("notadmin");
        setBusy(false);
        return;
      }

      let seenMissing = false;
      let res: any = await c.from("businesses").select(COLS).order("business_name");
      if (res.error && String(res.error.message ?? "").includes("last_seen_at")) {
        seenMissing = true;
        res = await c.from("businesses").select(BASE_COLS).order("business_name");
      }
      if (res.error) throw new Error(res.error.message);
      const all: any[] = res.data ?? [];
      const list: Row[] = all.slice(0, MAX_CUSTOMERS).map((x: any) => ({
        id: String(x.id),
        user_id: x.user_id ?? null,
        business_name: String(x.business_name ?? ""),
        login_name: String(x.login_name ?? ""),
        owner_name: String(x.owner_name ?? ""),
        phone: String(x.phone ?? ""),
        plan: String(x.plan ?? ""),
        paid_until: x.paid_until ?? null,
        active: x.active !== false,
        last_seen_at: x.last_seen_at ?? null,
        backupAt: null,
        billAt: null,
      }));

      // The latest backup and the latest saved bill of each customer, a few customers at a time.
      for (let i = 0; i < list.length; i += 10) {
        await Promise.all(
          list.slice(i, i + 10).map(async (r) => {
            if (!r.user_id) return;
            try {
              const [bk, bl] = await Promise.all([
                c
                  .from("app_backups")
                  .select("created_at")
                  .eq("user_id", r.user_id)
                  .order("created_at", { ascending: false })
                  .limit(1),
                c
                  .from("pos_bills")
                  .select("synced_at")
                  .eq("user_id", r.user_id)
                  .order("synced_at", { ascending: false })
                  .limit(1),
              ]);
              const b1: any = (bk.data ?? [])[0];
              const b2: any = (bl.data ?? [])[0];
              r.backupAt = b1 ? String(b1.created_at) : null;
              r.billAt = b2 ? String(b2.synced_at) : null;
            } catch {
              // leave them empty
            }
          })
        );
      }

      setToday(localDate());
      setRows(list);
      setHiddenCount(Math.max(0, all.length - list.length));
      setNoSeen(seenMissing);
      setPhase("ready");
    } catch (e: any) {
      setMsg(`Could not load: ${e.message ?? e}`);
      setPhase("error");
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const view = useMemo(() => {
    if (phase !== "ready") return null;
    const items = rows.map((r) => {
      const st = statusOf(r, today);
      const quiet = !noSeen && !!r.user_id && ageDays(r.last_seen_at) >= 3;
      const noBackup = !!r.user_id && ageDays(r.backupAt) >= 2;
      const flags = (st.warn ? 1 : 0) + (quiet ? 1 : 0) + (noBackup ? 1 : 0);
      return { r, st, quiet, noBackup, flags };
    });
    items.sort((a, b) => b.flags - a.flags || a.r.business_name.localeCompare(b.r.business_name));
    return {
      items,
      activeToday: noSeen ? 0 : rows.filter((r) => ageDays(r.last_seen_at) < 1).length,
      needAttention: items.filter((x) => x.flags > 0).length,
      planProblems: items.filter((x) => x.st.warn).length,
    };
  }, [rows, today, noSeen, phase]);

  if (phase === "loading") return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;
  if (phase === "nokey" || phase === "signin") {
    return <p className="p-4 text-sm">Open the Cloud backup tab and sign in with your admin email. Then come back here.</p>;
  }
  if (phase === "notadmin") return <p className="p-4 text-sm">This account is not an admin, so there is nothing to show here.</p>;
  if (phase === "error" || !view) {
    return (
      <div className="space-y-3 p-4">
        {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}
        <button className={btn} onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Overview</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        All customers at a glance: plan, when they last opened the app, their last backup and their last saved bill.
        The ones that need your attention are on top.
      </p>

      {noSeen && (
        <p className="text-sm rounded-md border p-2">
          The database does not have the "last active" column yet. Run the SQL from the guide.
        </p>
      )}

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p className="font-medium">
          {rows.length} customer(s) | {view.needAttention} need attention
        </p>
        <p>Active in the last 24 hours: {view.activeToday}</p>
        <p>Plan problems (due, overdue or inactive): {view.planProblems}</p>
        {hiddenCount > 0 && <p className="text-muted-foreground">{hiddenCount} more customer(s) are not shown here.</p>}
        <button className="underline" disabled={busy} onClick={load}>
          {busy ? "Loading..." : "Refresh"}
        </button>
      </section>

      {view.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      ) : (
        <div className="space-y-3">
          {view.items.map(({ r, st, quiet, noBackup }) => {
            const num = waNumber(r.phone);
            const text =
              `Namaste ${r.owner_name || r.business_name} ji, aapka Prime Terminal plan ` +
              `${r.paid_until ? `${r.paid_until} tak tha` : "abhi activate nahi hai"}. Kripya renew kar dein. Dhanyavaad.`;
            const url = num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : "";
            return (
              <div key={r.id} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{r.business_name}</span>
                  <span className={st.warn ? "font-medium text-destructive" : "font-medium"}>{st.text}</span>
                </div>
                <p className="text-muted-foreground">
                  Login: {r.login_name} | {r.owner_name || "no owner name"} | {r.phone || "no phone"}
                </p>
                {!r.user_id ? (
                  <p className="text-destructive">No login is linked to this customer yet.</p>
                ) : (
                  <>
                    <p className={quiet ? "text-destructive" : ""}>
                      Last active: {noSeen ? "(run the SQL)" : ago(r.last_seen_at)}
                    </p>
                    <p className={noBackup ? "text-destructive" : "text-muted-foreground"}>
                      Last backup: {ago(r.backupAt)} | Last bill saved: {ago(r.billAt)}
                    </p>
                  </>
                )}
                {st.warn && url && (
                  <a className="underline" href={url} target="_blank" rel="noopener noreferrer">
                    Remind on WhatsApp
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminOverviewView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
