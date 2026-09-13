import { useState, useEffect } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';

export function PaymentModal() {
  const { modal, closeModal, savePayment, db } = useStore();
  const open = modal.id === 'payment';
  const presetCustomerId = modal.data as string | undefined;

  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      const custId = presetCustomerId || db.customers[0]?.id || '';
      setCustomerId(custId);
      const cust = db.customers.find(c => c.id === custId);
      setAmount(cust && cust.currentBalance > 0 ? cust.currentBalance.toFixed(2) : '10.00');
      setNotes('');
    }
  }, [open, presetCustomerId, db.customers]);

  const selectedCust = db.customers.find(c => c.id === customerId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!customerId || amt <= 0) return;
    savePayment({ customerId, amount: amt, paymentMethod: method, notes: notes.trim() });
    closeModal();
    if (selectedCust) {
      alert(`Payment of ${fmtMoney(amt)} recorded for ${selectedCust.name}. Remaining Tab Balance: ${fmtMoney(Math.max(0, selectedCust.currentBalance - amt))}`);
    }
  };

  const inputClass = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 font-semibold font-mono';

  return (
    <Modal open={open} onClose={closeModal} title="Record Customer Tab Payment" icon="fa-solid fa-hand-holding-dollar" iconClass="text-emerald-400">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className={labelClass}>Select Customer *</label>
          <select value={customerId} onChange={e => { setCustomerId(e.target.value); const c = db.customers.find(x => x.id === e.target.value); setAmount(c && c.currentBalance > 0 ? c.currentBalance.toFixed(2) : '10.00'); }} className={inputClass} required>
            {db.customers.length === 0 ? (
              <option value="">No customers yet</option>
            ) : db.customers.map(c => (
              <option key={c.id} value={c.id}>{c.name} (Due: {fmtMoney(c.currentBalance)})</option>
            ))}
          </select>
        </div>
        <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800 text-xs flex justify-between items-center">
          <span className="text-zinc-400">Current Outstanding Balance:</span>
          <span className="text-amber-400 font-mono font-bold text-sm">{fmtMoney(selectedCust?.currentBalance ?? 0)}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Payment Amount (₹) *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={0.5} step={0.01} className={`${inputClass} font-bold text-emerald-400`} required />
          </div>
          <div>
            <label className={labelClass}>Payment Method *</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={inputClass}>
              <option value="Cash">Cash</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Debit / UPI">Debit / UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Reference Note / Details</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} placeholder="e.g. Cleared Friday bar tab" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={closeModal} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2 px-4 text-sm transition">Cancel</button>
          <button type="submit" className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg py-2 px-4 text-sm hover:brightness-110 transition">Record & Settle Balance</button>
        </div>
      </form>
    </Modal>
  );
}
