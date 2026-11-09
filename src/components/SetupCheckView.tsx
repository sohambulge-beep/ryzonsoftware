import { Component, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCloudClient } from "@/lib/adminCheck";
import { keyLooksSecret, keyLooksUnset } from "@/lib/cloudConfig";
import { GATE_ENABLED } from "@/lib/gateConfig";
import { PROVIDER_PHONE } from "@/lib/providerConfig";
import { getStorageInfo } from "@/data";
import { getFailed, getQueue } from "@/lib/offlineQueue";
import { useOwnerAccess } from "@/lib/ownerAccess";

const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const LIMIT_CHARS = 5000000;

type Level = "ok" | "warn" | "bad" | "info";
interface Item {
  group: string;
  label: string;
  level: Level;
  note: string;
}

const MARK: Record<Level, string> = { ok: "OK", warn: "CHECK", bad: "PROBLEM", info: "INFO" };
const COLOR: Record<Level, string> = {
  ok: "text-emerald-500",
  warn: "text-amber-500",
  bad: "text-destructive",
  info: "text-muted-foreground",
};

// Every check has its own time limit, so one slow answer never holds up the rest.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

const lsGet = (k: string): string => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};

function mergeIsOn(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("pt_evt_on:") && localStorage.getItem(k) === "1") return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// Reads only. Nothing is changed or deleted by these checks.
async function runAll(role: string): Promise<Item[]> {
  const out: Item[] = [];
  const add = (group: string, label: string, level: Level, note: string) => out.push({ group, label, level, note });
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;

  // ---------- This phone ----------
  const P = "This phone";
  add(P, "Internet", online ? "ok" : "warn", online ? "connected" : "not connected, so the cloud checks are skipped");
  add(P, "Your role", "info", role || "unknown");

  if (keyLooksUnset()) add(P, "Cloud key", "bad", "the Publishable key is missing in cloudConfig.ts");
  else if (keyLooksSecret()) add(P, "Cloud key", "bad", "a SECRET key is pasted in cloudConfig.ts. Remove it now");
  else add(P, "Cloud key", "ok", "set");

  const digits = PROVIDER_PHONE.replace(/\D/g, "");
  add(
    P,
    "Provider WhatsApp number",
    digits.length >= 10 ? "ok" : "warn",
    digits.length >= 10 ? "set" : "empty in providerConfig.ts: the Contact on WhatsApp buttons stay hidden"
  );

  const lastBackup = Number(lsGet("pt_auto_last_at")) || 0;
  if (!lastBackup) {
    add(P, "Automatic cloud backup", "warn", "none yet. Sign in to My account and wait a few minutes");
  } else {
    const hrs = (Date.now() - lastBackup) / 3600000;
    add(
      P,
      "Automatic cloud backup",
      hrs < 26 ? "ok" : "warn",
      `last on ${new Date(lastBackup).toLocaleString("en-IN")}${hrs < 26 ? "" : " (normal if nothing changed since)"}`
    );
  }

  try {
    const info = getStorageInfo();
    const pct = Math.round((info.usedChars * 100) / LIMIT_CHARS);
    add(P, "Phone storage", info.full ? "bad" : pct >= 75 ? "warn" : "ok", `${pct}% used${info.full ? " (FULL)" : ""}`);
    add(
      P,
      "Safe copy (IndexedDB)",
      info.lastIdbAt > 0 ? "ok" : "warn",
      info.lastIdbAt > 0 ? `saved ${new Date(info.lastIdbAt).toLocaleString("en-IN")}` : "not saved yet in this browser"
    );
  } catch {
    add(P, "Phone storage", "warn", "could not be read");
  }

  try {
    const s: any = typeof navigator !== "undefined" ? (navigator as any).storage : null;
    if (s && typeof s.persisted === "function") {
      const persisted = await withTimeout(s.persisted(), 4000);
      add(
        P,
        "Browser will keep the data",
        persisted ? "ok" : "warn",
        persisted ? "yes" : "not promised. Installing the app on the home screen helps"
      );
    }
  } catch {
    // ignore
  }

  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 4000);
      add(
        P,
        "Offline helper (opens without internet)",
        reg && reg.active ? "ok" : "warn",
        reg && reg.active ? "installed" : "not active. It works only on the published link, not inside the Lovable preview"
      );
    } else {
      add(P, "Offline helper (opens without internet)", "warn", "this browser does not support it");
    }
  } catch {
    add(P, "Offline helper (opens without internet)", "warn", "could not be checked");
  }

  let standalone = false;
  try {
    standalone = window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    // ignore
  }
  add(P, "Installed on the home screen", "info", standalone ? "yes" : "no");

  const gateOn = GATE_ENABLED || lsGet("pt_gate_on") === "1";
  add(P, "Sign-in gate", "info", gateOn ? "on" : "off");
  add(P, "Two-phone merge", "info", mergeIsOn() ? "on" : "off");

  try {
    const waiting = getQueue().length;
    const refused = getFailed().length;
    add(
      P,
      "Offline entries",
      refused > 0 ? "bad" : waiting > 0 ? "warn" : "ok",
      `${waiting} waiting to be sent, ${refused} refused by the server`
    );
  } catch {
    // ignore
  }

  // ---------- New cloud (Supabase) ----------
  const C = "New cloud (Supabase)";
  const c: any = getCloudClient();
  if (!online) {
    add(C, "Cloud checks", "warn", "skipped, no internet");
  } else if (!c) {
    add(C, "Connection", "warn", "not set up on this phone: sign in to My account first");
  } else {
    let signedIn = false;
    try {
      const { data } = await withTimeout(c.auth.getSession(), 8000);
      signedIn = !!data?.session;
    } catch {
      // ignore
    }
    add(C, "My account sign-in", signedIn ? "ok" : "warn", signedIn ? "signed in" : "not signed in");

    if (signedIn) {
      const probes: { label: string; table: string; cols: string; hint: string }[] = [
        { label: "Backups table", table: "app_backups", cols: "id", hint: "Run the first SQL (Stage A)." },
        {
          label: "Bills table with cancelled columns",
          table: "pos_bills",
          cols: "voided, void_reason, voided_at",
          hint: "Run the SQL of the Cloud bills step.",
        },
        { label: "Stock table", table: "pos_stock", cols: "item_key", hint: "Run the SQL of the stock sync step." },
        { label: "Udhaar table", table: "pos_customers", cols: "item_key", hint: "Run the SQL of the stock sync step." },
        { label: "Two-phone merge table", table: "pos_events", cols: "id", hint: "Run the SQL of the merge step." },
        {
          label: "Customer record with last active",
          table: "businesses",
          cols: "last_seen_at",
          hint: "Run the SQL of the Overview step.",
        },
      ];
      for (const p of probes) {
        try {
          const res: any = await withTimeout(c.from(p.table).select(p.cols).limit(1), 8000);
          if (res.error) add(C, p.label, "bad", `${String(res.error.message ?? res.error)}. ${p.hint}`);
          else add(C, p.label, "ok", "ready");
        } catch {
          add(C, p.label, "warn", "could not be checked (too slow)");
        }
      }

      try {
        const res: any = await withTimeout(c.rpc("touch_business"), 8000);
        const text = String(res?.error?.message ?? "");
        if (res.error && (res.error.code === "PGRST202" || text.includes("Could not find"))) {
          add(C, "Last active function", "bad", "touch_business is missing. Run the SQL of the Overview step.");
        } else if (res.error) {
          add(C, "Last active function", "warn", text);
        } else {
          add(C, "Last active function", "ok", "ready");
        }
      } catch {
        add(C, "Last active function", "warn", "could not be checked (too slow)");
      }

      try {
        const res: any = await withTimeout(c.functions.invoke("admin-customers", { body: { action: "ping" } }), 10000);
        if (res.error) {
          const status = Number((res.error as any)?.context?.status ?? 0);
          if (status === 404) add(C, "Add customer function", "bad", "admin-customers is not deployed in Supabase");
          else if (status > 0) add(C, "Add customer function", "ok", "deployed");
          else add(C, "Add customer function", "warn", "could not be reached");
        } else {
          add(C, "Add customer function", "ok", "deployed");
        }
      } catch {
        add(C, "Add customer function", "warn", "could not be checked (too slow)");
      }
    }
  }

  // ---------- Old database (Lovable) ----------
  const O = "Old database (Lovable)";
  if (!online) {
    add(O, "Database checks", "warn", "skipped, no internet");
  } else {
    let uid = "";
    try {
      const { data } = await withTimeout(supabase.auth.getSession(), 8000);
      uid = data?.session?.user.id ?? "";
    } catch {
      // ignore
    }
    if (!uid) {
      add(O, "Old login (email or Google)", "warn", "not signed in with the old login");
    } else {
      add(O, "Old login (email or Google)", "ok", "signed in");
      for (const table of ["excise_settings", "excise_brands", "bank_accounts"]) {
        try {
          const res: any = await withTimeout((supabase as any).from(table).select("*").limit(50), 8000);
          if (res.error) {
            add(O, table, "bad", `${String(res.error.message ?? res.error)}`);
          } else {
            const rows: any[] = res.data ?? [];
            const foreign = rows.filter((r) => r && typeof r.user_id === "string" && r.user_id !== uid).length;
            if (foreign > 0) add(O, table, "bad", `${foreign} row(s) of ANOTHER business are visible. Stop and tell the developer`);
            else add(O, table, "ok", `readable, ${rows.length} row(s), none of another business`);
          }
        } catch {
          add(O, table, "warn", "could not be checked (too slow)");
        }
      }
    }
  }

  return out;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">Setup check could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { isOwner, role } = useOwnerAccess();
  const [items, setItems] = useState<Item[] | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");

  async function onRun() {
    setRunning(true);
    setMsg("");
    try {
      setItems(await runAll(role));
    } catch (e: any) {
      setMsg(`The check stopped: ${e?.message ?? e}`);
    }
    setRunning(false);
  }

  async function onCopy() {
    if (!items) return;
    const text =
      `Prime Terminal setup check, ${new Date().toLocaleString("en-IN")}\n` +
      items.map((i) => `[${MARK[i.level]}] ${i.group}: ${i.label} - ${i.note}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Report copied. Paste it in the chat with your developer.");
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  if (!isOwner) return <p className="p-4 text-sm">The setup check is for the owner only.</p>;

  const groups: string[] = [];
  for (const i of items ?? []) if (!groups.includes(i.group)) groups.push(i.group);
  const problems = (items ?? []).filter((i) => i.level === "bad").length;
  const checks = (items ?? []).filter((i) => i.level === "warn").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Setup check</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Checks that everything is set up: this phone, the new cloud and the old database. It only reads, nothing is
        changed. The report has no names, no money and no passwords.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <button className={btn} disabled={running} onClick={onRun}>
          {running ? "Checking..." : "Run checks"}
        </button>
        {items && (
          <button className="underline text-sm" onClick={onCopy}>
            Copy report
          </button>
        )}
      </div>

      {items && (
        <p className="text-sm font-medium">
          {problems === 0 ? "No problem found." : `${problems} problem(s) found.`} {checks > 0 ? `${checks} to look at.` : ""}
        </p>
      )}

      {groups.map((g) => (
        <section key={g} className="space-y-2">
          <h2 className="font-medium">{g}</h2>
          {(items ?? [])
            .filter((i) => i.group === g)
            .map((i, idx) => (
              <div key={`${g}-${idx}`} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{i.label}</span>
                  <span className={`font-medium ${COLOR[i.level]}`}>{MARK[i.level]}</span>
                </div>
                <p className="text-muted-foreground">{i.note}</p>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}

export default function SetupCheckView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
