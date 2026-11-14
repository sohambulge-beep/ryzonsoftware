import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { getCloudClient } from "@/lib/adminCheck";

const CFG_KEY = "taptrack_peg_cfg";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

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
  return { sizes: sizes.length > 0 ? sizes : [30, 60], prices };
}

function readLocal(): Cfg | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? cleanCfg(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const summary = (c: Cfg) => `${c.sizes.join(", ")} ml pegs, prices for ${Object.keys(c.prices).length} brand(s)`;

const stampOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

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
  }, [checkCloud]);

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
      try {
        localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      } catch {
        throw new Error("could not save on this phone (storage is blocked)");
      }
      setLocal(cfg);
      setMsg("Peg prices loaded. Open the Liquor counter tab again to use them.");
    } catch (e: any) {
      setMsg(`Could not get: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border p-3 text-sm">
      <h2 className="font-medium">Peg prices on other phones</h2>
      {msg && <p className="rounded-md border p-2">{msg}</p>}
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
  );
}

export default function PegPriceSync() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
