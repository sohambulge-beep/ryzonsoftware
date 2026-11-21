import { useState } from 'react';
import { fmtMoney } from '@/utils';
import { checkServiceCharge, MAX_SERVICE_CHARGE_PERCENT } from '@/lib/billDiscount';

const STORAGE_KEY = 'pt_service_charge_pct';
const DEFAULT_PCT = '10';

// The last percent used is remembered on this phone, so the cashier does not type it every time.
function rememberedPct(): string {
  try {
    const n = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
    return Number.isFinite(n) && n > 0 && n <= MAX_SERVICE_CHARGE_PERCENT ? String(n) : DEFAULT_PCT;
  } catch {
    return DEFAULT_PCT;
  }
}

function rememberPct(text: string) {
  try {
    const n = parseFloat(text);
    if (Number.isFinite(n) && n > 0 && n <= MAX_SERVICE_CHARGE_PERCENT) localStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    // storage can be blocked; nothing is lost
  }
}

interface Props {
  /** The bill's items total after any discount, before tax. */
  base: number;
  /** When true nothing is shown (the discount box already explains why). */
  disabled?: boolean;
  /** Called with the percent, or null when there is no service charge. The caller checks it again before billing. */
  onChange: (pct: number | null) => void;
}

export function ServiceChargeBox({ base, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(DEFAULT_PCT);

  if (disabled) return null;

  const push = (t: string) => {
    const v = parseFloat(t);
    onChange(t.trim() === '' || !Number.isFinite(v) ? null : v);
  };

  const openBox = () => {
    const t = rememberedPct();
    setText(t);
    setOpen(true);
    push(t);
  };

  const close = () => {
    setOpen(false);
    onChange(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openBox}
        className="text-xs text-amber-400 hover:underline flex items-center gap-1.5"
      >
        <i className="fa-solid fa-hand-holding-dollar" /> Add service charge (optional)
      </button>
    );
  }

  const value = parseFloat(text);
  const check = text.trim() === '' || !Number.isFinite(value) ? null : checkServiceCharge(base, value);

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950/70 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] uppercase tracking-wider text-zinc-400 font-semibold font-mono">Service charge</span>
        <button type="button" onClick={close} className="text-[11px] text-red-400 hover:underline">Remove</button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={text}
          onChange={e => {
            setText(e.target.value);
            push(e.target.value);
            rememberPct(e.target.value);
          }}
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500"
        />
        <span className="text-xs font-bold text-amber-400">%</span>
      </div>

      {check && check.ok && (
        <div className="text-[11px] text-emerald-400">Service charge: +{fmtMoney(check.amount)} (before tax)</div>
      )}
      {check && !check.ok && <div className="text-[11px] text-red-400">{check.error}</div>}
      <div className="text-[11px] text-zinc-500">Add this only if the customer agrees to pay it.</div>
    </div>
  );
}
