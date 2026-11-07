import { Component, useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/store";
import { getStorageInfo, loadState } from "@/data";
import { getFailed, getQueue } from "@/lib/offlineQueue";
import { PROVIDER_PHONE } from "@/lib/providerConfig";
import { useOwnerAccess } from "@/lib/ownerAccess";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const MAX_URL = 1900;
const LIMIT_CHARS = 5000000;

const stamp = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

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

function savedRole(): string {
  try {
    const raw = localStorage.getItem("pt_role_cache");
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p.role === "string" ? p.role : "";
  } catch {
    return "";
  }
}

// Only counts and statuses. No names, no money and no passwords.
function buildDetails(counts: { bills: number; customers: number; beers: number }): string {
  const L: string[] = [];
  L.push(`Time: ${new Date().toLocaleString("en-IN")}`);
  L.push(`Internet: ${typeof navigator !== "undefined" && navigator.onLine === false ? "no" : "yes"}`);
  const email = lsGet("pt_cloud_email");
  const role = savedRole();
  L.push(`Login: ${email || "not signed in to My account"}${role ? ` (${role})` : ""}`);
  L.push(`Data on this phone: ${counts.bills} bills, ${counts.customers} customers, ${counts.beers} beers`);
  let storage = "unknown";
  try {
    const info = getStorageInfo();
    const pct = Math.round((info.usedChars * 100) / LIMIT_CHARS);
    storage = `${pct}% used${info.full ? " (FULL)" : ""}; safe copy ${info.lastIdbAt > 0 ? stamp(info.lastIdbAt) : "none"}`;
  } catch {
    // ignore
  }
  L.push(`Phone storage: ${storage}`);
  const lastBackup = Number(lsGet("pt_auto_last_at")) || 0;
  L.push(`Last automatic cloud backup: ${lastBackup ? stamp(lastBackup) : "none yet"}`);
  let waiting = 0;
  let refused = 0;
  try {
    waiting = getQueue().length;
    refused = getFailed().length;
  } catch {
    // ignore
  }
  L.push(`Entries waiting to be sent: ${waiting}, refused: ${refused}`);
  L.push(`Two-phone merge: ${mergeIsOn() ? "on" : "off"}`);
  let installed = false;
  try {
    installed = window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    // ignore
  }
  L.push(`Installed on the home screen: ${installed ? "yes" : "no"}`);
  L.push(`Phone: ${typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : ""}`);
  return L.join("\n");
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">Help could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { db } = useStore();
  const { isOwner } = useOwnerAccess();
  const [problem, setProblem] = useState("");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState("");

  const counts = {
    bills: Array.isArray(db.invoices) ? db.invoices.length : 0,
    customers: Array.isArray(db.customers) ? db.customers.length : 0,
    beers: Array.isArray(db.taps) ? db.taps.length : 0,
  };

  // The details are made after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setDetails(buildDetails(counts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const text = `Prime Terminal help request\n\nProblem: ${problem.trim() || "(not written)"}\n\nDetails:\n${details}`;
  const digits = PROVIDER_PHONE.replace(/\D/g, "");
  const url = `https://wa.me/${digits.length >= 10 ? digits : ""}?text=${encodeURIComponent(text)}`;
  const tooLong = url.length > MAX_URL;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Copied. Paste it in a chat.");
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  function onDownload() {
    try {
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const blob = new Blob([JSON.stringify(loadState(), null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-my-data-${day}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg("Your data file was downloaded.");
    } catch {
      setMsg("The download did not work here.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Help</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Having a problem? Write it below and send it on WhatsApp. The message also carries the details shown below, so
        it can be understood quickly. It has counts and status only: no customer names, no money amounts and no
        passwords.
      </p>

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">What is the problem?</span>
        <textarea
          className={`${input} w-full`}
          rows={4}
          maxLength={300}
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
        />
      </label>

      <section className="space-y-2">
        <h2 className="font-medium">Details that will be sent</h2>
        <pre className="whitespace-pre-wrap rounded-md border p-3 text-xs">{details || "Loading..."}</pre>
        <button className="underline text-sm" onClick={() => setDetails(buildDetails(counts))}>
          Refresh details
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        {!tooLong ? (
          <a className={btn} href={url} target="_blank" rel="noopener noreferrer">
            Send on WhatsApp
          </a>
        ) : (
          <button className={btn} disabled>
            Send on WhatsApp
          </button>
        )}
        <button className="underline text-sm" onClick={onCopy}>
          Copy
        </button>
      </div>
      {tooLong && <p className="text-xs text-muted-foreground">The message is too long for WhatsApp. Use Copy.</p>}

      {isOwner && (
        <section className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">Your data</p>
          <p className="text-muted-foreground">Download all the POS data on this phone as one file (a safe copy).</p>
          <button className="underline" onClick={onDownload}>
            Download my data
          </button>
        </section>
      )}
    </div>
  );
}

export default function HelpView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
