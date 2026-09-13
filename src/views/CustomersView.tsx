import { useState, useMemo } from 'react';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';

export function CustomersView() {
  const { db, openModal } = useStore();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return db.customers.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [db.customers, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, phone, notes..."
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-64"
        />
        <button onClick={() => openModal('customer')} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition whitespace-nowrap">
          <i className="fa-solid fa-user-plus" /> Add New Customer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-zinc-500 text-xs">No customer records found.</div>
        ) : filtered.map(c => {
          const hasBalance = c.currentBalance > 0;
          const usagePct = Math.min(100, Math.round((c.currentBalance / (c.tabLimit || 1)) * 100));
          return (
            <div key={c.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-white text-sm">{c.name}</h4>
                  <div className="text-xs text-zinc-400 font-mono mt-0.5">{c.phone || 'No phone'} &bull; {c.email || 'No email'}</div>
                </div>
                <button onClick={() => openModal('customer', c.id)} className="text-zinc-500 hover:text-amber-400 text-xs p-1">
                  <i className="fa-solid fa-pen-to-square" />
                </button>
              </div>
              <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Current Tab Balance:</span>
                  <span className={`font-mono font-bold ${hasBalance ? 'text-amber-400 text-sm' : 'text-emerald-400'}`}>{fmtMoney(c.currentBalance)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>Tab Limit: {fmtMoney(c.tabLimit)}</span>
                  <span>{usagePct}% limit used</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div className={`${usagePct > 80 ? 'bg-red-500' : 'bg-amber-500'} h-1.5 rounded-full transition-all`} style={{ width: `${usagePct}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-zinc-500 font-mono">Lifetime: {fmtMoney(c.totalSpent)}</span>
                {hasBalance ? (
                  <button onClick={() => openModal('payment', c.id)} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg py-1.5 px-3 text-xs flex items-center gap-1.5 hover:brightness-110 transition">
                    <i className="fa-solid fa-hand-holding-dollar" /> Settle Tab
                  </button>
                ) : (
                  <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1"><i className="fa-solid fa-check" /> Clean Tab</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
