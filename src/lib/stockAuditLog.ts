import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { fmtMoney, fmtDateTime } from '@/utils';
import { whoAmI } from '@/lib/voidLog';
import {
  addAuditEntry,
  buildAuditRows,
  readAuditLog,
  AUDIT_EVENT,
  type StockAuditEntry,
} from '@/lib/stockAuditLog';

export function StockAuditView() {
  const { db, restoreData } = useStore();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<StockAuditEntry[]>([]);

  // The log lives in localStorage, so it is read after the page has loaded.
  useEffect(() => {
    const load = () => setHistory(readAuditLog());
    load();
    window.addEventListener(AUDIT_EVENT, load);
    return () => window.removeEventListener(AUDIT_EVENT, load);
  }, []);

  const { rows, error } = useMemo(() => buildAuditRows(db.taps, inputs), [db.taps, inputs]);
  const rowOf = (id: string) => rows.find(r => r.tapId === id);
  const net = rows.reduce((s, r) => s + r.costValue, 0);
  const shortage = rows.filter(r => r.costValue < 0).reduce((s, r) => s + r.costValue, 0);

  const save = (adjust: boolean) => {
    if (error) return setNotice({ ok: false, text: error });
    if (rows.length === 0) return setNotice({ ok: false, text: 'Kam se kam ek tap ke litres daalo.' });
    if (
      adjust &&
      !confirm('App ka stock aapke daale hue litres pe set ho jayega. Ye wapas nahi hoga (record history mein rahega). Continue?')
    ) {
      return;
    }
    const stamp = Date.now();
    const saved = addAuditEntry({
      id: `aud-${stamp}`,
      at: new Date(stamp).toISOString(),
      by: whoAmI(),
      note: note.trim().slice(0, 200),
      adjusted: adjust,
      rows,
      netCostValue: Math.round(net * 100) / 100,
    });
    if (!saved) return setNotice({ ok: false, text: 'Record is phone pe save nahi ho paya, isliye kuch change nahi hua.' });
    if (adjust) {
      const counted = new Map(rows.map(r => [r.tapId, r.actualL]));
      restoreData({
        ...db,
        taps: db.taps.map(t => (counted.has(t.id) ? { ...t, currentLiters: counted.get(t.id) as number } : t)),
      });
    }
    setNotice({
      ok: true,
      text: adjust ? 'Audit save ho gaya aur stock update ho gaya.' : 'Audit save ho gaya (stock nahi badla).',
    });
    setInputs({});
    setNote('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <i className="fa-solid fa-clipboard-check text-amber-400" /> Stock Audit (asli naap vs software)
        </div>
        <p className="text-zinc-500 text-xs">
          Har keg mein asli bacha hua litre naap ke daalo. Jis tap ko count nahi karna, khali chhod do. Negative difference
          matlab software se kam beer hai (shortage).
        </p>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
              <tr>
                <th className="p-3">Tap</th>
                <th className="p-3 text-right">Software (L)</th>
                <th className="p-3 text-center">Asli (L)</th>
                <th className="p-3 text-right">Difference</th>
                <th className="p-3 text-right">Value (cost)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {db.taps.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-500">No taps added yet.</td>
                </tr>
              )}
              {db.taps.map(t => {
                const r = rowOf(t.id);
                const bad = r && r.diffL <= -0.5;
                return (
                  <tr key={t.id}>
                    <td className="p-3 text-zinc-200">#{t.tapNumber} {t.name}</td>
                    <td className="p-3 text-right font-mono">{(Number(t.currentLiters) || 0).toFixed(1)}</td>
                    <td className="p-3 text-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={inputs[t.id] ?? ''}
                        onChange={e => setInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                        placeholder="-"
                        className="w-20 text-center bg-zinc-900 border border-zinc-700 rounded py-1 text-zinc-200 outline-none focus:border-amber-500"
                      />
                    </td>
                    <td className={`p-3 text-right font-mono ${bad ? 'text-rose-300' : r && r.diffL > 0 ? 'text-sky-300' : ''}`}>
                      {r ? `${r.diffL > 0 ? '+' : ''}${r.diffL.toFixed(2)} L (${r.pints > 0 ? '+' : ''}${r.pints} pint)` : '-'}
                    </td>
                    <td className={`p-3 text-right font-mono ${r && r.costValue < 0 ? 'text-rose-300' : ''}`}>
                      {r ? fmtMoney(r.costValue) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-800/60 bg-rose-950/30 text-rose-200 text-xs p-3">{error}</div>
      )}

      {rows.length > 0 && !error && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 text-zinc-200 text-xs p-3 space-y-1">
          <div>Counted taps: {rows.length}</div>
          <div className="text-rose-300">Total shortage (cost pe): {fmtMoney(shortage)}</div>
          <div>Net difference (shortage + extra): {fmtMoney(net)}</div>
        </div>
      )}

      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note (optional, jaise: Sunday closing count)"
        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full"
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => save(false)}
          disabled={rows.length === 0}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 font-medium rounded-lg py-2.5 px-4 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Sirf record save karo
        </button>
        <button
          onClick={() => save(true)}
          disabled={rows.length === 0}
          className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save + stock asli litres pe set karo
        </button>
      </div>

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
          Audit history (is phone pe)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Taps</th>
                <th className="p-3">Details</th>
                <th className="p-3">Stock set?</th>
                <th className="p-3 text-right">Net value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-500">No audits yet.</td>
                </tr>
              ) : (
                history.map(h => (
                  <tr key={h.id}>
                    <td className="p-3 whitespace-nowrap">{fmtDateTime(h.at)}</td>
                    <td className="p-3">{h.rows.length}</td>
                    <td className="p-3 text-zinc-400">
                      {h.rows.map(r => `${r.tapName} ${r.diffL > 0 ? '+' : ''}${r.diffL}L`).join(', ')}
                      {h.note ? ` • ${h.note}` : ''}
                    </td>
                    <td className="p-3">{h.adjusted ? 'Haan' : 'Nahi'}</td>
                    <td className={`p-3 text-right ${h.netCostValue < 0 ? 'text-rose-300' : ''}`}>
                      {fmtMoney(h.netCostValue)}
                    </td>
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
