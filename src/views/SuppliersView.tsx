import { useStore } from '@/store';
import { fmtMoney } from '@/utils';

export function SuppliersView() {
  const { db, openModal } = useStore();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-truck text-amber-400" /> Suppliers & Keg Purchases
          </h2>
          <p className="text-xs text-zinc-400">Purchasing kegs automatically increases stock volume and updates cost tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => openModal('supplier')} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 transition whitespace-nowrap">
            <i className="fa-solid fa-building" /> Add Supplier
          </button>
          <button onClick={() => openModal('purchase')} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-2.5 px-4 text-xs flex items-center gap-2 hover:brightness-110 transition whitespace-nowrap">
            <i className="fa-solid fa-cart-plus" /> Record Keg Purchase
          </button>
        </div>
      </div>

      <div>
        <div className="text-xs font-mono uppercase text-zinc-400 mb-2 font-semibold">Registered Breweries & Distributors</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {db.suppliers.length === 0 ? (
            <div className="col-span-3 text-center py-6 text-zinc-500 text-xs">No suppliers added yet.</div>
          ) : db.suppliers.map(sup => {
            const totalBought = db.purchases.filter(p => p.supplierId === sup.id).reduce((s, p) => s + p.totalCost, 0);
            return (
              <div key={sup.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <i className="fa-solid fa-truck text-amber-400" /> {sup.name}
                    </h4>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/40">Active Supplier</span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-400">
                    <div><i className="fa-solid fa-user w-4 text-zinc-500" /> {sup.contact || 'Direct Sales'}</div>
                    <div><i className="fa-solid fa-phone w-4 text-zinc-500" /> {sup.phone || 'N/A'}</div>
                    <div><i className="fa-solid fa-envelope w-4 text-zinc-500" /> {sup.email || 'N/A'}</div>
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-500">Total Procured:</span>
                  <span className="font-bold text-amber-400">{fmtMoney(totalBought)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Purchase Orders & Stock Receipts</h3>
          <span className="text-xs font-mono text-emerald-400">Auto-restocks connected taps</span>
        </div>
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
                <tr>
                  <th className="p-3">PO #</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Supplier / Brewery</th>
                  <th className="p-3">Beer / Item</th>
                  <th className="p-3 text-center">Kegs Bought</th>
                  <th className="p-3 text-center">Volume Added</th>
                  <th className="p-3 text-right">Cost / Liter</th>
                  <th className="p-3 text-right">Total Cost</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {db.purchases.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-zinc-500">No purchase records found.</td></tr>
                ) : [...db.purchases].reverse().map(p => {
                  const sup = db.suppliers.find(s => s.id === p.supplierId);
                  const beer = db.taps.find(t => t.id === p.beerId);
                  return (
                    <tr key={p.id} className="hover:bg-zinc-900/50 transition">
                      <td className="p-3 font-mono font-bold text-amber-400">{p.id.toUpperCase()}</td>
                      <td className="p-3 font-mono text-zinc-400">{p.date}</td>
                      <td className="p-3 font-medium text-white">{sup ? sup.name : 'Unknown Supplier'}</td>
                      <td className="p-3 text-zinc-200">{beer ? `${beer.name} (Tap #${beer.tapNumber})` : 'Draft Line'}</td>
                      <td className="p-3 text-center font-mono font-bold text-zinc-100">{p.kegQty} Keg{p.kegQty > 1 ? 's' : ''}</td>
                      <td className="p-3 text-center font-mono text-emerald-400 font-bold">+{p.litersAdded.toFixed(1)} L</td>
                      <td className="p-3 text-right font-mono text-zinc-300">{fmtMoney(p.costPerLiter)}/L</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-400">{fmtMoney(p.totalCost)}</td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-900/40">
                          <i className="fa-solid fa-circle-check" /> Stock Added
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
