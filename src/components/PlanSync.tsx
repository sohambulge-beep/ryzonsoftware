import { Component, useEffect, type ReactNode } from "react";
import { getCloudClient } from "../lib/adminCheck";
import { persistPlan, readPersistedPlan, type PlanId } from "../lib/plan";

const IDS: string[] = ["basic", "pro", "premium"];
const FIRST_MS = 1500;
const EVERY_MS = 15 * 60 * 1000;
const RELOAD_WINDOW_MS = 20000;
const RELOAD_KEY = "pt_plan_reload";

function asPlan(v: unknown): PlanId | null {
  const s = String(v ?? "").trim().toLowerCase();
  return IDS.includes(s) ? (s as PlanId) : null;
}

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

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Makes the plan on this phone follow the plan the provider set for this customer.
function Inner() {
  useEffect(() => {
    let alive = true;
    const mountedAt = Date.now();

    const sync = async (startup: boolean) => {
      if (!alive) return;
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        const c: any = getCloudClient();
        if (!c) return;
        const { data: s } = await withTimeout(c.auth.getSession(), 6000);
        const uid: string | undefined = s?.session?.user?.id;
        if (!uid) return;
        // Only this login's own customer row is read (an admin has none, so nothing changes).
        const res: any = await withTimeout(c.from("businesses").select("plan").eq("user_id", uid).limit(1), 8000);
        if (res.error) return;
        const next = asPlan((res.data ?? [])[0]?.plan);
        if (!next || readPersistedPlan() === next) return;
        persistPlan(next);
        // Right after the app opens, reload once so the new plan applies at once. Never in the middle of a bill.
        if (startup && alive && Date.now() - mountedAt < RELOAD_WINDOW_MS) {
          if (sessionStorage.getItem(RELOAD_KEY) !== next) {
            sessionStorage.setItem(RELOAD_KEY, next);
            window.location.reload();
          }
        }
      } catch {
        // never block the app
      }
    };

    const first = setTimeout(() => sync(true), FIRST_MS);
    const every = setInterval(() => sync(false), EVERY_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  return null;
}

export default function PlanSync() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
