import { useState, useMemo } from 'react';
import { useStore } from '@/store';
import { fmtMoney, fmtDateTime } from '@/utils';
import { sendInvoiceOnWhatsApp } from '@/lib/whatsapp';
import { usePlan } from '@/lib/plan';

export function BillingView() {
  const { db, openModal, navigate } = useStore();
  const { hasFeature } = usePlan();
  const whatsappEnabled = hasFeature('whatsapp');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return [...db.invoices].reverse().filter(inv => {
      const matchSearch = inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) || (inv.customerName || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [db.invoices, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoice #, customer name..."
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-64"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-amber-500 w-full sm:w-36"
          >
            <option value="all">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid / Tab</option>
            <option value="Partial">Partial</option>
          </select>
        </div>
        <button onClick={() => navigate('pos')} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition whitespace-nowrap">
          <i className="fa-solid fa-plus" /> Create New Sale
        </button>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
              <tr>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Date & Time</th>
                <th className="p-3">Items</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-right">Balance Due</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-zinc-500">No invoices match criteria.</td></tr>
              ) : filtered.map(inv => {
                let badgeClass = 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60';
                if (inv.status === 'Unpaid') badgeClass = 'text-amber-400 bg-amber-950/60 border border-amber-800/60';
                if (inv.status === 'Partial') badgeClass = 'text-cyan-400 bg-cyan-950/60 border border-cyan-800/60';
                const itemsSummary = inv.items.map(i => `${i.qty}x ${i.beerName}`).join(', ');
                return (
                  <tr key={inv.id} className="hover:bg-zinc-900/50 transition">
                    <td className="p-3 font-mono font-bold text-amber-400">{inv.invoiceNo}</td>
                    <td className="p-3 text-zinc-200 font-medium">{inv.customerName || 'Walk-in Guest'}</td>
                    <td className="p-3 text-zinc-400 font-mono text-[11px]">{fmtDateTime(inv.timestamp)}</td>
                    <td className="p-3 text-zinc-300 truncate max-w-xs" title={itemsSummary}>{itemsSummary}</td>
                    <td className="p-3 text-right font-mono font-bold text-white">{fmtMoney(inv.total)}</td>
                    <td className="p-3 text-right font-mono text-emerald-400">{fmtMoney(inv.paidAmount)}</td>
                    <td className={`p-3 text-right font-mono ${inv.balanceDue > 0 ? 'text-amber-400 font-bold' : 'text-zinc-500'}`}>{fmtMoney(inv.balanceDue)}</td>
                    <td className="p-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${badgeClass}`}>{inv.status}</span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => openModal('invoiceView', inv.id)} className="p-2 text-zinc-400 hover:text-amber-400" title="View / Print Receipt">
                          <i className="fa-solid fa-receipt" />
                        </button>
                        {whatsappEnabled && (
                          <button onClick={() => sendInvoiceOnWhatsApp(inv, db.settings, db.customers.find(c => c.id === inv.customerId)?.phone)} className="p-2 text-emerald-500 hover:text-emerald-400" title="Send on WhatsApp">
                            <i className="fa-brands fa-whatsapp" />
                          </button>
                        )}
                        {inv.balanceDue > 0 && (
                          <button onClick={() => openModal('payment', inv.customerId)} className="p-2 text-emerald-400 hover:text-emerald-300" title="Collect Payment">
                            <i className="fa-solid fa-hand-holding-dollar" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
