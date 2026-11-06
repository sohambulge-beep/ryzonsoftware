import { loadState } from "../data";

export interface ActEntry {
  id: string;
  at: string;
  type: string;
  text: string;
  by: string;
}

export const ACTIVITY_EVENT = "pt-activity";

const LOG_KEY = "pt_activity_log";
const SNAP_KEY = "pt_activity_snap";
const MAX_LOG = 1500;
const BULK = 25;
const SEP = "\u001f";
const CLOUD_SESSION_KEY = "pt-cloud-backup-auth";
const ROLE_KEY = "pt_role_cache";

// A small picture of the data, compared every few seconds to find what changed.
interface Snap {
  inv: string[];
  pay: string[];
  pur: string[];
  exp: Record<string, string>;
  cus: Record<string, string>;
  tap: Record<string, string>;
  sup: Record<string, string>;
  set: string;
}

const listOf = (db: any, k: string): any[] => (Array.isArray(db?.[k]) ? db[k] : []);
const str = (v: any) => String(v ?? "");

// Same key the two-phone merge uses for a purchase.
function purchaseKey(po: any): string {
  return `${po.id}|${po.date}|${po.litersAdded}|${po.beerId}`.slice(0, 290);
}

function buildSnap(db: any): Snap {
  const snap: Snap = { inv: [], pay: [], pur: [], exp: {}, cus: {}, tap: {}, sup: {}, set: "" };
  for (const x of listOf(db, "invoices")) if (x && typeof x.id === "string") snap.inv.push(x.id);
  for (const x of listOf(db, "payments")) if (x && typeof x.id === "string") snap.pay.push(x.id);
  for (const x of listOf(db, "purchases")) if (x && typeof x.id === "string") snap.pur.push(purchaseKey(x));
  for (const x of listOf(db, "expenses")) {
    if (x && typeof x.id === "string") snap.exp[x.id] = `${str(x.title)}${SEP}${str(x.amount)}`;
  }
  for (const x of listOf(db, "customers")) {
    if (x && typeof x.id === "string") snap.cus[x.id] = `${str(x.name)}${SEP}${str(x.phone)}${SEP}${str(x.tabLimit)}`;
  }
  for (const x of listOf(db, "taps")) {
    if (x && typeof x.id === "string") {
      snap.tap[x.id] = `${str(x.name)}${SEP}${str(x.pricePerPint)}${SEP}${str(x.costPerLiter)}`;
    }
  }
  for (const x of listOf(db, "suppliers")) {
    if (x && typeof x.id === "string") snap.sup[x.id] = str(x.name);
  }
  snap.set = `${str(db?.settings?.barName)}${SEP}${str(db?.settings?.taxRate)}`;
  return snap;
}

function parseSnap(raw: string | null): Snap | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    const rec = (v: any): Record<string, string> => {
      const out: Record<string, string> = {};
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, val] of Object.entries<any>(v)) if (typeof val === "string") out[k] = val;
      }
      return out;
    };
    const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x: any) => typeof x === "string") : []);
    return {
      inv: arr(p.inv),
      pay: arr(p.pay),
      pur: arr(p.pur),
      exp: rec(p.exp),
      cus: rec(p.cus),
      tap: rec(p.tap),
      sup: rec(p.sup),
      set: typeof p.set === "string" ? p.set : "",
    };
  } catch {
    return null;
  }
}

function cloudUid(): string {
  try {
    const raw = localStorage.getItem(CLOUD_SESSION_KEY);
    const p = raw ? JSON.parse(raw) : null;
    const id = p?.user?.id ?? p?.currentSession?.user?.id;
    return typeof id === "string" ? id : "";
  } catch {
    return "";
  }
}

// The records that came from, or already went to, the other phone through the merge.
function readPubSet(): Set<string> {
  const uid = cloudUid();
  if (!uid) return new Set();
  try {
    const raw = localStorage.getItem(`pt_evt_pub:${uid}`);
    const p = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(p) ? p.filter((x: any) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

// Who is using the phone right now: the login email and the role.
function actor(): string {
  let email = "";
  let uid = "";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const p = JSON.parse(localStorage.getItem(k) || "null");
        const u = p?.user ?? p?.currentSession?.user;
        if (u && typeof u.email === "string") {
          email = u.email;
          uid = str(u.id);
          break;
        }
      }
    }
  } catch {
    // ignore
  }
  let role = "";
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    const r = raw ? JSON.parse(raw) : null;
    if (r && r.uid === uid && typeof r.role === "string") role = r.role;
  } catch {
    // ignore
  }
  const who = email || "this phone";
  return role ? `${who} (${role})` : who;
}

interface Ctx {
  by: string;
  cur: string;
  now: string;
  skipped: (kind: string, key: string) => boolean;
}

function diff(prev: Snap, cur: Snap, db: any, ctx: Ctx): ActEntry[] {
  const out: ActEntry[] = [];
  let n = 0;
  const add = (type: string, text: string) => {
    n += 1;
    out.push({
      id: `${Date.now().toString(36)}${n}${Math.random().toString(36).slice(2, 6)}`,
      at: ctx.now,
      type,
      text,
      by: ctx.by,
    });
  };
  const m = (v: any) => `${ctx.cur}${(Number(v) || 0).toFixed(2)}`;

  const prevInv = new Set(prev.inv);
  for (const inv of listOf(db, "invoices")) {
    if (!inv || typeof inv.id !== "string" || prevInv.has(inv.id)) continue;
    if (ctx.skipped("invoice", inv.id)) continue;
    add(
      "bill",
      `Bill ${str(inv.invoiceNo)} ${m(inv.total)} (${str(inv.paymentMethod)}) - ${str(inv.customerName) || "Walk-in Guest"}`
    );
  }

  const prevPay = new Set(prev.pay);
  for (const p of listOf(db, "payments")) {
    if (!p || typeof p.id !== "string" || prevPay.has(p.id)) continue;
    if (ctx.skipped("payment", p.id)) continue;
    add("payment", `Payment ${m(p.amount)} from ${str(p.customerName)} (${str(p.paymentMethod)})`);
  }

  const prevPur = new Set(prev.pur);
  for (const po of listOf(db, "purchases")) {
    if (!po || typeof po.id !== "string") continue;
    const key = purchaseKey(po);
    if (prevPur.has(key) || ctx.skipped("purchase", key)) continue;
    const tap = listOf(db, "taps").find((t) => t && t.id === po.beerId);
    add(
      "purchase",
      `Purchase: ${str(po.kegQty)} keg(s) of ${str(tap?.name) || "a beer"} (${(Number(po.litersAdded) || 0).toFixed(1)} L) for ${m(po.totalCost)}`
    );
  }

  for (const id of Object.keys(cur.exp)) {
    if (id in prev.exp) continue;
    if (ctx.skipped("expense", id)) continue;
    const [title, amount] = (cur.exp[id] ?? "").split(SEP);
    add("expense", `Expense ${m(amount)}: ${title}`);
  }
  for (const id of Object.keys(prev.exp)) {
    if (id in cur.exp) continue;
    const [title, amount] = (prev.exp[id] ?? "").split(SEP);
    add("expense-deleted", `Expense deleted: ${title} (${m(amount)})`);
  }

  for (const id of Object.keys(cur.cus)) {
    const now = cur.cus[id] ?? "";
    if (!(id in prev.cus)) {
      if (ctx.skipped("customer", id)) continue;
      add("customer", `Customer added: ${now.split(SEP)[0]}`);
      continue;
    }
    const old = prev.cus[id] ?? "";
    if (old === now) continue;
    const [on, op, ol] = old.split(SEP);
    const [nn, np, nl] = now.split(SEP);
    if (on !== nn) add("customer", `Customer renamed: ${on} to ${nn}`);
    if (op !== np) add("customer", `Phone of ${nn} changed`);
    if (ol !== nl) add("customer", `Tab limit of ${nn} changed: ${ol} to ${nl}`);
  }

  for (const id of Object.keys(cur.tap)) {
    const now = cur.tap[id] ?? "";
    if (!(id in prev.tap)) {
      if (ctx.skipped("tap", id)) continue;
      const [nm, price] = now.split(SEP);
      add("stock", `Beer added: ${nm} (price ${price})`);
      continue;
    }
    const old = prev.tap[id] ?? "";
    if (old === now) continue;
    const [on, op, oc] = old.split(SEP);
    const [nn, np, nc] = now.split(SEP);
    if (on !== nn) add("price", `Beer renamed: ${on} to ${nn}`);
    if (op !== np) add("price", `Price of ${nn} changed: ${op} to ${np}`);
    if (oc !== nc) add("price", `Cost per litre of ${nn} changed: ${oc} to ${nc}`);
  }

  for (const id of Object.keys(cur.sup)) {
    if (id in prev.sup) continue;
    if (ctx.skipped("supplier", id)) continue;
    add("stock", `Supplier added: ${cur.sup[id] ?? ""}`);
  }

  if (prev.set !== cur.set) {
    const [ob, ot] = prev.set.split(SEP);
    const [nb, nt] = cur.set.split(SEP);
    if (ob !== nb) add("settings", `Business name changed: ${ob} to ${nb}`);
    if (ot !== nt) add("settings", `Tax rate changed: ${ot} to ${nt}`);
  }

  return out;
}

export function readActivityLog(): ActEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const p = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(p)) return [];
    const out: ActEntry[] = [];
    for (const x of p) {
      if (x && typeof x.id === "string" && typeof x.text === "string") {
        out.push({
          id: x.id,
          at: str(x.at),
          type: str(x.type),
          text: x.text.slice(0, 300),
          by: str(x.by).slice(0, 100),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function appendLog(entries: ActEntry[]): boolean {
  try {
    const next = [...entries.slice().reverse(), ...readActivityLog()].slice(0, MAX_LOG);
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
    try {
      window.dispatchEvent(new Event(ACTIVITY_EVENT));
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}

// Compares the data with the picture taken last time and writes down what changed. Returns how many lines were added.
export function runActivityCheck(): number {
  let db: any;
  try {
    db = loadState();
  } catch {
    return 0;
  }
  const cur = buildSnap(db);
  const curRaw = JSON.stringify(cur);
  let prevRaw: string | null = null;
  try {
    prevRaw = localStorage.getItem(SNAP_KEY);
  } catch {
    prevRaw = null;
  }
  if (prevRaw === curRaw) return 0;

  const prev = parseSnap(prevRaw);
  const save = () => {
    try {
      localStorage.setItem(SNAP_KEY, curRaw);
    } catch {
      // ignore
    }
  };
  if (!prev) {
    save(); // the first picture is only the starting point, nothing is written down
    return 0;
  }

  let pub: Set<string> | null = null;
  const skipped = (kind: string, key: string) => {
    if (!pub) pub = readPubSet();
    return pub.has(`${kind}|${key}`);
  };
  const now = new Date().toISOString();
  const by = actor();
  let entries = diff(prev, cur, db, { by, cur: str(db?.settings?.currency) || "₹", now, skipped });

  if (entries.length > BULK) {
    entries = [
      {
        id: `${Date.now().toString(36)}bulk`,
        at: now,
        type: "bulk",
        text: `Many changes at once (${entries.length}): data was restored, replaced or cleared`,
        by,
      },
    ];
  }
  if (entries.length > 0 && !appendLog(entries)) return 0; // could not write: try again next time
  save();
  return entries.length;
}
