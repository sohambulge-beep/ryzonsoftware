import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "pt_offline_queue";
const FAILED_KEY = "pt_offline_failed";
const CACHE_KEY = "pt_offline_cache";
const LOCK_KEY = "pt_offline_lock";
const UID_KEY = "pt_offline_uid";
export const QUEUE_EVENT = "pt-offline-queue";

const MAX_QUEUE = 500;
const MAX_FAILED = 100;
const MAX_CACHE_ENTRIES = 60;
const MAX_CACHE_BODY = 250000;
const MAX_CACHE_TOTAL = 3000000;
const PROBE_MS = 3000;
// Functions that only save something and whose answer the app does not need.
const QUEUE_RPC = ["create_excise_tp_receipt", "create_bank_transfer"];

export interface QueueItem {
  id: string;
  uid: string;
  at: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  label: string;
  rpc: boolean;
  tries: number;
}
export interface FailedItem extends QueueItem {
  error: string;
  failedAt: number;
}
export interface FlushResult {
  sent: number;
  failed: number;
  left: number;
  note: string;
}

let installed = false;
let origFetch: any = null;
let flushing = false;
let lastCachedAt = 0;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const p = JSON.parse(raw);
    return p ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: any): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function emit() {
  try {
    window.dispatchEvent(new Event(QUEUE_EVENT));
  } catch {
    // ignore
  }
}

const validItem = (x: any) =>
  x &&
  typeof x.id === "string" &&
  typeof x.uid === "string" &&
  typeof x.url === "string" &&
  typeof x.method === "string" &&
  typeof x.body === "string";

export function getQueue(): QueueItem[] {
  const q = readJson<any[]>(QUEUE_KEY, []);
  return Array.isArray(q) ? (q.filter(validItem) as QueueItem[]) : [];
}

export function getFailed(): FailedItem[] {
  const q = readJson<any[]>(FAILED_KEY, []);
  return Array.isArray(q) ? (q.filter(validItem) as FailedItem[]) : [];
}

export function isInstalled(): boolean {
  return installed;
}

export function getLastCachedAt(): number {
  return lastCachedAt;
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function isRest(url: string): boolean {
  return url.includes("/rest/v1/");
}

function tableOf(url: string): string {
  const i = url.indexOf("/rest/v1/");
  if (i === -1) return "";
  const rest = url.slice(i + "/rest/v1/".length).split("?")[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

function headersToObj(h: any): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    new Headers(h || undefined).forEach((v, k) => {
      out[k] = v;
    });
  } catch {
    // ignore
  }
  delete out['authorization']; // a fresh login token is added when the entry is sent
  return out;
}

function uidFromStorage(): string {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const p = JSON.parse(localStorage.getItem(k) || "null");
        const id = p?.user?.id ?? p?.currentSession?.user?.id;
        if (typeof id === "string" && id) return id;
      }
    }
  } catch {
    // ignore
  }
  return "";
}

// Works without internet: the login is read from what this phone saved.
async function knownUid(): Promise<string> {
  const fromStore = uidFromStorage();
  if (fromStore) {
    try {
      localStorage.setItem(UID_KEY, fromStore);
    } catch {
      // ignore
    }
    return fromStore;
  }
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user.id;
    if (id) {
      try {
        localStorage.setItem(UID_KEY, id);
      } catch {
        // ignore
      }
      return id;
    }
  } catch {
    // ignore
  }
  try {
    return localStorage.getItem(UID_KEY) || "";
  } catch {
    return "";
  }
}

// True if the server answers at all (any answer counts), so a failure is a real "no internet".
async function reachable(url: string): Promise<boolean> {
  try {
    const origin = new URL(url).origin;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), PROBE_MS);
    try {
      await fetch(`${origin}/auth/v1/health`, { cache: "no-store", signal: ctl.signal });
      return true;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return false;
  }
}

function isQueueable(method: string, table: string, init: any): boolean {
  if (method !== "POST" && method !== "PATCH" && method !== "DELETE") return false;
  if (init?.body != null && typeof init.body !== "string") return false;
  let prefer = "";
  try {
    prefer = new Headers(init?.headers || undefined).get("prefer") || "";
  } catch {
    // ignore
  }
  if (prefer.toLowerCase().includes("return=representation")) return false; // the app needs the saved row back
  if (table.startsWith("rpc/")) return QUEUE_RPC.includes(table.slice(4));
  return table !== "";
}

async function enqueue(method: string, url: string, init: any, table: string): Promise<boolean> {
  const uid = await knownUid();
  if (!uid) return false;
  const q = getQueue();
  if (q.length >= MAX_QUEUE) return false;
  q.push({
    id: newId(),
    uid,
    at: Date.now(),
    method,
    url,
    headers: headersToObj(init?.headers),
    body: typeof init?.body === "string" ? init.body : "",
    label: `${method} ${table}`,
    rpc: table.startsWith("rpc/"),
    tries: 0,
  });
  if (!writeJson(QUEUE_KEY, q)) return false; // never say "saved" if this phone refused to keep it
  emit();
  return true;
}

function synthetic(method: string, isRpc: boolean): Response {
  const h = { "x-pt-queued": "1" };
  if (isRpc) {
    return new Response("null", { status: 200, headers: { "content-type": "application/json", ...h } });
  }
  return new Response(null, { status: method === "POST" ? 201 : 204, headers: h });
}

function cacheKey(uid: string, accept: string, url: string): string {
  return `${uid}|${accept}|${url}`;
}

async function remember(key: string, res: Response) {
  try {
    const body = await res.text();
    if (body.length > MAX_CACHE_BODY) return;
    const map = readJson<Record<string, any>>(CACHE_KEY, {});
    map[key] = {
      t: Date.now(),
      ct: res.headers.get("content-type") || "application/json",
      cr: res.headers.get("content-range") || "",
      body,
    };
    const keys = Object.keys(map).sort((a, b) => (map[a].t || 0) - (map[b].t || 0));
    while (keys.length > MAX_CACHE_ENTRIES) delete map[keys.shift() as string];
    while (keys.length > 1 && JSON.stringify(map).length > MAX_CACHE_TOTAL) delete map[keys.shift() as string];
    if (!writeJson(CACHE_KEY, map)) {
      while (keys.length > 1 && keys.length > 10) delete map[keys.shift() as string];
      writeJson(CACHE_KEY, map);
    }
  } catch {
    // never block a read
  }
}

function recall(key: string): Response | null {
  const map = readJson<Record<string, any>>(CACHE_KEY, {});
  const e = map[key];
  if (!e || typeof e.body !== "string") return null;
  const headers: Record<string, string> = {
    "content-type": e.ct || "application/json",
    "x-pt-cached": "1",
  };
  if (e.cr) headers["content-range"] = e.cr;
  lastCachedAt = Date.now();
  emit();
  return new Response(e.body, { status: 200, headers });
}

async function readThrough(orig: any, input: any, init: any, url: string): Promise<Response> {
  const uid = await knownUid();
  let accept = "";
  try {
    accept = new Headers(init?.headers || undefined).get("accept") || "";
  } catch {
    // ignore
  }
  const key = uid ? cacheKey(uid, accept, url) : "";
  const offlineNow = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!offlineNow) {
    try {
      const res: Response = await orig(input, init);
      if (res.ok && key) void remember(key, res.clone());
      return res;
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      const hit = key ? recall(key) : null;
      if (hit) return hit;
      throw e;
    }
  }
  const hit = key ? recall(key) : null;
  if (hit) return hit;
  return orig(input, init); // nothing saved for this: it fails the usual way
}

async function wrappedFetch(input: any, init?: any): Promise<Response> {
  const orig = origFetch;
  const url = typeof input === "string" ? input : String(input?.url ?? input);
  if (!isRest(url)) return orig(input, init);
  const method = String(init?.method ?? (typeof input === "object" ? input?.method : "") ?? "GET").toUpperCase() || "GET";
  const table = tableOf(url);

  if (method === "GET") return readThrough(orig, input, init, url);
  if (!isQueueable(method, table, init)) return orig(input, init);

  const offlineNow = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!offlineNow) {
    try {
      return await orig(input, init);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      if (await reachable(url)) throw e; // the server answers, so this is another problem: do not queue
    }
  }
  const ok = await enqueue(method, url, init, table);
  if (!ok) throw new TypeError("No internet, and this entry could not be saved on this phone.");
  return synthetic(method, table.startsWith("rpc/"));
}

// Switches the offline layer on. Returns false (and changes nothing) if the database library has no such hook.
export function installOfflineQueue(): boolean {
  if (installed) return true;
  try {
    const rest: any = (supabase as any).rest;
    if (!rest || typeof rest.fetch !== "function") return false;
    origFetch = rest.fetch;
    rest.fetch = wrappedFetch;
    installed = true;
    return true;
  } catch {
    return false;
  }
}

// Clears what must not stay for the next person: the saved lists and the remembered login.
export function onSignedOut() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(UID_KEY);
  } catch {
    // ignore
  }
}

function removeById(id: string) {
  writeJson(
    QUEUE_KEY,
    getQueue().filter((x) => x.id !== id)
  );
}

function bumpTries(id: string) {
  writeJson(
    QUEUE_KEY,
    getQueue().map((x) => (x.id === id ? { ...x, tries: x.tries + 1 } : x))
  );
}

function moveToFailed(item: QueueItem, error: string) {
  removeById(item.id);
  const list = getFailed();
  list.unshift({ ...item, error: error.slice(0, 200), failedAt: Date.now() });
  writeJson(FAILED_KEY, list.slice(0, MAX_FAILED));
}

function messageOf(text: string, status: number): string {
  try {
    const j = JSON.parse(text);
    const m = j?.message || j?.hint || j?.details;
    if (m) return String(m);
  } catch {
    // ignore
  }
  return text ? text.slice(0, 160) : `The server refused it (${status}).`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export function retryFailed(id: string) {
  const list = getFailed();
  const item = list.find((x) => x.id === id);
  if (!item) return;
  writeJson(
    FAILED_KEY,
    list.filter((x) => x.id !== id)
  );
  const { error: _e, failedAt: _f, ...rest } = item;
  writeJson(QUEUE_KEY, [...getQueue(), { ...rest, tries: 0 }]);
  emit();
}

export function discardFailed(id: string) {
  writeJson(
    FAILED_KEY,
    getFailed().filter((x) => x.id !== id)
  );
  emit();
}

// Sends the saved entries one by one, in the order they were made.
export async function flushQueue(): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, left: 0, note: "" };
  if (!installed || !origFetch) {
    result.note = "The offline layer is not active.";
    return result;
  }
  if (flushing) {
    result.note = "Already sending.";
    return result;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    result.left = getQueue().length;
    result.note = "No internet yet.";
    return result;
  }
  try {
    const lock = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (Date.now() - lock < 60000) {
      result.note = "Already sending.";
      return result;
    }
  } catch {
    // ignore
  }
  if (getQueue().length === 0) return result;

  flushing = true;
  try {
    localStorage.setItem(LOCK_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? "";
    if (!uid) {
      result.note = "Sign in again to send the saved entries.";
      return result;
    }
    for (const item of getQueue()) {
      if (item.uid !== uid) continue; // saved under another login: never sent from this one
      let res: Response;
      try {
        res = await origFetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body === "" ? undefined : item.body,
        });
      } catch {
        result.note = "Still no internet.";
        break;
      }
      if (res.ok) {
        removeById(item.id);
        result.sent += 1;
        emit();
        continue;
      }
      const text = await safeText(res);
      if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) {
        bumpTries(item.id);
        result.note = `The server said ${res.status}. Will try again.`;
        break;
      }
      moveToFailed(item, messageOf(text, res.status));
      result.failed += 1;
    }
  } finally {
    flushing = false;
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
    result.left = getQueue().length;
    emit();
  }
  return result;
}
