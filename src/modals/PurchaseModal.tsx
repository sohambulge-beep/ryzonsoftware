import { useState, useEffect } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';

export function PurchaseModal() {
  const { modal, closeModal, savePurchase, db } = useStore();
  const open = modal.id === 'purchase';
  const presetBeerId = modal.data as string | undefined;

  const [supplierId, setSupplierId] = useState('');
  const [beerId, setBeerId] = useState('');
  const [kegQty, setKegQty] = useState(1);
  const [litersPerKeg, setLitersPerKeg] = useState(50);
  const [costPerLiter, setCostPerLiter] = useState(3.20);

  useEffect(() => {
    if (open) {
      const bId = presetBeerId || db.taps[0]?.id || '';
      setBeerId(bId);
      const beer = db.taps.find(t => t.id === bId);
      if (beer) {
        setLitersPerKeg(beer.capacityLiters);
        setCostPerLiter(beer.costPerLiter);
        setSupplierId(beer.supplierId || db.suppliers[0]?.id || '');
      } else {
        setSupplierId(db.suppliers[0]?.id || '');
      }
      setKegQty(1);
    }
  }, [open, presetBeerId, db.taps, db.suppliers]);

  const totalVolume = kegQty * litersPerKeg;
  const totalCost = totalVolume * costPerLiter;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !beerId) return;
    savePurchase({ supplierId, beerId, kegQty: Number(kegQty), litersPerKeg: Number(litersPerKeg), costPerLiter: Number(costPerLiter) });
    closeModal();
  };

  const inputClass = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 font-semibold font-mono';

  if (db.suppliers.length === 0 && open) {
    return (
      <Modal open={open} onClose={closeModal} title="Record Keg Purchase" icon="fa-solid fa-cart-flatbed">
        <div className="p-5 text-center text-zinc-400 text-sm">
          Please add at least one supplier before recording a purchase.
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={closeModal} title="Record Keg Purchase (Auto-Restock)" icon="fa-solid fa-cart-flatbed" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className={labelClass}>Select Supplier / Brewery *</label>
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputClass} required>
            {db.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Select Beer / Tap Stock to Restock *</label>
          <select
            value={beerId}
            onChange={e => {
              setBeerId(e.target.value);
              const beer = db.taps.find(t => t.id === e.target.value);
              if (beer) { setLitersPerKeg(beer.capacityLiters); setCostPerLiter(beer.costPerLiter); }
            }}
            className={inputClass}
            required
          >
            {db.taps.map(t => <option key={t.id} value={t.id}>Tap #{t.tapNumber}: {t.name} (Current: {t.currentLiters.toFixed(1)}L)</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Number of Kegs *</label>
            <input type="number" value={kegQty} onChange={e => setKegQty(Number(e.target.value))} min={1} step={1} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Keg Size (Liters per keg)</label>
            <input type="number" value={litersPerKeg} onChange={e => setLitersPerKeg(Number(e.target.value))} min={5} step={0.1} className={inputClass} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Cost Price Per Liter (₹) *</label>
            <input type="number" value={costPerLiter} onChange={e => setCostPerLiter(Number(e.target.value))} min={0.01} step={0.01} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Total Purchase Cost (₹)</label>
            <input type="number" value={totalCost.toFixed(2)} readOnly className={`${inputClass} font-bold text-amber-400`} />
          </div>
        </div>
        <div className="p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <i className="fa-solid fa-circle-check text-base" />
          <span>Restock Action: <strong>{totalVolume.toFixed(1)} Liters</strong> will be added directly to the beer inventory line.</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={closeModal} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2 px-4 text-sm transition">Cancel</button>
          <button type="submit" className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-sm flex items-center gap-2 hover:brightness-110 transition">
            <i className="fa-solid fa-check" /> Record & Restock
          </button>
        </div>
      </form>
    </Modal>
  );
}
