import { useStore } from '@/store';
import { fmtMoney, fmtDateTime } from '@/utils';

export function PaymentsView() {
  const { db, openModal } = useStore();

  const totalOut = db.customers.reduce((s, c) => s + c.currentBalance, 0);
  const totalCollected = db.payments.reduce((s, p) => s + p.amount, 0);
  const owingCount = db.customers.filter(c => c.currentBalance > 0).length;
  const owingCustomers = db.customers.filter(c => c.currentBalance > 0);

  const stats = [
    { label: 'Total Tab Balance Outstanding', value: fmtMoney(totalOut), class: 'text-amber-400', sub: 'Pending collection from open customer tabs' },
    { label: 'Collected Payments (Total)', value: fmtMoney(totalCollected), class: 'text-emerald-400', sub: 'Directly settled cash/card/UPI transactions' },
    { label: 'Customers with Open Tabs', value: `${owingCount} Customer${owingCount === 1 ? '' : 's'}`, class: 'text-cyan-400', sub: 'Patrons with pending tab credit' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-hand-holding-dollar text-emerald-400" /> Customer Payments & Credit Ledger
          </h2>
          <p className="text-xs text-zinc-400">Record tab settlements, track pending balances and view complete customer payment history</p>
        </div>
        <button onClick={() => openModal('payment')} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition whitespace-nowrap">
          <i className="fa-solid fa-plus" /> Record Payment / Settle Tab
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono text-zinc-400 uppercase">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 font-mono ${s.class}`}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-3">
        <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
          <i className="fa-solid fa-clock text-amber-400" /> Outstanding Customer Balances (Action Required)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {owingCustomers.length === 0 ? (
            <div className="col-span-3 text-center py-6 text-emerald-400 text-xs font-semibold">
              <i className="fa-solid fa-circle-check" /> All customer tabs are completely settled!
            </div>
          ) : owingCustomers.map(c => (
            <div key={c.id} className="p-3 bg-zinc-950 border border-amber-500/30 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-xs">{c.name}</div>
                <div className="text-[11px] text-zinc-400 font-mono">{c.phone || 'No phone'}</div>
                <div className="text-xs text-amber-400 font-mono font-bold mt-1">Due: {fmtMoney(c.currentBalance)}</div>
              </div>
              <button onClick={() => openModal('payment', c.id)} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg py-2 px-3 text-xs flex items-center gap-1.5 hover:brightness-110 transition whitespace-nowrap">
                <i className="fa-solid fa-dollar-sign" /> Pay Tab
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Payment Transaction History</h3>
          <span className="text-xs font-mono text-zinc-400">All recorded customer receipts</span>
        </div>
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
                <tr>
                  <th className="p-3">Receipt #</th>
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Method</th>
                  <th className="p-3 text-right">Amount Paid</th>
                  <th className="p-3">Notes / Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {db.payments.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-zinc-500">No payment records logged yet.</td></tr>
                ) : [...db.payments].reverse().map(p => (
                  <tr key={p.id} className="hover:bg-zinc-900/50 transition">
                    <td className="p-3 font-mono font-bold text-emerald-400">{p.receiptNo || p.id}</td>
                    <td className="p-3 font-mono text-zinc-400 text-[11px]">{fmtDateTime(p.timestamp)}</td>
                    <td className="p-3 font-medium text-white">{p.customerName}</td>
                    <td className="p-3"><span className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">{p.paymentMethod}</span></td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">+{fmtMoney(p.amount)}</td>
                    <td className="p-3 text-zinc-400 truncate max-w-xs">{p.notes || 'Tab Payment'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
