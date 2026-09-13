import { useStore } from '@/store';
import { TapCard } from '@/components/TapCard';

export function InventoryView() {
  const { db, openModal } = useStore();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">Live Tap Lines & Keg Inventory</h3>
          <span className="text-xs text-zinc-500 font-mono">(Automatic deduction on pour & auto increase on purchase)</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openModal('purchase')} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition whitespace-nowrap">
            <i className="fa-solid fa-cart-plus" /> Buy Kegs (Stock Up)
          </button>
          <button onClick={() => openModal('beer')} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 transition whitespace-nowrap">
            <i className="fa-solid fa-plus" /> Add Tap / Beer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {db.taps.map(t => <TapCard key={t.id} tap={t} variant="inventory" />)}
      </div>
    </div>
  );
}
