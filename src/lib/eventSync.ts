import { loadState } from "../data";
import { storeBridge, type PosEvent } from "../store";
import { getCloudClient } from "./adminCheck";
import { deviceId } from "./stockSync";

type Kind = PosEvent["kind"];

export interface MergeStats {
  at: number;
  uploaded: number;
  applied: number;
  note: string;
}

export const MERGE_EVENT = "pt-merge-updated";

const ON_PREFIX = "pt_evt_on:";
const PUB_PREFIX = "pt_evt_pub:";
const CURSOR_PREFIX = "pt_evt_cursor:";
const STATS_PREFIX = "pt_evt_stats:";
const LOCK_KEY = "pt_evt_lock";
const MAX_PUB = 30000;
const MAX_PAYLOAD = 100000;
const OVERLAP_MS = 120000;

const SPEC: { kind: Kind; list: string }[] = [
  { kind: "supplier", list: "suppliers" },
  { kind: "tap", list: "taps" },
  { kind: "customer", list: "customers" },
  { kind: "purchase", list: "purchases" },
  { kind: "expense", list: "expenses" },
  { kind: "invoice", list: "invoices" },
  { kind: "payment", list: "payments" },
];
const STRUCTURE: Kind[] = ["supplier", "tap", "customer"];

const listOf = (db: any, name: string): any[] => (Array.isArray(db?.[name]) ? db[name] : []);

function emit() {
  try {
    window.dispatchEvent(new Event(MERGE_EVENT));
  } catch {
    // ignore
  }
}

// A purchase number is not always unique across phones, so more of its fields go into its key.
function eventKey(kind: Kind, rec: any): string {
  const k = kind === "purchase" ? `${rec.id}|${rec.date}|${rec.litersAdded}|${rec.beerId}` : String(rec.id);
  return k.slice(0, 290);
}

// How many litres a new tap held when it was created (today's litres, plus what was sold, minus what was bought).
function creationLiters(tap: any, db: any): number {
  let l = Number(tap.currentLiters) || 0;
  for (const inv of listOf(db, "invoices")) {
    for (const it of Array.isArray(inv?.items) ? inv.items : []) {
      if (it?.beerId === tap.id) l += Number(it.litersTotal) || 0;
    }
  }
  for (const po of listOf(db, "purchases")) {
    if (po?.beerId === tap.id) l -= Number(po.litersAdded) || 0;
  }
  return Math.max(0, Math.round(l * 1000) / 1000);
}

// A new customer goes with a zero balance; what they owe arrives through their own bills and payments.
function payloadOf(kind: Kind, rec: any, db: any): any {
  if (kind === "customer") return { ...rec, currentBalance: 0, totalSpent: 0 };
  if (kind === "tap") return { ...rec, currentLiters: creationLiters(rec, db) };
  return rec;
}

function recordTime(kind: Kind, payload: any): number {
  const raw =
    kind === "invoice" || kind === "payment"
      ? payload?.timestamp
      : kind === "purchase" || kind === "expense"
        ? payload?.date
        : "";
  const t = Date.parse(String(raw ?? ""));
  return Number.isNaN(t) ? 0 : t;
}

function readPub(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(PUB_PREFIX + uid);
    const p = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(p) ? p.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writePub(uid: string, pub: Set<string>) {
  try {
    const arr = Array.from(pub);
    localStorage.setItem(PUB_PREFIX + uid, JSON.stringify(arr.length > MAX_PUB ? arr.slice(arr.length - MAX_PUB) : arr));
  } catch {
    // storage can be blocked; records are simply checked again next time, which is harmless
  }
}

export async function currentUid(): Promise<string> {
  const c = getCloudClient();
  if (!c) return "";
  try {
    const { data } = await c.auth.getSession();
    return data.session?.user.id ?? "";
  } catch {
    return "";
  }
}

export function isMergeOn(uid: string): boolean {
  try {
    return !!uid && localStorage.getItem(ON_PREFIX + uid) === "1";
  } catch {
    return false;
  }
}

export function getStats(uid: string): MergeStats | null {
  try {
    const raw = localStorage.getItem(STATS_PREFIX + uid);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || typeof p.at !== "number") return null;
    return { at: p.at, uploaded: Number(p.uploaded) || 0, applied: Number(p.applied) || 0, note: String(p.note ?? "") };
  } catch {
    return null;
  }
}

// Starts the merge on this phone. Everything that exists now (here and in the cloud) is treated as already shared.
export async function turnOn(): Promise<void> {
  const c = getCloudClient();
  if (!c) throw new Error("Sign in with My account first.");
  const uid = await currentUid();
  if (!uid) throw new Error("You are not signed in. Open My account and sign in.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Internet is needed to turn this on.");

  const db: any = loadState();
  const pub = new Set<string>();
  for (const s of SPEC) {
    for (const rec of listOf(db, s.list)) {
      if (rec && typeof rec.id === "string" && rec.id) pub.add(`${s.kind}|${eventKey(s.kind, rec)}`);
    }
  }

  let from = 0;
  let lastAt = "";
  for (;;) {
    const { data, error } = await c
      .from("pos_events")
      .select("kind, event_key, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows) {
      pub.add(`${r.kind}|${r.event_key}`);
      lastAt = r.created_at;
    }
    if (rows.length < 1000 || from >= 50000) break;
    from += 1000;
  }

  writePub(uid, pub);
  try {
    localStorage.setItem(CURSOR_PREFIX + uid, lastAt);
    localStorage.setItem(ON_PREFIX + uid, "1");
  } catch {
    throw new Error("Could not save this on the phone (storage is blocked).");
  }
  emit();
}

export function turnOff(uid: string) {
  try {
    localStorage.removeItem(ON_PREFIX + uid);
    localStorage.removeItem(PUB_PREFIX + uid);
    localStorage.removeItem(CURSOR_PREFIX + uid);
  } catch {
    // ignore
  }
  emit();
}

let busy = false;

// Sends this phone's new records, then adds the other phone's. Throws if something goes wrong.
export async function runEventSync(): Promise<MergeStats> {
  const out: MergeStats = { at: Date.now(), uploaded: 0, applied: 0, note: "" };
  if (busy) {
    out.note = "busy";
    return out;
  }
  const c = getCloudClient();
  if (!c) {
    out.note = "nokey";
    return out;
  }
  const uid = await currentUid();
  if (!uid) {
    out.note = "nosession";
    return out;
  }
  if (!isMergeOn(uid)) {
    out.note = "off";
    return out;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    out.note = "offline";
    return out;
  }
  try {
    const lock = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (Date.now() - lock < 60000) {
      out.note = "busy";
      return out;
    }
    localStorage.setItem(LOCK_KEY, String(Date.now()));
  } catch {
    // ignore
  }

  busy = true;
  try {
    const device = deviceId();
    const pub = readPub(uid);
    const db: any = loadState();

    // 1) Send this phone's new records.
    const fresh: { kind: Kind; key: string; payload: any }[] = [];
    for (const s of SPEC) {
      for (const rec of listOf(db, s.list)) {
        if (!rec || typeof rec.id !== "string" || !rec.id) continue;
        const key = eventKey(s.kind, rec);
        if (pub.has(`${s.kind}|${key}`)) continue;
        const payload = payloadOf(s.kind, rec, db);
        if (JSON.stringify(payload).length > MAX_PAYLOAD) continue;
        fresh.push({ kind: s.kind, key, payload });
      }
    }
    for (let i = 0; i < fresh.length; i += 100) {
      const chunk = fresh.slice(i, i + 100);
      const rows = chunk.map((f) => ({
        user_id: uid,
        kind: f.kind,
        event_key: f.key,
        payload: f.payload,
        device_id: device,
      }));
      const { error } = await c
        .from("pos_events")
        .upsert(rows, { onConflict: "user_id,kind,event_key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      for (const f of chunk) pub.add(`${f.kind}|${f.key}`);
      out.uploaded += chunk.length;
      writePub(uid, pub);
    }

    // 2) Add what the other phone made.
    if (storeBridge.merge) {
      const cursor = localStorage.getItem(CURSOR_PREFIX + uid) || "";
      const since = cursor
        ? new Date(Math.max(0, new Date(cursor).getTime() - OVERLAP_MS)).toISOString()
        : "1970-01-01T00:00:00Z";
      const incoming: { kind: Kind; key: string; payload: any; device: string; created: string }[] = [];
      let lastAt = cursor;
      let from = 0;
      for (let page = 0; page < 20; page++) {
        const { data, error } = await c
          .from("pos_events")
          .select("kind, event_key, payload, device_id, created_at")
          .eq("user_id", uid)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + 499);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        for (const r of rows) {
          if (String(r.created_at) > lastAt) lastAt = String(r.created_at);
          if (pub.has(`${r.kind}|${r.event_key}`)) continue;
          incoming.push({
            kind: r.kind as Kind,
            key: String(r.event_key),
            payload: r.payload,
            device: String(r.device_id ?? ""),
            created: String(r.created_at),
          });
        }
        if (rows.length < 500) break;
        from += 500;
      }

      const todo = incoming.filter((e) => e.device !== device);
      todo.sort((a, b) => {
        const ra = STRUCTURE.includes(a.kind) ? 0 : 1;
        const rb = STRUCTURE.includes(b.kind) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        const ta = recordTime(a.kind, a.payload);
        const tb = recordTime(b.kind, b.payload);
        if (ta !== tb) return ta - tb;
        return a.created < b.created ? -1 : a.created > b.created ? 1 : 0;
      });
      if (todo.length > 0) {
        storeBridge.merge(todo.map((e) => ({ kind: e.kind, payload: e.payload })));
        out.applied = todo.length;
      }
      for (const e of incoming) pub.add(`${e.kind}|${e.key}`);
      writePub(uid, pub);
      if (lastAt) {
        try {
          localStorage.setItem(CURSOR_PREFIX + uid, lastAt);
        } catch {
          // ignore
        }
      }
    } else {
      out.note = "The POS is not open on this screen yet.";
    }

    out.at = Date.now();
    try {
      localStorage.setItem(STATS_PREFIX + uid, JSON.stringify(out));
    } catch {
      // ignore
    }
    emit();
    return out;
  } finally {
    busy = false;
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
  }
}
