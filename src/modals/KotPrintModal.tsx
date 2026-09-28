import { Modal } from '@/components/Modal';
import type { KotRecord } from '@/types';

interface Props {
  kot: KotRecord;
  tableName: string;
  onClose: () => void;
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #kot-print-area, #kot-print-area * { visibility: visible !important; }
  #kot-print-area { position: fixed !important; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
}
`;

export function KotPrintModal({ kot, tableName, onClose }: Props) {
  return (
    <Modal open onClose={onClose} title={`KOT #${kot.kot_no} • ${tableName}`} icon="fa-solid fa-kitchen-set" maxWidth="max-w-sm">
      <style>{PRINT_CSS}</style>

      {/* Ye area print hoga (kitchen slip) */}
      <div id="kot-print-area" className="p-5 font-mono text-sm text-black bg-white">
        <div className="text-center">
          <div className="font-bold text-lg tracking-widest">KITCHEN ORDER TICKET</div>
          <div className="text-xs mt-1">
            Table: <b>{tableName}</b> &nbsp;•&nbsp; {new Date(kot.created_at).toLocaleString()}
          </div>
          <div className="text-xs font-bold mt-0.5">
            KOT #{kot.kot_no} &nbsp;•&nbsp; {kot.type === 'New' ? 'NEW ORDER' : kot.type === 'Add' ? 'ADDITION' : 'CANCELLATION'}
          </div>
        </div>
        <hr className="my-3 border-black" />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1">Item</th>
              <th className="py-1 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {kot.items.map((it, i) => (
              <tr key={i} className={it.cancelled ? 'line-through text-red-600' : ''}>
                <td className="py-1.5">
                  {it.beerName}
                  {it.cancelled && <span className="no-underline font-bold"> (CANCEL)</span>}
                </td>
                <td className="py-1.5 text-right font-bold">{it.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {kot.note && (
          <>
            <hr className="my-3 border-black" />
            <div className="text-xs"><b>Note:</b> {kot.note}</div>
          </>
        )}
        <hr className="my-3 border-black" />
        <div className="text-center text-[10px]">Powered by TapTrack</div>
      </div>

      <div className="no-print p-4 flex gap-2 border-t border-zinc-800">
        <button onClick={() => window.print()} className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold py-2 rounded-lg text-sm transition">
          <i className="fa-solid fa-print mr-2" />Print KOT
        </button>
        <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm transition">
          Close
        </button>
      </div>
    </Modal>
  );
}
