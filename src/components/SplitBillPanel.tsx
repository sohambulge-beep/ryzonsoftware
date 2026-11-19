import { useState } from 'react';
import { fmtMoney } from '@/utils';

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 20;

/**
 * Splits a bill equally. Works in paise (whole numbers) so the shares always add up to the
 * exact total. Any leftover paise go one each to the first people.
 * Example: 1000.00 between 3 people -> 333.34, 333.33, 333.33
 */
export function splitEqually(total: number, people: number): number[] {
  const n = Math.max(1, Math.floor(Number(people) || 1));
  const paise = Math.max(0, Math.round((Number(total) || 0) * 100));
  const base = Math.floor(paise / n);
  const extra = paise - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

interface Props {
  total: number;
  invoiceNo: string;
  barName: string;
}

export function SplitBillPanel({ total, invoiceNo, barName }: Props) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState(2);
  const [copied, setCopied] = useState(false);

  const shares = splitEqually(total, people);

  const text = [
    `${barName || 'Bill'} - Bill ${invoiceNo}`,
    `Total: ${fmtMoney(total)}`,
    `Split between ${people} people:`,
    ...shares.map((s, i) => `Person ${i + 1}: ${fmtMoney(s)}`),
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked on some phones. WhatsApp share still works.
    }
  };

  const shareOnWhatsApp = () => {
    try {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } catch {
      // ignore
    }
  };

  const bump = (delta: number) => {
    setPeople(p => Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, p + delta)));
    setCopied(false);
  };

  return (
    <div className="no-print border-b border-zinc-800 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition"
        aria-expanded={open}
      >
        <i className="fa-solid fa-people-arrows" /> Split bill
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-zinc-200">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-400">Split between</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bump(-1)}
                disabled={people <= MIN_PEOPLE}
                aria-label="Fewer people"
                className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-lg leading-none disabled:opacity-40"
              >
                -
              </button>
              <span className="w-16 text-center font-mono text-sm font-bold text-amber-400">{people} people</span>
              <button
                type="button"
                onClick={() => bump(1)}
                disabled={people >= MAX_PEOPLE}
                aria-label="More people"
                className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-lg leading-none disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
            <span>Bill total</span>
            <span className="font-mono text-zinc-200">{fmtMoney(total)}</span>
          </div>

          <ul className="mt-2 space-y-1 text-sm">
            {shares.map((s, i) => (
              <li key={i} className="flex items-center justify-between rounded-md bg-zinc-800/60 px-3 py-1.5">
                <span className="text-zinc-300">Person {i + 1}</span>
                <span className="font-mono font-bold text-white">{fmtMoney(s)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition"
            >
              <i className="fa-regular fa-copy" /> {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={shareOnWhatsApp}
              className="bg-emerald-600 border border-emerald-500 text-white hover:bg-emerald-500 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition"
            >
              <i className="fa-brands fa-whatsapp" /> Share
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            This only shows how much each person pays. The bill itself is not changed.
          </p>
        </div>
      )}
    </div>
  );
}
