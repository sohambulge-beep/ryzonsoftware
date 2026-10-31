import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  SYNC_EVENT,
  applyCloudValues,
  deviceId,
  getReview,
  keepMine,
  runSync,
  type ReviewItem,
  type ReviewState,
} from "@/lib/stockSync";

const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Sync review could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const [review, setReview] = useState<ReviewState>({ at: 0, items: [], onlyCloud: 0 });
  const [me, setMe] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setReview(getReview()), []);

  useEffect(() => {
    setMe(deviceId());
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, [refresh]);

  const who = (it: ReviewItem) =>
    it.cloudDevice && it.cloudDevice === me
      ? "this phone"
      : it.cloudDevice
        ? `phone ${it.cloudDevice.slice(-4)}`
        : "another phone";

  async function checkNow() {
    setBusy(true);
    setMsg("");
    try {
      const r = await runSync();
      if (r.status === "nokey") setMsg("Sign in with My account first.");
      else if (r.status === "nosession") setMsg("You are not signed in. Open My account and sign in.");
      else if (r.status === "offline") setMsg("No internet right now.");
      else if (r.status === "skipped") setMsg("Another check is running. Try again in a minute.");
      else setMsg(`Checked. ${r.uploaded} change(s) saved to the cloud.`);
    } catch (e: any) {
      setMsg(`Could not check: ${e?.message ?? e}`);
    }
    refresh();
    setBusy(false);
  }

  async function apply(list: ReviewItem[], ask: string) {
    if (list.length === 0 || !confirm(ask)) return;
    setBusy(true);
    setMsg("");
    try {
      const n = await applyCloudValues(list);
      setMsg(`${n} value(s) applied. The app will reload now.`);
    } catch (e: any) {
      setMsg(`${e?.message ?? e}`);
    }
    refresh();
    setBusy(false);
  }

  async function keep(list: ReviewItem[], ask: string) {
    if (list.length === 0 || !confirm(ask)) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await keepMine(list);
      setMsg(
        `${r.done} value(s) kept.` +
          (r.failed > 0 ? ` ${r.failed} could not be kept because they changed again on another phone. Press Check now.` : "")
      );
    } catch (e: any) {
      setMsg(`${e?.message ?? e}`);
    }
    refresh();
    setBusy(false);
  }

  const items = review.items;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Sync review</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Stock (litres, price, cost) and customer udhaar are saved to the cloud by this phone. If another phone changed
        the same value, nothing is overwritten by itself. It is listed here and you choose. "Use cloud value" changes
        only the number on this phone, not its old bills or payments.
      </p>

      <section className="rounded-md border p-3 text-sm space-y-2">
        <p>
          {items.length === 0 ? "Nothing needs your decision." : `${items.length} value(s) need your decision.`}
        </p>
        <p className="text-muted-foreground">
          Last check: {review.at ? when(new Date(review.at).toISOString()) : "not yet"}
          {review.onlyCloud > 0
            ? ` | ${review.onlyCloud} record(s) exist only in the cloud (added on another phone)`
            : ""}
        </p>
        <div className="flex flex-wrap gap-3">
          <button className={btn} disabled={busy} onClick={checkNow}>
            {busy ? "Please wait..." : "Check now"}
          </button>
          {items.length > 1 && (
            <>
              <button
                className="underline"
                disabled={busy}
                onClick={() => apply(items, `Use the cloud values for all ${items.length} items on this phone?`)}
              >
                Use cloud for all
              </button>
              <button
                className="underline"
                disabled={busy}
                onClick={() => keep(items, `Keep this phone's values for all ${items.length} items?`)}
              >
                Keep this phone for all
              </button>
            </>
          )}
        </div>
      </section>

      {items.map((it) => (
        <div key={`${it.kind}|${it.key}`} className="rounded-md border p-3 text-sm space-y-2">
          <div className="flex justify-between gap-3">
            <span className="font-medium">{it.name || it.key}</span>
            <span className="font-medium">{it.kind === "stock" ? "Stock" : "Udhaar"}</span>
          </div>
          <p className={it.type === "conflict" ? "text-destructive" : "text-muted-foreground"}>
            {it.type === "conflict"
              ? "Changed on both phones (or never matched before)."
              : "Newer on another phone. Nothing changed on this phone."}
          </p>
          <p>This phone: {it.mine}</p>
          <p>
            Cloud: {it.cloud}{" "}
            <span className="text-muted-foreground">
              ({who(it)}, {when(it.cloudAt)})
            </span>
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              className={btn}
              disabled={busy}
              onClick={() => apply([it], `Use the cloud value for ${it.name || it.key} on this phone?`)}
            >
              Use cloud value
            </button>
            <button
              className="underline"
              disabled={busy}
              onClick={() => keep([it], `Keep this phone's value for ${it.name || it.key} and replace the cloud's?`)}
            >
              Keep this phone's value
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SyncReviewView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
