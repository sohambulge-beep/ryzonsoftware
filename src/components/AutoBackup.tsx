import { Component, useEffect, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadState } from "../data";

const LS_URL = "pt_cloud_url";
const LS_KEY = "pt_cloud_key";
const LAST_HASH = "pt_auto_last_hash";
const LAST_AT = "pt_auto_last_at";
const LOCK = "pt_auto_lock";
const MIN_GAP_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 20000;
const EVERY_MS = 30 * 60 * 1000;
const MAX_BYTES = 4000000;

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

async function check(setProblem: (s: string) => void) {
  try {
    const url = localStorage.getItem(LS_URL);
    const key = localStorage.getItem(LS_KEY);
    if (!url || !key) return; // cloud backup was never set up, so there is nothing to do

    const lock = Number(localStorage.getItem(LOCK) || 0);
    if (Date.now() - lock < 120000) return; // another tab is already doing it

    const db = loadState();
    const json = JSON.stringify(db);
    const hash = hashOf(json);

    if (hash === localStorage.getItem(LAST_HASH)) {
      setProblem("");
      return; // nothing new since the last automatic backup
    }
    const lastAt = Number(localStorage.getItem(LAST_AT) || 0);
    if (lastAt && Date.now() - lastAt < MIN_GAP_MS) return; // too soon, wait

    const bytes = new Blob([json]).size;
    if (bytes > MAX_BYTES) {
      setProblem(`the data is too big (${Math.round(bytes / 1024)} KB) for automatic backup`);
      return;
    }

    localStorage.setItem(LOCK, String(Date.now()));
    const client = getClient(url, key);
    const { data: s } = await client.auth.getSession();
    if (!s.session) {
      setProblem("you are not signed in (open Excise, Cloud backup, and sign in)");
      return;
    }
    const summary = {
      taps: db.taps.length,
      customers: db.customers.length,
      invoices: db.invoices.length,
      expenses: db.expenses.length,
      size_kb: Math.round(bytes / 1024),
      hash,
    };
    const { error } = await client.from("app_backups").insert({ label: "auto", summary, data: db });
    if (error) throw new Error(error.message);

    localStorage.setItem(LAST_HASH, hash);
    localStorage.setItem(LAST_AT, String(Date.now()));
    setProblem("");
  } catch (e: any) {
    setProblem(`could not save (${e?.message ?? e})`);
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
  const [problem, setProblem] = useState("");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const first = setTimeout(() => check(setProblem), FIRST_CHECK_MS);
    const every = setInterval(() => check(setProblem), EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  if (!problem || hidden) return null;
  return (
    <div className="fixed bottom-2 left-2 z-50 flex max-w-xs items-start gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <span>Cloud backup problem: {problem}.</span>
      <button className="underline" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}

export default function AutoBackup() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
