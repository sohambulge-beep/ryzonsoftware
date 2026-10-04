import { useEffect, useState } from "react";
import { type BankAccount, listBankAccounts } from "@/lib/bankService";
import {
  type ExportResult,
  downloadCsv,
  exportBankEntries,
  exportBrands,
  exportDailySales,
  exportTpReceipts,
} from "@/lib/dataExportService";

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

export default function DataExportView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState("all");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [last, setLast] = useState<{ filename: string; csv: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setAccounts(await listBankAccounts());
      } catch (e: any) {
        setMsg(`Could not load bank accounts: ${e.message ?? e}`);
      }
    })();
  }, []);

  async function run(key: string, make: () => Promise<ExportResult>) {
    setBusy(key);
    setMsg("");
    try {
      const r = await make();
      if (r.rowCount === 0) {
        setLast(null);
        setMsg("Nothing to export for this selection.");
      } else {
        setLast({ filename: r.filename, csv: r.csv });
        downloadCsv(r.filename, r.csv);
        setMsg(`${r.rowCount} row(s) exported to ${r.filename}`);
      }
    } catch (e: any) {
      setMsg(`Export failed: ${e.message ?? e}`);
    }
    setBusy("");
  }

  async function onCopy() {
    if (!last) return;
    try {
      await navigator.clipboard.writeText(last.csv);
      setMsg("Copied. Paste it into a notes app or a spreadsheet.");
    } catch {
      setMsg("Copy is not allowed here. Use the download button instead.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-semibold">Export data (CSV)</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">Dates (optional)</h2>
        <p className="text-sm text-muted-foreground">
          Dates apply to TP receipts, Daily sales and Bank entries. Leave both empty to export everything.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">From date</span>
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">To date</span>
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">What to export</h2>

        <div className="rounded-md border p-3 space-y-2 text-sm">
          <p className="font-medium">Brands and rates</p>
          <p className="text-muted-foreground">Can be imported back from the Brand prices tab.</p>
          <button className={btn} disabled={!!busy} onClick={() => run("brands", () => exportBrands())}>
            {busy === "brands" ? "Preparing..." : "Download brands"}
          </button>
        </div>

        <div className="rounded-md border p-3 space-y-2 text-sm">
          <p className="font-medium">TP receipts</p>
          <button
            className={btn}
            disabled={!!busy}
            onClick={() => run("tp", () => exportTpReceipts(from, to))}
          >
            {busy === "tp" ? "Preparing..." : "Download TP receipts"}
          </button>
        </div>

        <div className="rounded-md border p-3 space-y-2 text-sm">
          <p className="font-medium">Daily sales</p>
          <button
            className={btn}
            disabled={!!busy}
            onClick={() => run("sales", () => exportDailySales(from, to))}
          >
            {busy === "sales" ? "Preparing..." : "Download daily sales"}
          </button>
        </div>

        <div className="rounded-md border p-3 space-y-2 text-sm">
          <p className="font-medium">Bank entries</p>
          <select className={input} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">All bank accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.last4 ? ` (xxxx ${a.last4})` : ""}
              </option>
            ))}
          </select>
          <button
            className={btn}
            disabled={!!busy}
            onClick={() => run("bank", () => exportBankEntries(accountId, from, to))}
          >
            {busy === "bank" ? "Preparing..." : "Download bank entries"}
          </button>
        </div>
      </section>

      {last && (
        <section className="space-y-2 text-sm">
          <p className="text-muted-foreground">Download did not start? Copy the text instead.</p>
          <button className="underline" onClick={onCopy}>
            Copy text of {last.filename}
          </button>
        </section>
      )}
    </div>
  );
}
