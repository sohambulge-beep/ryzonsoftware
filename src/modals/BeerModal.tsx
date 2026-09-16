import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store';
import { GST_RATES, readCachedGstSettings } from '@/lib/gst';

export function BeerModal() {
  const { modal, closeModal, saveBeer, db } = useStore();
  const open = modal.id === 'beer';
  const editId = modal.data as string | undefined;
  const existing = editId ? db.taps.find(t => t.id === editId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [tapNumber, setTapNumber] = useState(existing?.tapNumber ?? 1);
  const [brewery, setBrewery] = useState(existing?.brewery ?? '');
  const [style, setStyle] = useState(existing?.style ?? '');
  const [abv, setAbv] = useState(existing?.abv ?? 6.5);
  const [stock, setStock] = useState(existing?.currentLiters ?? 50);
  const [capacity, setCapacity] = useState(existing?.capacityLiters ?? 50);
  const [costL, setCostL] = useState(existing?.costPerLiter ?? 3.50);
  const [priceP, setPriceP] = useState(existing?.pricePerPint ?? 8.00);
  const [gstDefaults] = useState(() => readCachedGstSettings());
  const [hsnCode, setHsnCode] = useState(existing?.hsnCode ?? '');
  const [gstRate, setGstRate] = useState<number | ''>(existing?.gstRate ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveBeer({
      id: editId,
      name: name.trim(),
      tapNumber: Number(tapNumber) || 1,
      brewery: brewery.trim() || 'Craft House',
      style: style.trim() || 'Ale',
      abv: Number(abv) || 5,
      currentLiters: Number(stock) || 0,
      capacityLiters: Number(capacity) || 50,
      costPerLiter: Number(costL) || 3,
      pricePerPint: Number(priceP) || 7,
      hsnCode: hsnCode.trim(),
      ...(gstRate === '' ? {} : { gstRate: Number(gstRate) }),
    });
    closeModal();
  };

  const inputClass = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 transition';
  const labelClass = 'block text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 font-semibold font-mono';

  return (
    <Modal open={open} onClose={closeModal} title={editId ? 'Edit Beer Tap Line' : 'Add Beer Tap Line'} icon="fa-solid fa-beer-mug-empty" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Beer Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g. Hazy River NEIPA" required />
          </div>
          <div>
            <label className={labelClass}>Tap # *</label>
            <input type="number" value={tapNumber} onChange={e => setTapNumber(Number(e.target.value))} min={1} max={64} className={inputClass} required />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Brewery / Brand</label>
            <input value={brewery} onChange={e => setBrewery(e.target.value)} className={inputClass} placeholder="e.g. Sierra Hills" />
          </div>
          <div>
            <label className={labelClass}>Style</label>
            <input value={style} onChange={e => setStyle(e.target.value)} className={inputClass} placeholder="e.g. NEIPA, Stout" />
          </div>
          <div>
            <label className={labelClass}>ABV %</label>
            <input type="number" value={abv} onChange={e => setAbv(Number(e.target.value))} step={0.1} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Current Stock (Liters) *</label>
            <input type="number" value={stock} onChange={e => setStock(Number(e.target.value))} min={0} step={0.1} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Full Keg Capacity (Liters)</label>
            <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} min={5} step={0.1} className={inputClass} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cost per Liter (₹) *</label>
            <input type="number" value={costL} onChange={e => setCostL(Number(e.target.value))} min={0.1} step={0.01} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Selling Price per Pint (500ml) (₹) *</label>
            <input type="number" value={priceP} onChange={e => setPriceP(Number(e.target.value))} min={0.5} step={0.25} className={`${inputClass} font-bold text-amber-400`} required />
          </div>
        </div>
        <div className="pt-2 border-t border-zinc-800 space-y-3">
          <p className="text-[0.65rem] uppercase tracking-wider text-emerald-400 font-semibold font-mono">GST Details (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>HSN / SAC Code</label>
              <input value={hsnCode} onChange={e => setHsnCode(e.target.value)} className={`${inputClass} font-mono`} placeholder={gstDefaults.defaultHsn || '22030000'} maxLength={8} />
            </div>
            <div>
              <label className={labelClass}>GST Rate</label>
              <select value={gstRate} onChange={e => setGstRate(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass}>
                <option value="">Use business default ({gstDefaults.defaultGstRate}%)</option>
                {GST_RATES.map(r => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={closeModal} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2 px-4 text-sm transition">Cancel</button>
          <button type="submit" className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2 px-4 text-sm hover:brightness-110 transition">Save Tap Line</button>
        </div>
      </form>
    </Modal>
  );
}
