import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store';

const CATEGORIES = ['CO2 & Gas', 'Rent & Utilities', 'Staff & Wages', 'Maintenance & Line Cleaning', 'Bar Supplies', 'Licensing & Taxes', 'Other'];

export function ExpenseModal() {
  const { modal, closeModal, saveExpense } = useStore();
  const open = modal.id === 'expense';

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Bank Transfer');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!title.trim() || amt <= 0) return;
    saveExpense({ title: title.trim(), category, amount: amt, paymentMethod: method });
    closeModal();
  };

  const inputClass = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 font-semibold font-mono';

  return (
    <Modal open={open} onClose={closeModal} title="Record Operating Expense" icon="fa-solid fa-money-bill-wave" iconClass="text-red-400">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className={labelClass}>Expense Description / Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Food-grade CO2 refill" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Category *</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Amount (₹) *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={0.01} step={0.01} className={`${inputClass} font-bold text-red-400`} required />
          </div>
        </div>
        <div>
          <label className={labelClass}>Payment Method</label>
          <select value={method} onChange={e => setMethod(e.target.value)} className={inputClass}>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Company Card">Company Card</option>
            <option value="Cash / Petty Cash">Cash / Petty Cash</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={closeModal} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2 px-4 text-sm transition">Cancel</button>
          <button type="submit" className="bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg py-2 px-4 text-sm hover:brightness-110 transition">Save Expense</button>
        </div>
      </form>
    </Modal>
  );
}
