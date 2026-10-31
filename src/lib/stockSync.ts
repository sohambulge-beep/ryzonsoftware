import * as dataModule from "../data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCloudClient } from "./adminCheck";

export type Kind = "stock" | "customer";

export interface ReviewItem {
  kind: Kind;
  key: string;
  name: string;
  type: "newer" | "conflict";
  mine: string;
  cloud: string;
  cloudRev: number;
  cloudDevice: string;
  cloudAt: string;
}
export interface ReviewState {
  at: number;
  items: ReviewItem[];
  onlyCloud: number;
}
export interface RunResult {
  status: "ok" | "skipped" | "nokey" | "offline" | "nosession";
  uploaded: number;
}

export const SYNC_EVENT = "pt-sync-updated";

const KINDS: Kind[] = ["stock", "customer"];
const TABLE: Record<Kind, string> = { stock: "pos_stock", customer: "pos_customers" };
const COLS: Record<Kind, string> = {
  stock: "item_key, name, liters, price, cost, rev, device_id, updated_at",
  customer: "item_key, name, phone, balance, tab_limit, rev, device_id, updated_at",
};
const MAP_PREFIX = "pt_stock_sync_map:";
const REVIEW_PREFIX = "pt_sync_review:";
const UID_KEY = "pt_sync_last_uid";
const LOCK_KEY = "pt_stock_sync_lock";
const DEVICE_KEY = "pt_device_id";
const SAFETY_KEY = "pt_apply_safety";
const MAX_UPDATES = 200;
// Looked up by name at run time, so a missing export can never break the build.
const FN_NAMES = { load: "loadState", save: "saveState" };

type SyncMap = Record<string, { rev: number; sig: string }>;
interface Vals {
  a: number;
  b: number;
  c: number;
  sig: string;
}
interface Rec extends Vals {
  kind: Kind;
  key: string;
  name: string;
  phone: string;
}

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp = (n: number) => Math.max(-999999999, Math.min(999999999, n));
const r2 = (v: any) => clamp(Math.round(num(v) * 100) / 100);
const r3 = (v: any) => clamp(Math.round(num(v) * 1000) / 1000);

// "sig" is the text used to compare two values: litres to 3 decimals, money to 2.
function makeVals(kind: Kind, a: number, b: number, c: number): Vals {
  const sig =
    kind === "stock"
      ? `${a.toFixed(3)}|${b.toFixed(2)}|${c.toFixed(2)}`
      : `${a.toFixed(2)}|${b.toFixed(2)}`;
  return { a, b, c, sig };
}

function show(kind: Kind, v: Vals): string {
  return kind === "stock"
    ? `${v.a.toFixed(3)} L | price ${v.b.toFixed(2)} | cost ${v.c.toFixed(2)}`
    : `owes ${v.a.toFixed(2)} | limit ${v.b.toFixed(2)}`;
}

function cloudVals(kind: Kind, row: any): Vals {
  return kind === "stock"
    ? makeVals(kind, r3(row?.liters), r2(row?.price), r2(row?.cost))
    : makeVals(kind, r2(row?.balance), r2(row?.tab_limit), 0);
}

function localRecords(kind: Kind, db: any): Rec[] {
  const src = kind === "stock" ? db?.taps : db?.customers;
  const list: any[] = Array.isArray(src) ? src : [];
  const out: Rec[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const key = String(x?.id ?? "");
    if (!key || key.length > 160 || seen.has(key)) continue;
    seen.add(key);
    const v =
      kind === "stock"
        ? makeVals(kind, r3(x?.currentLiters), r2(x?.pricePerPint), r2(x?.costPerLiter))
        : makeVals(kind, r2(x?.currentBalance), r2(x?.tabLimit), 0);
    out.push({
      ...v,
      kind,
      key,
      name: String(x?.name ?? "").slice(0, 100),
      phone: String(x?.phone ?? "").slice(0, 30),
    });
  }
  return out;
}

function colsOf(rec: Rec): Record<string, any> {
  return rec.kind === "stock"
    ? { name: rec.name, liters: rec.a, price: rec.b, cost: rec.c }
    : { name: rec.name, phone: rec.phone, balance: rec.a, tab_limit: rec.b };
}

function dataFns(): { load: () => any; save: ((s: any) => void) | null } {
  const mod: any = dataModule;
  const load = mod[FN_NAMES.load];
  if (typeof load !== "function") throw new Error("The app data could not be read.");
  const save = mod[FN_NAMES.save];
  return { load, save: typeof save === "function" ? save : null };
}

function newId(): string {
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// A fixed name for this phone, so a conflict can say which phone changed the value.
export function deviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      d = newId();
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  } catch {
    return "unknown";
  }
}

function readMap(uid: string): SyncMap {
  try {
    const raw = localStorage.getItem(MAP_PREFIX + uid);
    const p = raw ? JSON.parse(raw) : {};
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out: SyncMap = {};
    for (const [k, v] of Object.entries<any>(p)) {
      if (v && Number.isInteger(v.rev) && typeof v.sig === "string") out[k] = { rev: v.rev, sig: v.sig };
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(uid: string, map: SyncMap) {
  try {
    localStorage.setItem(MAP_PREFIX + uid, JSON.stringify(map));
  } catch {
    // storage can be blocked; the next check simply works it out again
  }
}

function writeReview(uid: string, st: ReviewState) {
  try {
    localStorage.setItem(REVIEW_PREFIX + uid, JSON.stringify(st));
  } catch {
    // ignore
  }
}

function emit() {
  try {
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {
    // ignore
  }
}

export function getReview(): ReviewState {
  const empty: ReviewState = { at: 0, items: [], onlyCloud: 0 };
  try {
    const uid = localStorage.getItem(UID_KEY);
    if (!uid) return empty;
    const raw = localStorage.getItem(REVIEW_PREFIX + uid);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || !Array.isArray(p.items)) return empty;
    const items: ReviewItem[] = [];
    for (const x of p.items) {
      if (x && (x.kind === "stock" || x.kind === "customer") && typeof x.key === "string" && Number.isInteger(x.cloudRev)) {
        items.push({
          kind: x.kind,
          key: x.key,
          name: String(x.name ?? ""),
          type: x.type === "newer" ? "newer" : "conflict",
          mine: String(x.mine ?? ""),
          cloud: String(x.cloud ?? ""),
          cloudRev: x.cloudRev,
          cloudDevice: String(x.cloudDevice ?? ""),
          cloudAt: String(x.cloudAt ?? ""),
        });
      }
    }
    return { at: Number(p.at) || 0, items, onlyCloud: Number(p.onlyCloud) || 0 };
  } catch {
    return empty;
  }
}

function dropFromReview(uid: string, items: { kind: Kind; key: string }[]) {
  if (items.length === 0) return;
  try {
    const raw = localStorage.getItem(REVIEW_PREFIX + uid);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || !Array.isArray(p.items)) return;
    const gone = new Set(items.map((i) => `${i.kind}|${i.key}`));
    p.items = p.items.filter((x: any) => !gone.has(`${x?.kind}|${x?.key}`));
    localStorage.setItem(REVIEW_PREFIX + uid, JSON.stringify(p));
  } catch {
    // ignore
  }
}

async function currentUid(c: SupabaseClient): Promise<string> {
  const { data } = await c.auth.getSession();
  return data.session?.user.id ?? "";
}

// Always filtered by user_id, so an admin signed in on this phone never mixes in other customers.
async function fetchCloud(c: SupabaseClient, kind: Kind, uid: string, keys?: string[]): Promise<Map<string, any>> {
  let q: any = c.from(TABLE[kind]).select(COLS[kind]).eq("user_id", uid);
  if (keys) q = q.in("item_key", keys);
  const { data, error } = (await q.range(0, 1999)) as { data: any[] | null; error: any };
  if (error) throw new Error(error.message);
  const m = new Map<string, any>();
  for (const r of data ?? []) m.set(String(r.item_key), r);
  return m;
}

let busy = false;

// Sends this phone's changes to the cloud, and lists anything that needs a decision.
export async function runSync(): Promise<RunResult> {
  if (busy) return { status: "skipped", uploaded: 0 };
  const c = getCloudClient();
  if (!c) return { status: "nokey", uploaded: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { status: "offline", uploaded: 0 };
  try {
    const lock = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (Date.now() - lock < 90000) return { status: "skipped", uploaded: 0 }; // another tab is working
  } catch {
    // ignore
  }

  busy = true;
  try {
    localStorage.setItem(LOCK_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  try {
    const uid = await currentUid(c);
    if (!uid) return { status: "nosession", uploaded: 0 };
    try {
      localStorage.setItem(UID_KEY, uid);
    } catch {
      // ignore
    }

    const { load } = dataFns();
    const db = load();
    const map = readMap(uid);
    const device = deviceId();
    const items: ReviewItem[] = [];
    let uploaded = 0;
    let onlyCloud = 0;

    for (const kind of KINDS) {
      const locals = localRecords(kind, db);
      const cloud = await fetchCloud(c, kind, uid);
      const localKeys = new Set(locals.map((r) => r.key));
      cloud.forEach((_v, k) => {
        if (!localKeys.has(k)) onlyCloud += 1;
      });

      const inserts: Rec[] = [];
      const updates: { rec: Rec; base: number }[] = [];

      for (const rec of locals) {
        const mk = `${kind}|${rec.key}`;
        const m = map[mk];
        const row = cloud.get(rec.key);
        if (!row) {
          inserts.push(rec);
          continue;
        }
        const rev = Number(row.rev) || 1;
        const cv = cloudVals(kind, row);
        if (cv.sig === rec.sig) {
          map[mk] = { rev, sig: rec.sig }; // same values on both sides
          continue;
        }
        if (m && m.rev === rev && m.sig !== rec.sig) {
          updates.push({ rec, base: rev }); // only this phone changed it
          continue;
        }
        // The cloud has something this phone has not seen: never overwrite it silently.
        const type: "newer" | "conflict" = m && rev >= m.rev && m.sig === rec.sig ? "newer" : "conflict";
        items.push({
          kind,
          key: rec.key,
          name: rec.name || String(row.name ?? ""),
          type,
          mine: show(kind, rec),
          cloud: show(kind, cv),
          cloudRev: rev,
          cloudDevice: String(row.device_id ?? ""),
          cloudAt: String(row.updated_at ?? ""),
        });
      }

      for (let i = 0; i < inserts.length; i += 100) {
        const chunk = inserts.slice(i, i + 100);
        const rows = chunk.map((r) => ({
          user_id: uid,
          item_key: r.key,
          ...colsOf(r),
          rev: 1,
          device_id: device,
        }));
        const { error } = await c.from(TABLE[kind]).insert(rows);
        if (error) {
          if ((error as any).code === "23505") continue; // another phone added them at the same moment; the next check sorts it out
          throw new Error(error.message);
        }
        for (const r of chunk) map[`${kind}|${r.key}`] = { rev: 1, sig: r.sig };
        uploaded += chunk.length;
      }

      for (const u of updates.slice(0, MAX_UPDATES)) {
        const { data, error } = await c
          .from(TABLE[kind])
          .update({
            ...colsOf(u.rec),
            rev: u.base + 1,
            device_id: device,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", uid)
          .eq("item_key", u.rec.key)
          .eq("rev", u.base)
          .select("item_key");
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) continue; // someone else changed it first; the next check will show it
        map[`${kind}|${u.rec.key}`] = { rev: u.base + 1, sig: u.rec.sig };
        uploaded += 1;
      }
    }

    items.sort((a, b) => (a.type === b.type ? 0 : a.type === "conflict" ? -1 : 1));
    writeMap(uid, map);
    writeReview(uid, { at: Date.now(), items, onlyCloud });
    emit();
    return { status: "ok", uploaded };
  } finally {
    busy = false;
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
  }
}

// Puts this phone's values in the cloud, over the cloud's version.
export async function keepMine(list: ReviewItem[]): Promise<{ done: number; failed: number }> {
  const c = getCloudClient();
  if (!c) throw new Error("Not connected to the cloud. Sign in with My account.");
  const uid = await currentUid(c);
  if (!uid) throw new Error("You are not signed in.");
  const { load } = dataFns();
  const db = load();
  const map = readMap(uid);
  const device = deviceId();
  const finished: ReviewItem[] = [];
  let failed = 0;
  for (const it of list) {
    const rec = localRecords(it.kind, db).find((r) => r.key === it.key);
    if (!rec) {
      failed += 1;
      continue;
    }
    const { data, error } = await c
      .from(TABLE[it.kind])
      .update({
        ...colsOf(rec),
        rev: it.cloudRev + 1,
        device_id: device,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", uid)
      .eq("item_key", it.key)
      .eq("rev", it.cloudRev)
      .select("item_key");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      failed += 1; // changed again on another phone; press Check now
      continue;
    }
    map[`${it.kind}|${it.key}`] = { rev: it.cloudRev + 1, sig: rec.sig };
    finished.push(it);
  }
  writeMap(uid, map);
  dropFromReview(uid, finished);
  emit();
  return { done: finished.length, failed };
}

function matches(db: any, applied: { kind: Kind; key: string; sig: string }[]): boolean {
  for (const a of applied) {
    const rec = localRecords(a.kind, db).find((r) => r.key === a.key);
    if (!rec || rec.sig !== a.sig) return false;
  }
  return true;
}

// Writes the cloud's values into this phone's POS data, checks the result, then reloads the app.
export async function applyCloudValues(list: ReviewItem[]): Promise<number> {
  if (list.length === 0) return 0;
  const c = getCloudClient();
  if (!c) throw new Error("Not connected to the cloud. Sign in with My account.");
  const uid = await currentUid(c);
  if (!uid) throw new Error("You are not signed in.");
  const fns = dataFns();
  const save = fns.save;
  if (!save) {
    throw new Error("This version of the app cannot apply values by itself. Please change them by hand in the POS.");
  }

  const cloud: Record<Kind, Map<string, any>> = { stock: new Map(), customer: new Map() };
  for (const kind of KINDS) {
    const keys = list.filter((i) => i.kind === kind).map((i) => i.key);
    if (keys.length > 0) cloud[kind] = await fetchCloud(c, kind, uid, keys);
  }

  const before = JSON.stringify(fns.load());
  const db = fns.load();
  const applied: { kind: Kind; key: string; rev: number; sig: string }[] = [];
  for (const it of list) {
    const row = cloud[it.kind].get(it.key);
    if (!row) continue;
    const cv = cloudVals(it.kind, row);
    const src = it.kind === "stock" ? db?.taps : db?.customers;
    const arr: any[] = Array.isArray(src) ? src : [];
    const target = arr.find((x) => String(x?.id ?? "") === it.key);
    if (!target) continue;
    if (it.kind === "stock") {
      target.currentLiters = cv.a;
      if (typeof target.pricePerPint === "number") target.pricePerPint = cv.b;
      if (typeof target.costPerLiter === "number") target.costPerLiter = cv.c;
    } else {
      target.currentBalance = cv.a;
      if (typeof target.tabLimit === "number") target.tabLimit = cv.b;
    }
    applied.push({ kind: it.kind, key: it.key, rev: Number(row.rev) || 1, sig: cv.sig });
  }
  if (applied.length === 0) {
    throw new Error("Nothing to apply (the records changed or were removed). Press Check now.");
  }

  try {
    localStorage.setItem(SAFETY_KEY, before);
  } catch {
    // ignore
  }
  save(db);
  if (!matches(fns.load(), applied)) {
    try {
      save(JSON.parse(before));
    } catch {
      // ignore
    }
    throw new Error("The values could not be applied safely, so nothing was changed. Please change them by hand.");
  }

  const map = readMap(uid);
  for (const a of applied) map[`${a.kind}|${a.key}`] = { rev: a.rev, sig: a.sig };
  writeMap(uid, map);
  dropFromReview(uid, applied);
  emit();

  setTimeout(() => {
    try {
      if (!matches(fns.load(), applied)) save(db); // the app wrote its old copy back; put ours again
    } catch {
      // ignore
    }
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  }, 600);
  return applied.length;
}
