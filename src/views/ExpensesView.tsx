import { useState, useMemo } from 'react';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';

const CATEGORIES = ['CO2 & Gas', 'Rent & Utilities', 'Staff & Wages', 'Maintenance & Line Cleaning', 'Bar Supplies', 'Licensing & Taxes', 'Other'];

export function ExpensesView() {
  const { db, openModal, deleteExpense } = useStore();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const filtered = useMemo(() => {
    return [...db.expenses].reverse().filter(exp => {
      const matchSearch = exp.title.toLowerCase().includes(search.toLowerCase());
      const matchCat = catFilter === 'all' || exp.category === catFilter;
      return matchSearch && matchCat;
    });
  }, [db.expenses, search, catFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search expense description..."
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-64"
          />
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-40"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={() => openModal('expense')} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition whitespace-nowrap">
          <i className="fa-solid fa-receipt" /> Record Expense
        </button>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Title / Details</th>
                <th className="p-3">Category</th>
                <th className="p-3">Payment Method</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-zinc-500">No expenses recorded.</td></tr>
              ) : filtered.map(exp => (
                <tr key={exp.id} className="hover:bg-zinc-900/50 transition">
                  <td className="p-3 font-mono text-zinc-400">{exp.date}</td>
                  <td className="p-3 font-medium text-white">{exp.title}</td>
                  <td className="p-3"><span className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">{exp.category}</span></td>
                  <td className="p-3 text-zinc-400 font-mono text-[11px]">{exp.paymentMethod || 'Bank'}</td>
                  <td className="p-3 text-right font-mono font-bold text-red-400">{fmtMoney(exp.amount)}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => { if (confirm('Delete this expense?')) deleteExpense(exp.id); }} className="text-zinc-500 hover:text-red-400 p-2" title="Delete">
                      <i className="fa-solid fa-trash-can text-xs" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
