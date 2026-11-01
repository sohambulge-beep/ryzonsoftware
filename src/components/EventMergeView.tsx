import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  MERGE_EVENT,
  currentUid,
  getStats,
  isMergeOn,
  runEventSync,
  turnOff,
  turnOn,
  type MergeStats,
} from "@/lib/eventSync";

const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Two-phone merge could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const [uid, setUid] = useState("");
  const [on, setOn] = useState(false);
  const [stats, setStats] = useState<MergeStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const id = await currentUid();
    setUid(id);
    setOn(isMergeOn(id));
    setStats(id ? getStats(id) : null);
  }, []);

  useEffect(() => {
    refresh();
    const h = () => {
      refresh();
    };
    window.addEventListener(MERGE_EVENT, h);
    return () => window.removeEventListener(MERGE_EVENT, h);
  }, [refresh]);

  async function onTurnOn() {
    if (
      !confirm(
        "Before turning this on: this phone must have the same data as the other phone (use Cloud backup, Upload on one phone and Restore on the other), and no sale should be going on. Turn on now?"
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await turnOn();
      setMsg("Merge is on for this phone. Turn it on for the other phone too.");
    } catch (e: any) {
      setMsg(`${e?.message ?? e}`);
    }
    await refresh();
    setBusy(false);
  }

  function onTurnOff() {
    if (!confirm("Turn the merge off on this phone? Its sales will stop going to the other phone.")) return;
    turnOff(uid);
    setMsg("Merge is off for this phone.");
    refresh();
  }

  async function onCheck() {
    setBusy(true);
    setMsg("");
    try {
      const r = await runEventSync();
      if (r.note === "offline") setMsg("No internet right now.");
      else if (r.note === "nosession" || r.note === "nokey") setMsg("Sign in with My account first.");
      else if (r.note === "busy") setMsg("A check is already running. Try again in a minute.");
      else if (r.note === "off") setMsg("Merge is off for this phone.");
      else setMsg(`Checked. ${r.uploaded} sent, ${r.applied} added from the other phone.${r.note ? ` ${r.note}` : ""}`);
    } catch (e: any) {
      setMsg(`Could not check: ${e?.message ?? e}`);
    }
    await refresh();
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Two-phone merge</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Every bill, payment, purchase, expense and new customer, tap or supplier made on one phone is sent to the cloud
        and added to the other phone, once, with the same effect on litres and udhaar. Changing the details of an
        existing tap or customer, or correcting litres by hand, is not merged (use Sync review for those).
      </p>

      <section className="rounded-md border p-3 text-sm space-y-2">
        <p className="font-medium">How to start</p>
        <p>1. Phone A: Cloud backup, then Upload backup now.</p>
        <p>2. Phone B: Cloud backup, then Restore that backup on this phone.</p>
        <p>3. Do not sell anything on either phone in the meantime.</p>
        <p>4. Turn the merge on here, on phone A and on phone B (the same login on both).</p>
      </section>

      <section className="rounded-md border p-3 text-sm space-y-2">
        {!uid ? (
          <p>You are not signed in. Open My account and sign in first.</p>
        ) : (
          <>
            <p>{on ? "Merge is on for this phone." : "Merge is off for this phone."}</p>
            {stats && (
              <p className="text-muted-foreground">
                Last check: {when(stats.at)} | sent {stats.uploaded} | added from the other phone {stats.applied}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {on ? (
                <>
                  <button className={btn} disabled={busy} onClick={onCheck}>
                    {busy ? "Please wait..." : "Check now"}
                  </button>
                  <button className="underline" disabled={busy} onClick={onTurnOff}>
                    Turn off
                  </button>
                </>
              ) : (
                <button className={btn} disabled={busy} onClick={onTurnOn}>
                  {busy ? "Please wait..." : "Turn on merge on this phone"}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function EventMergeView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
