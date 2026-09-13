import { useState, useMemo } from 'react';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';

const CATEGORIES = ['all', 'IPA', 'Stout', 'Lager', 'Wheat'];

export function PosView() {
  const { db, cart, addToCart, updateCartQty, clearCart, setCartCustomer, cartCustomerId, processCheckout, openModal } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const filtered = useMemo(() => {
    return db.taps.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.brewery.toLowerCase().includes(search.toLowerCase()) || t.style.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === 'all' || t.style.toLowerCase().includes(category.toLowerCase());
      return matchSearch && matchCat;
    });
  }, [db.taps, search, category]);

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const tax = Number((subtotal * db.settings.taxRate).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  const checkout = (method: 'Cash' | 'Card' | 'Tab') => {
    const invId = processCheckout(method);
    if (invId) {
      openModal('invoiceView', invId);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Menu & Taps */}
      <div className="lg:col-span-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/70 p-3 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <i className="fa-solid fa-magnifying-glass text-zinc-400 text-sm pl-2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search beer style, brewery or name..."
              className="bg-transparent text-sm w-full outline-none text-zinc-200"
            />
          </div>
          <div className="flex gap-1.5">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-2.5 py-1 text-xs rounded font-bold transition ${
                  category === cat ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-zinc-500 text-xs">No beer taps match search query.</div>
          ) : filtered.map(t => {
            const isOut = t.currentLiters < 0.5;
            return (
              <button
                key={t.id}
                type="button"
                disabled={isOut}
                onClick={() => !isOut && addToCart(t.id)}
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all text-left touch-manipulation ${
                  isOut
                    ? 'opacity-40 border-red-900/40 bg-zinc-900/30 cursor-not-allowed'
                    : 'bg-gradient-to-b from-[#271e16] to-[#181411] border-zinc-800 cursor-pointer hover:border-amber-500/60 hover:-translate-y-0.5 active:border-amber-500/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">TAP #{t.tapNumber}</span>
                    <span className={`text-[10px] font-mono ${t.currentLiters < 5 ? 'text-red-400 font-bold' : 'text-zinc-400'}`}>{t.currentLiters.toFixed(1)}L left</span>
                  </div>
                  <h4 className="font-bold text-white text-xs leading-snug line-clamp-1">{t.name}</h4>
                  <p className="text-[10px] text-zinc-400">{t.brewery} &bull; {t.style} ({t.abv}%)</p>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-amber-400">{fmtMoney(t.pricePerPint)}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded transition ${isOut ? '' : 'bg-zinc-800 group-hover:bg-amber-500 group-hover:text-zinc-950'} text-zinc-300`}>
                    {isOut ? 'TAPPED OUT' : '+ Add Pint'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart */}
      <div className="lg:col-span-5 bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 flex flex-col h-[calc(100vh-140px)] lg:sticky lg:top-0">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-receipt text-amber-400" />
            <h3 className="font-bold text-white text-sm">Active Pour Ticket</h3>
          </div>
          <button onClick={clearCart} className="text-xs text-red-400 hover:underline px-2 py-1">Clear</button>
        </div>

        <div className="py-3 border-b border-zinc-800/80">
          <label className="text-[0.65rem] uppercase tracking-wider text-zinc-400 mb-1.5 block font-semibold font-mono">Assign Customer / Tab (Optional)</label>
          <div className="flex gap-2">
            <select
              value={cartCustomerId}
              onChange={e => setCartCustomer(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500"
            >
              <option value="">Walk-in Guest</option>
              {db.customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} (Tab: {fmtMoney(c.currentBalance)} / {fmtMoney(c.tabLimit)})</option>
              ))}
            </select>
            <button onClick={() => openModal('customer')} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 rounded-lg px-3 py-1.5 text-xs" title="Add New Customer">+</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin py-3 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              <i className="fa-solid fa-beer-mug-empty text-3xl mb-2 block opacity-40" />
              Tap beers from the grid to add to current order
            </div>
          ) : cart.map(item => (
            <div key={item.beerId} className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-between text-xs">
              <div className="flex-1 pr-2">
                <div className="font-bold text-zinc-200 truncate">{item.beerName}</div>
                <div className="text-[10px] text-zinc-400 font-mono">{fmtMoney(item.unitPrice)}/pt &bull; {item.litersTotal.toFixed(1)}L</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg">
                  <button onClick={() => updateCartQty(item.beerId, -1)} className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm">-</button>
                  <span className="px-2 font-mono text-xs font-bold text-amber-400">{item.qty}</span>
                  <button onClick={() => updateCartQty(item.beerId, 1)} className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm">+</button>
                </div>
                <span className="font-mono font-bold text-white w-14 text-right">{fmtMoney(item.total)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-zinc-800 space-y-2 text-xs">
          <div className="flex justify-between text-zinc-400">
            <span>Subtotal</span>
            <span className="font-mono text-zinc-200">{fmtMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Tax ({(db.settings.taxRate * 100).toFixed(1)}%)</span>
            <span className="font-mono text-zinc-200">{fmtMoney(tax)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-zinc-800/80">
            <span>Total Due</span>
            <span className="font-mono text-amber-400 text-base">{fmtMoney(total)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button onClick={() => checkout('Cash')} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-1 rounded-lg text-xs flex flex-col items-center justify-center gap-1 transition">
              <i className="fa-solid fa-money-bill" /> Cash
            </button>
            <button onClick={() => checkout('Card')} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-1 rounded-lg text-xs flex flex-col items-center justify-center gap-1 transition">
              <i className="fa-solid fa-credit-card" /> Card / POS
            </button>
            <button onClick={() => checkout('Tab')} className="bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-1 rounded-lg text-xs flex flex-col items-center justify-center gap-1 transition">
              <i className="fa-solid fa-file-invoice-dollar" /> Put on Tab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
