import { Component, useEffect, useState, type ReactNode } from "react";
import { countData, hasSafety, restoreSafety, wipeNow, type Counts } from "@/lib/freshStart";

const input = "rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="p-4 text-sm">Start fresh could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [typed, setTyped] = useState("");
  const [alsoNotes, setAlsoNotes] = useState(true);
  const [safety, setSafety] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setCounts(countData());
    } catch {
      setMsg("The app data could not be read here.");
    }
    setSafety(hasSafety());
  }, []);

  function onClear() {
    if (typed.trim() !== "CLEAR") {
      setMsg('Type the word CLEAR first.');
      return;
    }
    if (!confirm("Clear all bills, customers, stock, expenses and payments on this phone? You can undo it once from this page.")) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      wipeNow(alsoNotes);
      setMsg("Cleared. The app will reload now.");
    } catch (e: any) {
      setMsg(`${e?.message ?? e}`);
      setBusy(false);
    }
  }

  function onUndo() {
    if (!confirm("Bring back the data that was on this phone before the last clear?")) return;
    setBusy(true);
    setMsg("");
    try {
      restoreSafety();
      setMsg("Brought back. The app will reload now.");
    } catch (e: any) {
      setMsg(`${e?.message ?? e}`);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Start fresh</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        Use this to remove the trial numbers and start the POS from zero. It clears the beer POS data on this phone
        only: bills, customers, stock (taps), expenses, payments, purchases and suppliers. Excise, Bank, GST, Staff and
        Tables are saved in the database and are not touched. Copies already saved in the cloud are not removed either.
      </p>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p className="font-medium">On this phone now</p>
        {counts ? (
          <p>
            Bills {counts.bills} | Customers {counts.customers} | Taps {counts.taps} | Expenses {counts.expenses} |
            Payments {counts.payments}
          </p>
        ) : (
          <p className="text-muted-foreground">Loading...</p>
        )}
      </section>

      <section className="space-y-3 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={alsoNotes} onChange={(e) => setAlsoNotes(e.target.checked)} />
          Also clear my trial entries in Cash closing, Bookings, Wastage log, Customer club and Udhaar reminders
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Type CLEAR to confirm</span>
          <input
            className={`${input} w-full`}
            autoCapitalize="characters"
            value={typed}
            onChange={(e) => setTyped(e.target.value.slice(0, 10))}
          />
        </label>
        <button className={btn} disabled={busy || typed.trim() !== "CLEAR"} onClick={onClear}>
          Clear trial data on this phone
        </button>
      </section>

      {safety && (
        <section className="space-y-2 rounded-md border p-3 text-sm">
          <p>A copy of the data from before the last clear is saved on this phone.</p>
          <button className={btn} disabled={busy} onClick={onUndo}>
            Undo last clear
          </button>
          <p className="text-xs text-muted-foreground">Undo brings back bills, customers and stock, not the cleared notes.</p>
        </section>
      )}
    </div>
  );
}

export default function StartFreshView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
