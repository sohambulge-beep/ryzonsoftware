import { useEffect, useMemo, useState } from 'react';
import { useStore, buildReturn } from '@/store';
import { fmtMoney, fmtDateTime } from '@/utils';
import { readReturnLog, RETURN_EVENT, type SalesReturnEntry } from '@/lib/salesReturnLog';

export function SalesReturnView() {
  const { db, returnItems } = useStore();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<SalesReturnEntry[]>([]);

  // The log lives in localStorage, so it is read after the page has loaded.
  useEffect(() => {
    const load = () => setHistory(readReturnLog());
    load();
    window.addEventListener(RETURN_EVENT, load);
    return () => window.removeEventListener(RETURN_EVENT, load);
  }, []);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...db.invoices]
      .reverse()
      .filter(
        i => !q || i.invoiceNo.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [db.invoices, search]);

  const selected = db.invoices.find(i => i.id === selectedId) ?? null;

  const lines = useMemo(
    () =>
      Object.entries(qtys)
        .filter(([, q]) => q > 0)
        .map(([beerId, qty]) => ({ beerId, qty })),
    [qtys]
  );

  const preview = selected && lines.length > 0 ? buildReturn(db, selected.id, lines) : null;

  const pick = (id: string) => {
    setSelectedId(id);
    setQtys({});
    setReason('');
    setNotice(null);
  };

  const setQty = (beerId: string, max: number, value: number) => {
    const v = Math.max(0, Math.min(max, Math.floor(value) || 0));
    setQtys(prev => ({ ...prev, [beerId]: v }));
  };

  const submit = () => {
    if (!selected) return;
    const ok = confirm(
      `Return the selected items from ${selected.invoiceNo}? Stock will go back to the keg and the bill will be reduced. This cannot be undone.`
    );
    if (!ok) return;
    const res = returnItems(selected.id, lines, reason);
    setNotice({ ok: res.ok, text: res.message });
    if (res.ok) {
      setQtys({});
      setReason('');
    }
  };

  const onTab = selected?.paymentMethod === 'Tab';

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <i className="fa-solid fa-rotate-left text-rose-400" /> Sales Return / Credit Note
        </div>
        <p className="text-zinc-500 text-xs">
          Customer ne kuch items wapas kiye? Bill chuno, jitni qty wapas aayi wo daalo. Stock keg mein wapas jayega
          aur bill apne aap kam ho jayega. Poora bill cancel karna ho toh Invoices &amp; Sales mein Cancel Bill use karo.
        </p>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search bill no. ya customer name..."
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-72"
        />
        <div className="flex flex-wrap gap-2">
          {matches.length === 0 && <span className="text-zinc-500 text-xs">No bills found.</span>}
          {matches.map(inv => (
            <button
              key={inv.id}
              onClick={() => pick(inv.id)}
              className={`text-left rounded-lg border px-3 py-2 text-xs transition ${
                selectedId === inv.id
                  ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              <div className="font-mono font-semibold">{inv.invoiceNo}</div>
              <div className="text-zinc-500">
                {inv.customerName} • {fmtMoney(inv.total)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-white text-sm font-semibold">
              {selected.invoiceNo} • {selected.customerName}
            </div>
            <div className="text-zinc-500 text-xs">
              {fmtDateTime(selected.timestamp)} • {selected.paymentMethod} • Total {fmtMoney(selected.total)}
            </div>
          </div>

          {selected.gst && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 text-amber-200 text-xs p-3">
              Ye GST bill hai. GST bill pe yahan se return nahi hota, uske liye alag GST credit note chahiye.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
                <tr>
                  <th className="p-2">Item</th>
                  <th className="p-2 text-right">Billed qty</th>
                  <th className="p-2 text-right">Rate</th>
                  <th className="p-2 text-center">Return qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {selected.items.map(it => (
                  <tr key={it.beerId}>
                    <td className="p-2 text-zinc-200">{it.beerName}</td>
                    <td className="p-2 text-right">{it.qty}</td>
                    <td className="p-2 text-right">{fmtMoney(it.unitPrice)}</td>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setQty(it.beerId, it.qty, (qtys[it.beerId] || 0) - 1)}
                          className="w-7 h-7 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={it.qty}
                          value={qtys[it.beerId] || 0}
                          onChange={e => setQty(it.beerId, it.qty, Number(e.target.value))}
                          className="w-14 text-center bg-zinc-900 border border-zinc-700 rounded py-1 text-zinc-200 outline-none focus:border-amber-500"
                        />
                        <button
                          onClick={() => setQty(it.beerId, it.qty, (qtys[it.beerId] || 0) + 1)}
                          className="w-7 h-7 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                        >
                          +
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (jaise: galat item, kharab beer, customer ne wapas kiya)"
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full"
          />

          {preview && 'error' in preview && (
            <div className="rounded-lg border border-rose-800/60 bg-rose-950/30 text-rose-200 text-xs p-3">
              {preview.error}
            </div>
          )}
          {preview && !('error' in preview) && (
            <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 text-emerald-200 text-xs p-3">
              {onTab
                ? `${fmtMoney(preview.refundTotal)} customer ke udhaar (tab) se kam ho jayega.`
                : `Customer ko ${fmtMoney(preview.refundTotal)} wapas dena hai (${selected.paymentMethod}).`}{' '}
              Naya bill total: {fmtMoney(preview.invoice.total)}.
            </div>
          )}

          <button
            onClick={submit}
            disabled={lines.length === 0}
            className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-rotate-left" /> Process Return
          </button>
        </div>
      )}

      {notice && (
        <div
          className={`rounded-lg border text-xs p-3 ${
            notice.ok
              ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-200'
              : 'border-rose-800/60 bg-rose-950/30 text-rose-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-3 text-xs text-zinc-400 uppercase font-mono border-b border-zinc-800">
          Return history (is phone pe)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Credit note</th>
                <th className="p-3">Bill</th>
                <th className="p-3">Items</th>
                <th className="p-3">Reason</th>
                <th className="p-3 text-right">Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    No returns yet.
                  </td>
                </tr>
              ) : (
                history.map(h => (
                  <tr key={h.id}>
                    <td className="p-3 whitespace-nowrap">{fmtDateTime(h.at)}</td>
                    <td className="p-3 font-mono">{h.creditNoteNo}</td>
                    <td className="p-3">
                      {h.invoiceNo}
                      <div className="text-zinc-500">{h.customerName}</div>
                    </td>
                    <td className="p-3">{h.lines.map(l => `${l.beerName} x${l.qty}`).join(', ')}</td>
                    <td className="p-3 text-zinc-400">{h.reason}</td>
                    <td className="p-3 text-right text-rose-300">{fmtMoney(h.refundTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
