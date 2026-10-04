import { useCallback, useEffect, useState } from "react";
import { type BankAccount, listBankAccounts } from "@/lib/bankService";
import {
  type BankTransfer,
  createBankTransfer,
  deleteBankTransfer,
  listBankTransfers,
} from "@/lib/bankTransferService";

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

// Local date (not UTC), so late-night entries do not get yesterday's date.
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const inr = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BankTransferView() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transfers, setTransfers] = useState<BankTransfer[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setAccounts(await listBankAccounts());
      setTransfers(await listBankTransfers());
    } catch (e: any) {
      setMsg(`Could not load: ${e.message ?? e}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    if (!a) return "Unknown account";
    return a.last4 ? `${a.name} (xxxx ${a.last4})` : a.name;
  };

  async function onSave() {
    setBusy(true);
    try {
      await createBankTransfer({
        from_account_id: fromId,
        to_account_id: toId,
        transfer_date: date,
        amount: Number(amount),
        reference,
        note,
      });
      setAmount("");
      setReference("");
      setNote("");
      setMsg("Transfer saved. It now shows in both bank statements.");
      await load();
    } catch (e: any) {
      setMsg(`Could not save transfer: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this transfer? Its entries in both bank statements will be removed.")) return;
    try {
      await deleteBankTransfer(id);
      setMsg("Transfer deleted");
      await load();
    } catch (e: any) {
      setMsg(`Could not delete: ${e.message ?? e}`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-semibold">Bank to bank transfer</h1>
      {msg && <p className="text-sm rounded-md border p-2">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">New transfer</h2>
        {accounts.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            You need at least two bank accounts. Add them in the Bank statement page first.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">From account</span>
                <select className={input} value={fromId} onChange={(e) => setFromId(e.target.value)}>
                  <option value="">Select account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {nameOf(a.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">To account</span>
                <select className={input} value={toId} onChange={(e) => setToId(e.target.value)}>
                  <option value="">Select account</option>
                  {accounts
                    .filter((a) => a.id !== fromId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {nameOf(a.id)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">Date</span>
                <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={input}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">Reference (UTR / cheque no.)</span>
                <input className={input} value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">Note (optional)</span>
                <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <button className={btn} disabled={busy} onClick={onSave}>
              Save transfer
            </button>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Recent transfers ({transfers.length})</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transfers yet.</p>
        ) : (
          <div className="space-y-2">
            {transfers.map((t) => (
              <div key={t.id} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="font-medium">{inr(t.amount)}</span>
                  <span>{t.transfer_date}</span>
                </div>
                <p>
                  {nameOf(t.from_account_id)} to {nameOf(t.to_account_id)}
                </p>
                {t.reference && <p className="text-muted-foreground">Ref: {t.reference}</p>}
                <button className="text-destructive" onClick={() => onDelete(t.id)}>
                  Delete transfer
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Shows the latest 100 transfers. Deleting a transfer, or deleting either of its entries in the
          bank statement, removes both sides so the balances stay correct.
        </p>
      </section>
    </div>
  );
}
