import { useState } from 'react';
import { fmtMoney } from '@/utils';
import { checkDiscount, STAFF_MAX_PERCENT, type DiscountInput, type DiscountMode } from '@/lib/billDiscount';

interface Props {
  /** Bill subtotal before tax. */
  subtotal: number;
  isOwner: boolean;
  /** When set, the box is switched off and shows this message instead. */
  blockedReason?: string;
  /** Called with the discount, or null when there is none. The caller checks it again before billing. */
  onChange: (value: DiscountInput | null) => void;
}

export function DiscountBox({ subtotal, isOwner, blockedReason, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DiscountMode>('percent');
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');

  const push = (m: DiscountMode, t: string, r: string) => {
    const value = parseFloat(t);
    onChange(t.trim() === '' || !Number.isFinite(value) ? null : { mode: m, value, reason: r });
  };

  const close = () => {
    setOpen(false);
    setText('');
    setReason('');
    onChange(null);
  };

  if (blockedReason) {
    return <div className="text-[11px] text-zinc-500">{blockedReason}</div>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-amber-400 hover:underline flex items-center gap-1.5"
      >
        <i className="fa-solid fa-tags" /> Add discount
      </button>
    );
  }

  const value = parseFloat(text);
  const input: DiscountInput | null =
    text.trim() === '' || !Number.isFinite(value) ? null : { mode, value, reason };
  const check = input ? checkDiscount(subtotal, input, isOwner) : null;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950/70 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] uppercase tracking-wider text-zinc-400 font-semibold font-mono">Discount</span>
        <button type="button" onClick={close} className="text-[11px] text-red-400 hover:underline">Remove</button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex rounded-lg overflow-hidden border border-zinc-700">
          <button
            type="button"
            onClick={() => { setMode('percent'); push('percent', text, reason); }}
            className={`px-3 py-1.5 text-xs font-bold ${mode === 'percent' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-300'}`}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => { setMode('amount'); push('amount', text, reason); }}
            className={`px-3 py-1.5 text-xs font-bold ${mode === 'amount' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-300'}`}
          >
            ₹
          </button>
        </div>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={text}
          onChange={e => { setText(e.target.value); push(mode, e.target.value, reason); }}
          placeholder={mode === 'percent' ? 'e.g. 10' : 'e.g. 50'}
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500"
        />
      </div>

      <input
        type="text"
        value={reason}
        maxLength={200}
        onChange={e => { setReason(e.target.value); push(mode, text, e.target.value); }}
        placeholder="Reason (e.g. regular customer, birthday)"
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500"
      />

      {check && check.ok && (
        <div className="text-[11px] text-emerald-400">Discount: -{fmtMoney(check.amount)} (before tax)</div>
      )}
      {check && !check.ok && <div className="text-[11px] text-red-400">{check.error}</div>}
      {!isOwner && !check && (
        <div className="text-[11px] text-zinc-500">Staff can give up to {STAFF_MAX_PERCENT}%. More needs the owner.</div>
      )}
    </div>
  );
}
