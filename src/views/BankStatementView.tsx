import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BankAccount,
  type BankEntry,
  addBankEntry,
  createBankAccount,
  deleteBankAccount,
  deleteBankEntry,
  listBankAccounts,
  listBankEntries,
} from "@/lib/bankService";

const input = "w-full rounded-md border px-3 py-2 text-sm bg-background";
const btn = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";

// Local date (not UTC), so late-night entries do not get yesterday's date.
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Money is added up in paise (whole numbers) to avoid decimal errors.
const toPaise = (n: number) => Math.round(n * 100);
const inr = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const printCss = `
@media print {
  body * { visibility: hidden; }
  #bank-statement, #bank-statement * { visibility: visible; color: #000 !important; background: #fff !important; }
  #bank-statement { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .no-print { display: none !important; }
}
`;

export default function BankStatementView() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const reqRef = useRef(0);

  // new account form
  const [accName, setAccName] = useState("");
  const [accLast4, setAccLast4] = useState("");
  const [accOpening, setAccOpening] = useState("");
  const [accDate, setAccDate] = useState(today());

  // new entry form
  const [entDate, setEntDate] = useState(today());
  const [entDir, setEntDir] = useState<"credit" | "debit">("credit");
  const [entAmount, setEntAmount] = useState("");
  const [entDesc, setEntDesc] = useState("");
  const [entRef, setEntRef] = useState("");

  // statement period
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const loadAccounts = useCallback(async (keepId?: string) => {
    try {
      const list = await listBankAccounts();
      setAccounts(list);
      setSelectedId((prev) => {
        const want = keepId ?? prev;
        return list.some((a) => a.id === want) ? want : list[0]?.id ?? "";
      });
    } catch (e: any) {
      setMsg(`Could not load accounts: ${e.message ?? e}`);
    }
  }, []);

  const refreshEntries = useCallback(async (accountId: string) => {
    const id = ++reqRef.current;
    try {
      const list = await listBankEntries(accountId);
      if (id === reqRef.current) setEntries(list);
    } catch (e: any) {
      if (id === reqRef.current) setMsg(`Could not load entries: ${e.message ?? e}`);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!selectedId) {
      reqRef.current++;
      setEntries([]);
      return;
    }
    setEntries([]);
    refreshEntries(selectedId);
  }, [selectedId, refreshEntries]);

  const account = accounts.find((a) => a.id === selectedId);

  const statement = useMemo(() => {
    if (!account) return null;
    let opening = toPaise(account.opening_balance);
    let credit = 0;
    let debit = 0;
    const picked: { entry: BankEntry; signed: number }[] = [];
    for (const e of entries) {
      const p = toPaise(e.amount);
      const signed = e.direction === "credit" ? p : -p;
      if (from && e.entry_date < from) {
        opening += signed; // before the period: counts towards the opening balance
        continue;
      }
      if (to && e.entry_date > to) continue;
      picked.push({ entry: e, signed });
      if (signed > 0) credit += p;
      else debit += p;
    }
    let running = opening;
    const rows = picked.map((r) => {
      running += r.signed;
      return { ...r, balance: running };
    });
    return { opening, rows, credit, debit, closing: opening + credit - debit };
  }, [account, entries, from, to]);

  async function onAddAccount() {
    setBusy(true);
    try {
      const opening = accOpening.trim() === "" ? 0 : Number(accOpening);
      const id = await createBankAccount({
        name: accName,
        last4: accLast4.trim(),
        opening_balance: opening,
        opening_date: accDate,
      });
      setAccName("");
      setAccLast4("");
      setAccOpening("");
      setMsg("Bank account added");
      await loadAccounts(id);
    } catch (e: any) {
      setMsg(`Could not add account: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onDeleteAccount() {
    if (!account) return;
    if (!confirm(`Delete "${account.name}" and ALL its entries? This cannot be undone.`)) return;
    try {
      await deleteBankAccount(account.id);
      setMsg("Bank account deleted");
      await loadAccounts("");
    } catch (e: any) {
      setMsg(`Could not delete account: ${e.message ?? e}`);
    }
  }

  async function onAddEntry() {
    setBusy(true);
    try {
      await addBankEntry({
        account_id: selectedId,
        entry_date: entDate,
        direction: entDir,
        amount: Number(entAmount),
        description: entDesc,
        reference: entRef,
      });
      setEntAmount("");
      setEntDesc("");
      setEntRef("");
      setMsg("Entry saved");
      await refreshEntries(selectedId);
    } catch (e: any) {
      setMsg(`Could not save entry: ${e.message ?? e}`);
    }
    setBusy(false);
  }

  async function onDeleteEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    try {
      await deleteBankEntry(id);
      await refreshEntries(selectedId);
    } catch (e: any) {
      setMsg(`Could not delete entry: ${e.message ?? e}`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <style>{printCss}</style>
      <h1 className="text-xl font-semibold no-print">Bank statement</h1>
      {msg && <p className="text-sm rounded-md border p-2 no-print">{msg}</p>}

      <section className="space-y-3 no-print">
        <h2 className="font-medium">Bank account</h2>
        {accounts.length > 0 && (
          <div className="flex gap-2">
            <select className={input} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.last4 ? ` (xxxx ${a.last4})` : ""}
                </option>
              ))}
            </select>
            <button className="text-destructive text-sm whitespace-nowrap" onClick={onDeleteAccount}>
              Delete account
            </button>
          </div>
        )}
        <details open={accounts.length === 0}>
          <summary className="cursor-pointer text-sm underline">Add a bank account</summary>
          <div className="grid gap-3 sm:grid-cols-2 pt-3">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Account name</span>
              <input className={input} value={accName} onChange={(e) => setAccName(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Last 4 digits (optional)</span>
              <input
                className={input}
                inputMode="numeric"
                maxLength={4}
                value={accLast4}
                onChange={(e) => setAccLast4(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Opening balance</span>
              <input
                type="number"
                step="0.01"
                className={input}
                value={accOpening}
                onChange={(e) => setAccOpening(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Opening date</span>
              <input type="date" className={input} value={accDate} onChange={(e) => setAccDate(e.target.value)} />
            </label>
          </div>
          <button className={`${btn} mt-3`} disabled={busy} onClick={onAddAccount}>
            Add account
          </button>
        </details>
      </section>

      {account && (
        <section className="space-y-3 no-print">
          <h2 className="font-medium">Add entry</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Date</span>
              <input type="date" className={input} value={entDate} onChange={(e) => setEntDate(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Type</span>
              <select
                className={input}
                value={entDir}
                onChange={(e) => setEntDir(e.target.value as "credit" | "debit")}
              >
                <option value="credit">Credit (money in)</option>
                <option value="debit">Debit (money out)</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className={input}
                value={entAmount}
                onChange={(e) => setEntAmount(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Reference (UPI / cheque / challan no.)</span>
              <input className={input} value={entRef} onChange={(e) => setEntRef(e.target.value)} />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm text-muted-foreground">Description</span>
              <input className={input} value={entDesc} onChange={(e) => setEntDesc(e.target.value)} />
            </label>
          </div>
          <button className={btn} disabled={busy} onClick={onAddEntry}>
            Save entry
          </button>
        </section>
      )}

      {account && statement && (
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3 no-print">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">From date</span>
              <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">To date</span>
              <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <div className="flex items-end gap-3">
              <button className={btn} onClick={() => window.print()}>
                Print / PDF
              </button>
              {(from || to) && (
                <button
                  className="text-sm underline pb-2"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear dates
                </button>
              )}
            </div>
          </div>

          <div id="bank-statement" className="space-y-3 text-sm">
            <div>
              <h2 className="text-lg font-semibold">Bank statement</h2>
              <p>
                {account.name}
                {account.last4 ? ` (A/c ending ${account.last4})` : ""}
              </p>
              <p className="text-muted-foreground">
                Period: {from || "Beginning"} to {to || "Latest"}
              </p>
            </div>

            <p className="font-medium">Opening balance: {inr(statement.opening)}</p>

            {statement.rows.length === 0 ? (
              <p className="text-muted-foreground">No entries in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-3">Date</th>
                      <th className="pr-3">Description</th>
                      <th className="pr-3">Ref</th>
                      <th className="pr-3 text-right">Debit</th>
                      <th className="pr-3 text-right">Credit</th>
                      <th className="pr-3 text-right">Balance</th>
                      <th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {statement.rows.map((r) => (
                      <tr key={r.entry.id} className="border-b">
                        <td className="py-2 pr-3 whitespace-nowrap">{r.entry.entry_date}</td>
                        <td className="pr-3">{r.entry.description}</td>
                        <td className="pr-3">{r.entry.reference}</td>
                        <td className="pr-3 text-right">{r.signed < 0 ? inr(-r.signed) : ""}</td>
                        <td className="pr-3 text-right">{r.signed > 0 ? inr(r.signed) : ""}</td>
                        <td className="pr-3 text-right">{inr(r.balance)}</td>
                        <td className="no-print">
                          <button className="text-destructive" onClick={() => onDeleteEntry(r.entry.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-1 font-medium">
              <p>Total debit: {inr(statement.debit)}</p>
              <p>Total credit: {inr(statement.credit)}</p>
              <p>Closing balance: {inr(statement.closing)}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
