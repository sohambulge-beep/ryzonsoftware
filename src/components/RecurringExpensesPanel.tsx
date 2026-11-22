import { useEffect, useState } from 'react';
import { fmtMoney } from '@/utils';
import {
  CHANGE_EVENT,
  WEEKDAYS,
  localDateStr,
  makeId,
  nextDue,
  readTemplates,
  saveTemplates,
  type Frequency,
  type RecurringTemplate,
} from '@/lib/recurringExpenses';

const CATEGORIES = ['CO2 & Gas', 'Rent & Utilities', 'Staff & Wages', 'Maintenance & Line Cleaning', 'Bar Supplies', 'Licensing & Taxes', 'Other'];
const METHODS = ['Bank Transfer', 'Company Card', 'Cash / Petty Cash'];

const fmtDay = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return '-';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const inputClass = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500';
const labelClass = 'block text-[10px] uppercase tracking-wider text-zinc-400 mb-1 font-semibold font-mono';

export function RecurringExpensesPanel() {
  const [list, setList] = useState<RecurringTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[1]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(METHODS[0]);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [day, setDay] = useState(1);

  // Read after the page has opened, so the server and the browser start the same.
  useEffect(() => {
    setList(readTemplates());
  }, []);

  const commit = (next: RecurringTemplate[]) => {
    setList(next);
    saveTemplates(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!title.trim()) return setError('Kharche ka naam likho.');
    if (!(amt > 0)) return setError('Amount 0 se zyada hona chahiye.');
    setError('');
    commit([
      ...list,
      {
        id: makeId(),
        title: title.trim(),
        category,
        amount: amt,
        paymentMethod: method,
        frequency,
        day,
        startDate: localDateStr(new Date()),
        active: true,
      },
    ]);
    setTitle('');
    setAmount('');
    setOpen(false);
  };

  const toggle = (id: string) => commit(list.map(t => (t.id === id ? { ...t, active: !t.active } : t)));
  const remove = (id: string) => {
    if (confirm('Ye auto kharcha hata dein? Pehle se bane kharche nahi hatenge.')) commit(list.filter(t => t.id !== id));
  };

  const today = new Date();

  return (
    <div className="pt-glass pt-panel bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-arrows-rotate text-amber-400" />
          <h2 className="text-sm font-bold text-white">Auto kharche (rent, bijli, salary)</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 rounded-lg py-2 px-3 text-xs"
        >
          {open ? 'Band karo' : '+ Naya auto kharcha'}
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Ek baar set karo, ye kharche app khulne par apne aap record ho jaate hain. Isse net profit sahi rehta hai.
        Ye sirf is phone pe set hote hain, aur isi phone pe app khulne par jude jaate hain.
      </p>

      {open && (
        <form onSubmit={add} className="rounded-lg border border-zinc-700/70 p-3 space-y-3">
          <div>
            <label className={labelClass}>Kharche ka naam</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Shop rent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Amount (₹)</label>
              <input type="number" min={0.01} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Kab kab</label>
              <select
                value={frequency}
                onChange={e => {
                  const f = e.target.value as Frequency;
                  setFrequency(f);
                  setDay(f === 'monthly' ? 1 : 1);
                }}
                className={inputClass}
              >
                <option value="monthly">Har mahine</option>
                <option value="weekly">Har hafte</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{frequency === 'monthly' ? 'Kaunsi tarikh (1-28)' : 'Kaunsa din'}</label>
              {frequency === 'monthly' ? (
                <select value={day} onChange={e => setDay(Number(e.target.value))} className={inputClass}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <select value={day} onChange={e => setDay(Number(e.target.value))} className={inputClass}>
                  {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
                </select>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass}>Payment method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={inputClass}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {error && <div className="text-xs text-rose-300">{error}</div>}
          <button type="submit" className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-xs">
            Save auto kharcha
          </button>
          <p className="text-[11px] text-zinc-500">Aaj se shuru hoga. Pichle dino ka kuch apne aap nahi judega.</p>
        </form>
      )}

      {list.length === 0 ? (
        <div className="text-xs text-zinc-500">Abhi koi auto kharcha set nahi hai.</div>
      ) : (
        <div className="space-y-2">
          {list.map(t => {
            const next = nextDue(t, today);
            return (
              <div key={t.id} className={`rounded-lg border border-zinc-700/70 p-3 text-xs ${t.active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-sm text-white">{t.title}</div>
                  <div className="font-mono font-bold text-red-400">{fmtMoney(t.amount)}</div>
                </div>
                <div className="mt-1 text-zinc-400">
                  {t.frequency === 'monthly' ? `Har mahine ${t.day} tarikh` : `Har ${WEEKDAYS[t.day]}`} • {t.category}
                  {t.active && next ? ` • Agla: ${fmtDay(next)}` : ''}
                  {!t.active ? ' • Roka hua' : ''}
                </div>
                <div className="mt-2 flex gap-3">
                  <button type="button" onClick={() => toggle(t.id)} className="text-amber-400 hover:underline">
                    {t.active ? 'Roko' : 'Dobara shuru karo'}
                  </button>
                  <button type="button" onClick={() => remove(t.id)} className="text-rose-400 hover:underline">
                    Hatao
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
