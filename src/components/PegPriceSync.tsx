import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCloudClient } from "@/lib/adminCheck";
import { listExciseBrands, type ExciseBrand } from "@/lib/exciseService";

const CFG_KEY = "taptrack_peg_cfg";
const DEFAULT_SIZES = [30, 60];
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const input = "rounded-md border px-3 py-2 text-sm bg-background";

interface Cfg {
  sizes: number[];
  prices: Record<string, Record<string, string>>;
}

type CloudState =
  | { kind: "unknown" }
  | { kind: "none" }
  | { kind: "ok"; at: string; text: string }
  | { kind: "error"; text: string };

// Checks a copy of the settings (from this phone or from the cloud) and keeps only what the counter understands.
function cleanCfg(p: any): Cfg | null {
  if (!p || typeof p !== "object") return null;
  const sizes: number[] = Array.isArray(p.sizes)
    ? p.sizes.filter((n: any) => Number.isInteger(n) && n >= 5 && n <= 500).slice(0, 4)
    : [];
  const prices: Cfg["prices"] = {};
  if (p.prices && typeof p.prices === "object" && !Array.isArray(p.prices)) {
    for (const [bid, row] of Object.entries<any>(p.prices)) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries<any>(row)) {
          if (typeof v === "string" && v.length <= 12) clean[k] = v;
        }
        prices[bid] = clean;
      }
    }
  }
  if (sizes.length === 0 && Object.keys(prices).length === 0) return null;
  return { sizes: sizes.length > 0 ? sizes : DEFAULT_SIZES, prices };
}

function readLocal(): Cfg | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? cleanCfg(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(cfg: Cfg): boolean {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

const summary = (c: Cfg) => `${c.sizes.join(", ")} ml pegs, prices for ${Object.keys(c.prices).length} brand(s)`;

const stampOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Price of one peg: the bottle rate in proportion to the peg size, times a multiplier, rounded to a step.
// Null when it cannot be worked out (no rate, no bottle size, or a peg bigger than the bottle).
function pegPrice(rate: number, size: number, ml: number, mult: number, step: number): number | null {
  if (!(rate > 0) || !(size > 0) || ml > size) return null;
  const raw = (rate * ml * mult) / size;
  const p = Math.round(raw / step) * step;
  return p > 0 ? p : step;
}

// Every cloud call has its own time limit, so a slow answer never freezes the screen.
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

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Inner() {
  const [local, setLocal] = useState<Cfg | null>(null);
  const [cloud, setCloud] = useState<CloudState>({ kind: "unknown" });
  const [brands, setBrands] = useState<ExciseBrand[]>([]);
  const [mult, setMult] = useState("3");
  const [step, setStep] = useState("5");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const checkCloud = useCallback(async () => {
    const c: any = getCloudClient();
    if (!c) {
      setCloud({ kind: "error", text: "Not connected. Sign in to My account first." });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setCloud({ kind: "error", text: "No internet." });
      return;
    }
    try {
      const { data: s } = await withTimeout(c.auth.getSession(), 6000);
      const uid: string | undefined = s?.session?.user?.id;
      if (!uid) {
        setCloud({ kind: "error", text: "Not signed in to My account." });
        return;
      }
      const res: any = await withTimeout(
        c.from("pos_counter_cfg").select("cfg, updated_at").eq("user_id", uid).limit(1),
        8000
      );
      if (res.error) {
        const text = String(res.error.message ?? res.error);
        setCloud({
          kind: "error",
          text: text.includes("pos_counter_cfg") ? `${text}. Run the SQL from the guide.` : text,
        });
        return;
      }
      const row = (res.data ?? [])[0];
      if (!row) {
        setCloud({ kind: "none" });
        return;
      }
      const cfg = cleanCfg(row.cfg);
      setCloud({ kind: "ok", at: String(row.updated_at ?? ""), text: cfg ? summary(cfg) : "empty" });
    } catch (e: any) {
      setCloud({ kind: "error", text: String(e?.message ?? e) });
    }
  }, []);

  // Saved settings are read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setLocal(readLocal());
    checkCloud();
    listExciseBrands()
      .then(setBrands)
      .catch(() => {
        // the rule below then shows no brands; the rest still works
      });
  }, [checkCloud]);

  // Four example brands with the prices the rule would give.
  const preview = useMemo(() => {
    const m = Number(mult);
    const st = Number(step);
    if (!(m >= 0.5 && m <= 20) || ![1, 5, 10].includes(st)) return [];
    const sizes = local ? local.sizes : DEFAULT_SIZES;
    const out: string[] = [];
    for (const b of brands) {
      if (out.length >= 4) break;
      const parts: string[] = [];
      for (const ml of sizes) {
        const p = pegPrice(Number(b.rate) || 0, b.size_ml, ml, m, st);
        if (p !== null) parts.push(`${ml} ml = ${p}`);
      }
      if (parts.length > 0) out.push(`${b.name} ${b.size_ml} ml: ${parts.join(", ")}`);
    }
    return out;
  }, [brands, mult, step, local]);

  async function onSend() {
    const cfg = readLocal();
    if (!cfg) {
      setMsg("This phone has no peg prices saved yet. Set them in the Liquor counter first.");
      return;
    }
    const c: any = getCloudClient();
    if (!c) {
      setMsg("Not connected. Sign in to My account first.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setMsg("Internet is needed.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { data: s } = await withTimeout(c.auth.getSession(), 6000);
      const uid: string | undefined = s?.session?.user?.id;
      if (!uid) throw new Error("Not signed in to My account.");
      const res: any = await withTimeout(
        c.from("pos_counter_cfg").upsert(
          { user_id: uid, cfg, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        ),
        10000
      );
      if (res.error) throw new Error(res.error.message);
      setMsg("Peg prices sent to the cloud.");
      await checkCloud();
    } catch (e: any) {
      setMsg(`Could not send: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  async function onGet() {
    const c: any = getCloudClient();
    if (!c) {
      setMsg("Not connected. Sign in to My account first.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setMsg("Internet is needed.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { data: s } = await withTimeout(c.auth.getSession(), 6000);
      const uid: string | undefined = s?.session?.user?.id;
      if (!uid) throw new Error("Not signed in to My account.");
      const res: any = await withTimeout(
        c.from("pos_counter_cfg").select("cfg, updated_at").eq("user_id", uid).limit(1),
        8000
      );
      if (res.error) throw new Error(res.error.message);
      const row = (res.data ?? [])[0];
      const cfg = row ? cleanCfg(row.cfg) : null;
      if (!cfg) {
        setMsg("The cloud has no peg prices yet. Send them first from the phone that has them.");
        return;
      }
      if (!confirm(`Replace the peg sizes and prices on this phone with the cloud copy (${summary(cfg)})?`)) return;
      if (!writeLocal(cfg)) throw new Error("could not save on this phone (storage is blocked)");
      setLocal(cfg);
      setMsg("Peg prices loaded. Open the Liquor counter tab again to use them.");
    } catch (e: any) {
      setMsg(`Could not get: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  function onApplyRule() {
    const m = Number(mult);
    const st = Number(step);
    if (!(m >= 0.5 && m <= 20)) {
      setMsg("The multiplier must be a number from 0.5 to 20.");
      return;
    }
    if (![1, 5, 10].includes(st)) {
      setMsg("Round to 1, 5 or 10.");
      return;
    }
    if (brands.length === 0) {
      setMsg("No brands found. Add or import brands first.");
      return;
    }
    const base: Cfg = readLocal() ?? { sizes: DEFAULT_SIZES, prices: {} };
    const prices: Cfg["prices"] = { ...base.prices };
    let changed = 0;
    let skipped = 0;
    for (const b of brands) {
      const rate = Number(b.rate) || 0;
      const row: Record<string, string> = { ...(prices[b.id] ?? {}) };
      let any = false;
      for (const ml of base.sizes) {
        const key = String(ml);
        if (!overwrite && row[key] !== undefined && row[key] !== "") continue;
        const p = pegPrice(rate, b.size_ml, ml, m, st);
        if (p === null) continue;
        row[key] = String(p);
        any = true;
      }
      if (any) {
        prices[b.id] = row;
        changed += 1;
      } else {
        skipped += 1;
      }
    }
    if (changed === 0) {
      setMsg("Nothing to set: every brand already has its prices, or has no rate. Tick the box to change all.");
      return;
    }
    if (
      !confirm(
        `Set peg prices (${base.sizes.join(", ")} ml) for ${changed} brand(s)? ${overwrite ? "Saved prices will be replaced." : "Saved prices are kept."}`
      )
    ) {
      return;
    }
    const next: Cfg = { sizes: base.sizes, prices };
    if (!writeLocal(next)) {
      setMsg("Could not save on this phone (storage is blocked).");
      return;
    }
    setLocal(next);
    setMsg(
      `Peg prices set for ${changed} brand(s). ${skipped > 0 ? `${skipped} brand(s) skipped. ` : ""}` +
        "Open the Liquor counter tab again. To use them on other phones, send them to the cloud below."
    );
  }

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-md border p-2 text-sm">{msg}</p>}

      <section className="space-y-3 rounded-md border p-3 text-sm">
        <h2 className="font-medium">Set peg prices for all brands</h2>
        <p className="text-muted-foreground">
          Peg price = bottle rate x peg ml / bottle ml x multiplier, rounded. Use it once, then change single brands under
          Prices in the Liquor counter. The peg sizes are the ones saved on this phone ({(local ? local.sizes : DEFAULT_SIZES).join(", ")} ml).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1">
            <span className="text-muted-foreground">Multiplier</span>
            <input
              className={`${input} w-24`}
              inputMode="decimal"
              value={mult}
              onChange={(e) => setMult(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground">Round to</span>
            <select className={input} value={step} onChange={(e) => setStep(e.target.value)}>
              <option value="1">1 rupee</option>
              <option value="5">5 rupees</option>
              <option value="10">10 rupees</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Also replace the prices that are already saved
        </label>
        {preview.length > 0 ? (
          <div className="space-y-1">
            <p className="text-muted-foreground">Examples:</p>
            {preview.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            {brands.length === 0 ? "No brands found yet." : "Enter a multiplier from 0.5 to 20 to see examples."}
          </p>
        )}
        <button className={btn} disabled={busy || brands.length === 0} onClick={onApplyRule}>
          Apply to all brands
        </button>
      </section>

      <section className="space-y-3 rounded-md border p-3 text-sm">
        <h2 className="font-medium">Peg prices on other phones</h2>
        <p className="text-muted-foreground">
          Send the peg sizes and prices from the phone that has them, then get them on the other phone. The open bottle ml
          is not shared: every counter has its own open bottles. Use the same login on every phone.
        </p>
        <p>This phone: {local ? summary(local) : "no peg prices saved yet"}</p>
        <p>
          Cloud:{" "}
          {cloud.kind === "unknown"
            ? "checking..."
            : cloud.kind === "none"
              ? "nothing saved yet"
              : cloud.kind === "ok"
                ? `${cloud.text} (saved ${stampOf(cloud.at)})`
                : cloud.text}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button className={btn} disabled={busy} onClick={onSend}>
            Send this phone's prices to the cloud
          </button>
          <button className={btn} disabled={busy} onClick={onGet}>
            Get prices from the cloud
          </button>
          <button className="underline" disabled={busy} onClick={checkCloud}>
            Check again
          </button>
        </div>
      </section>
    </div>
  );
}

export default function PegPriceSync() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
