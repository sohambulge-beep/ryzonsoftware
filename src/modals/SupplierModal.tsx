import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store';

export function SupplierModal() {
  const { modal, closeModal, saveSupplier } = useStore();
  const open = modal.id === 'supplier';

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveSupplier({ name: name.trim(), contact: contact.trim(), phone: phone.trim(), email: email.trim() });
    closeModal();
  };

  const inputClass = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 font-semibold font-mono';

  return (
    <Modal open={open} onClose={closeModal} title="Add New Supplier / Brewery" icon="fa-solid fa-building">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className={labelClass}>Brewery / Supplier Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g. Sierra Nevada Brewing Co." required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Contact Person</label>
            <input value={contact} onChange={e => setContact(e.target.value)} className={inputClass} placeholder="e.g. Alex Rep" />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="e.g. 555-0199" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="orders@brewery.com" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={closeModal} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2 px-4 text-sm transition">Cancel</button>
          <button type="submit" className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-sm hover:brightness-110 transition">Save Supplier</button>
        </div>
      </form>
    </Modal>
  );
}
