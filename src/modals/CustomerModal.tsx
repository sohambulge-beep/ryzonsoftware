import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store';

export function CustomerModal() {
  const { modal, closeModal, saveCustomer, db } = useStore();
  const open = modal.id === 'customer';
  const editId = modal.data as string | undefined;

  const existing = editId ? db.customers.find(c => c.id === editId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [limit, setLimit] = useState(existing?.tabLimit ?? 200);
  const [gstin, setGstin] = useState(existing?.gstin ?? '');
  const [legalName, setLegalName] = useState(existing?.legalName ?? '');
  const [billingAddress, setBillingAddress] = useState(existing?.billingAddress ?? '');
  const [stateName, setStateName] = useState(existing?.stateName ?? '');
  const [stateCode, setStateCode] = useState(existing?.stateCode ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveCustomer({
      id: editId,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      tabLimit: Number(limit) || 200,
      gstin: gstin.trim().toUpperCase(),
      legalName: legalName.trim(),
      billingAddress: billingAddress.trim(),
      stateName: stateName.trim(),
      stateCode: (stateCode || gstin.slice(0, 2)).trim(),
    });
    closeModal();
  };

  const inputClass = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 font-semibold font-mono';

  return (
    <Modal open={open} onClose={closeModal} title={editId ? 'Edit Customer' : 'Add New Customer'} icon="fa-solid fa-user">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className={labelClass}>Full Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g. John Doe" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Phone Number</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="e.g. 555-4421" />
          </div>
          <div>
            <label className={labelClass}>Credit / Tab Limit (₹)</label>
            <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} min={0} step={10} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Email Address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="john@example.com" />
        </div>
        <div className="pt-2 border-t border-zinc-800 space-y-3">
          <p className="text-[0.65rem] uppercase tracking-wider text-emerald-400 font-semibold font-mono">GST Billing Details (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>GSTIN</label>
              <input value={gstin} onChange={e => { setGstin(e.target.value.toUpperCase()); if (e.target.value.length >= 2) setStateCode(e.target.value.slice(0, 2)); }} className={inputClass} placeholder="27ABCDE1234F1Z5" maxLength={15} />
            </div>
            <div>
              <label className={labelClass}>Legal / Trade Name</label>
              <input value={legalName} onChange={e => setLegalName(e.target.value)} className={inputClass} placeholder="Registered business name" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Billing Address</label>
            <input value={billingAddress} onChange={e => setBillingAddress(e.target.value)} className={inputClass} placeholder="Street, area, city, pincode" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>State</label>
              <input value={stateName} onChange={e => setStateName(e.target.value)} className={inputClass} placeholder="e.g. Maharashtra" />
            </div>
            <div>
              <label className={labelClass}>State Code</label>
              <input value={stateCode} onChange={e => setStateCode(e.target.value)} className={inputClass} placeholder="27" maxLength={2} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={closeModal} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2 px-4 text-sm transition">Cancel</button>
          <button type="submit" className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-sm hover:brightness-110 transition">Save Customer</button>
        </div>
      </form>
    </Modal>
  );
}
