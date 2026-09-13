import type { Tap } from '@/types';
import { useStore } from '@/store';
import { fmtMoney } from '@/utils';

interface Props {
  tap: Tap;
  onPour?: () => void;
  variant?: 'dashboard' | 'inventory';
}

export function TapCard({ tap, onPour, variant = 'dashboard' }: Props) {
  const { db, openModal } = useStore();
  const pct = Math.max(0, Math.min(100, Math.round((tap.currentLiters / tap.capacityLiters) * 100)));
  let barColor = 'bg-amber-500';
  if (pct < 20) barColor = 'bg-red-500';
  else if (pct < 40) barColor = 'bg-yellow-500';

  const sup = db.suppliers.find(s => s.id === tap.supplierId);

  if (variant === 'inventory') {
    return (
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">TAP #{tap.tapNumber}</span>
            <span className="text-xs font-mono text-zinc-400">{tap.abv}% ABV</span>
          </div>
          <h4 className="font-bold text-white text-sm">{tap.name}</h4>
          <p className="text-xs text-zinc-400">{tap.brewery} &bull; {tap.style}</p>
          <div className="text-[11px] text-zinc-500 mt-1">Supplier: {sup ? sup.name : 'Direct'}</div>
        </div>
        <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800 space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-zinc-400">Keg Fill Level:</span>
            <span className={`font-bold ${pct < 20 ? 'text-red-400' : 'text-zinc-200'}`}>{tap.currentLiters.toFixed(1)} / {tap.capacityLiters} L</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div className={`${barColor} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 text-zinc-400">
            <div>Cost: <strong className="text-zinc-200">{fmtMoney(tap.costPerLiter)}/L</strong></div>
            <div className="text-right">Pint: <strong className="text-amber-400">{fmtMoney(tap.pricePerPint)}</strong></div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => openModal('purchase', tap.id)} className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-900 font-semibold rounded-lg py-1.5 px-3 text-xs flex-1 flex items-center justify-center gap-1.5 hover:brightness-110 transition">
            <i className="fa-solid fa-cart-plus" /> Buy Keg
          </button>
          <button onClick={() => openModal('beer', tap.id)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 rounded-lg py-1.5 px-3 text-xs transition">
            <i className="fa-solid fa-pen" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-[#271e16] to-[#181411] border border-zinc-800/80 rounded-xl p-3.5 relative flex flex-col justify-between transition-all duration-250 hover:border-amber-500/60 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/15">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 font-mono text-xs flex items-center justify-center font-bold">#{tap.tapNumber}</span>
            <span className="text-xs font-bold text-white truncate max-w-[140px]">{tap.name}</span>
          </div>
          <span className="text-[11px] text-zinc-400 block">{tap.brewery} &bull; {tap.style}</span>
        </div>
        <span className="text-xs font-mono font-bold text-amber-400">{fmtMoney(tap.pricePerPint)}/pt</span>
      </div>
      <div className="space-y-1.5 mt-2">
        <div className="flex justify-between text-[11px] font-mono">
          <span className="text-zinc-400">{tap.currentLiters.toFixed(1)} / {tap.capacityLiters} L</span>
          <span className={pct < 25 ? 'text-red-400 font-bold' : 'text-zinc-300'}>{pct}%</span>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
          <div className={`${barColor} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px]">
        <span className="text-zinc-500 font-mono">{Math.floor(tap.currentLiters / 0.5)} pints left</span>
        <button onClick={onPour} className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 transition">
          <i className="fa-solid fa-beer-mug-empty" /> Pour 1 Pt
        </button>
      </div>
    </div>
  );
}
