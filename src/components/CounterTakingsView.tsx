import { Component, useEffect, useState, type ReactNode } from "react";
import {
  TAKINGS_EVENT,
  readDays,
  receivedOf,
  resetTakings,
  runCounterTakingsCheck,
  totalOf,
  type DayMap,
  type DayTotals,
} from "@/lib/counterTakings";
import { useOwnerAccess } from "@/lib/ownerAccess";
import PegPriceSync from "@/components/PegPriceSync";

const input = "rounded-md border px-3 py-2 text-sm bg-background";

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Money is handled in paise (whole numbers).
const inr = (p: number) =>
  (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ZERO: DayTotals = { n: 0, cancelled: 0, cash: 0, upi: 0, card: 0, tab: 0 };

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <p className="p-4 text-sm">Counter takings could not open here.</p>;
    return this.props.children;
  }
}

function Inner() {
  const { isOwner } = useOwnerAccess();
  const [days, setDays] = useState<DayMap>({});
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState("");

  // Saved numbers are read only after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setDate(localDate());
    try {
      runCounterTakingsCheck();
    } catch {
      // ignore
    }
    setDays(readDays());
    const h = () => setDays(readDays());
    window.addEventListener(TAKINGS_EVENT, h);
    return () => window.removeEventListener(TAKINGS_EVENT, h);
  }, []);

  const d = days[date] ?? ZERO;
  const dates = Object.keys(days)
    .sort()
    .reverse()
    .slice(0, 14);

  async function onCopy() {
    const text =
      `Liquor counter ${date}\n` +
      `Slips: ${d.n}${d.cancelled > 0 ? ` (cancelled: ${d.cancelled})` : ""}\n` +
      `Cash: ${inr(d.cash)}\n` +
      `UPI: ${inr(d.upi)}\n` +
      `Card: ${inr(d.card)}\n` +
      `Credit (Tab): ${inr(d.tab)}\n` +
      `Total: ${inr(totalOf(d))}\n` +
      `Money received: ${inr(receivedOf(d))}`;
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Summary copied. Paste it in WhatsApp.");
    } catch {
      setMsg("Copy is not allowed here.");
    }
  }

  function onCsv() {
    const all = Object.keys(days).sort();
    if (all.length === 0) {
      setMsg("No numbers yet.");
      return;
    }
    const rows = [["date", "slips", "cancelled", "cash", "upi", "card", "tab", "total", "received"]];
    for (const k of all) {
      const x = days[k] ?? ZERO;
      rows.push([
        k,
        String(x.n),
        String(x.cancelled),
        (x.cash / 100).toFixed(2),
        (x.upi / 100).toFixed(2),
        (x.card / 100).toFixed(2),
        (x.tab / 100).toFixed(2),
        (totalOf(x) / 100).toFixed(2),
        (receivedOf(x) / 100).toFixed(2),
      ]);
    }
    const csv = rows.map((r) => r.join(",")).join("\r\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `prime-terminal-counter-takings-${localDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMsg(`${all.length} day(s) downloaded.`);
    } catch {
      setMsg("The download did not work here.");
    }
  }

  function onReset() {
    if (!confirm("Clear all the counter takings numbers on this phone? Daily sales and stock are not touched.")) return;
    if (resetTakings()) {
      setDays({});
      setMsg("The numbers were cleared. They start again from the next sale.");
    } else {
      setMsg("Could not clear (storage is blocked).");
    }
  }

  if (!isOwner) return <p className="p-4 text-sm">Counter takings are for the owner only.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Counter takings</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <p className="text-sm text-muted-foreground">
        What the Liquor counter slips on this phone added up to, day by day, at the prices written on the slips.
        Cancelled sales are taken off. These numbers live on this phone only, so keep the counter on one phone. They
        are not a tax or excise report.
      </p>

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">Day</span>
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <section className="rounded-md border p-3 text-sm space-y-1">
        <p className="font-medium">
          {d.n} slip(s){d.cancelled > 0 ? ` | ${d.cancelled} cancelled` : ""}
        </p>
        <p>Cash: {inr(d.cash)}</p>
        <p>UPI: {inr(d.upi)}</p>
        <p>Card: {inr(d.card)}</p>
        <p>Credit (Tab, money not received yet): {inr(d.tab)}</p>
        <p className="font-medium">Total: {inr(totalOf(d))}</p>
        <p className="font-medium">Money received (Cash + UPI + Card): {inr(receivedOf(d))}</p>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button className="underline text-sm" onClick={onCopy}>
          Copy summary
        </button>
        <button className="underline text-sm" onClick={onCsv}>
          Download all days (CSV)
        </button>
        <button className="underline text-sm text-destructive" onClick={onReset}>
          Start fresh numbers
        </button>
      </div>

      {dates.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Last days</h2>
          {dates.map((k) => {
            const x = days[k] ?? ZERO;
            return (
              <button
                key={k}
                className="flex w-full items-center justify-between rounded-md border p-3 text-left text-sm"
                onClick={() => setDate(k)}
              >
                <span>
                  {k} | {x.n} slip(s)
                </span>
                <span className="font-medium">{inr(totalOf(x))}</span>
              </button>
            );
          })}
        </section>
      )}

      <PegPriceSync />
    </div>
  );
}

export default function CounterTakingsView() {
  return (
    <Boundary>
      <Inner />
    </Boundary>
  );
}
