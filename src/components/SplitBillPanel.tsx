import { useReducer, useState } from 'react';
import { fmtMoney } from '@/utils';
import type { Invoice } from '@/types';
import {
  MAX_PEOPLE,
  MIN_PEOPLE,
  initSplit,
  splitByItems,
  splitEqually,
  splitReducer,
  type ItemSplitResult,
  type SplitAction,
  type SplitItem,
  type SplitState,
} from '@/lib/splitBill';

// Kept here as well, because this is where it used to live.
export { splitEqually };

const rupees = (paise: number) => fmtMoney(paise / 100);

interface Props {
  total: number;
  invoiceNo: string;
  barName: string;
  /** When given, the bill can also be split by items. */
  invoice?: Invoice;
}

interface ViewProps {
  total: number;
  items: SplitItem[];
  state: SplitState;
  dispatch: (a: SplitAction) => void;
  result: ItemSplitResult | null;
  shares: number[];
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
}

/** Only shows things. The panel below decides what each tap does. */
export function SplitBillView(v: ViewProps) {
  const { state, dispatch, items } = v;
  const canItems = items.length > 0;
  const chip = (on: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs font-medium ${on ? 'bg-amber-500 border-amber-500 text-zinc-950' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`;

  return (
    <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-zinc-200">
      {canItems && (
        <div className="mb-3 flex gap-2">
          <button type="button" className={chip(state.mode === 'equal')} onClick={() => dispatch({ type: 'mode', mode: 'equal' })}>
            Equal
          </button>
          <button type="button" className={chip(state.mode === 'items')} onClick={() => dispatch({ type: 'mode', mode: 'items' })}>
            By items
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">Split between</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'people', delta: -1 })}
            disabled={state.people <= MIN_PEOPLE}
            aria-label="Fewer people"
            className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-lg leading-none disabled:opacity-40"
          >
            -
          </button>
          <span className="w-16 text-center font-mono text-sm font-bold text-amber-400">{state.people} people</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'people', delta: 1 })}
            disabled={state.people >= MAX_PEOPLE}
            aria-label="More people"
            className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-lg leading-none disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
        <span>Bill total</span>
        <span className="font-mono text-zinc-200">{fmtMoney(v.total)}</span>
      </div>

      {state.mode === 'equal' || !canItems ? (
        <ul className="mt-2 space-y-1 text-sm">
          {v.shares.map((s, i) => (
            <li key={i} className="flex items-center justify-between rounded-md bg-zinc-800/60 px-3 py-1.5">
              <span className="text-zinc-300">Person {i + 1}</span>
              <span className="font-mono font-bold text-white">{fmtMoney(s)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 text-xs text-zinc-400">Tap a person, then add the items they had</div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: state.people }, (_, p) => (
                <button key={p} type="button" className={chip(state.active === p)} onClick={() => dispatch({ type: 'active', person: p })}>
                  P{p + 1}
                  {v.result && v.result.ok ? ` ${rupees(v.result.persons[p].totalPaise)}` : ''}
                </button>
              ))}
            </div>
          </div>

          <ul className="space-y-1 text-sm">
            {items.map((it, i) => {
              const row = state.assigned[i] ?? [];
              const given = row.slice(0, state.people).reduce((a, b) => a + b, 0);
              const mine = row[state.active] ?? 0;
              return (
                <li key={i} className="rounded-md bg-zinc-800/60 px-3 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-zinc-200">{it.name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {it.qty} on the bill | {given} taken | {it.qty - given} left
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'adjust', item: i, delta: -1 })}
                        disabled={mine <= 0}
                        aria-label={`Take one ${it.name} off P${state.active + 1}`}
                        className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-700 leading-none disabled:opacity-40"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-mono font-bold text-amber-400">{mine}</span>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'adjust', item: i, delta: 1 })}
                        disabled={given >= it.qty}
                        aria-label={`Give one ${it.name} to P${state.active + 1}`}
                        className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-700 leading-none disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {v.result && !v.result.ok && <p className="text-xs text-red-400">{v.result.reason}</p>}
          {v.result && v.result.ok && (
            <>
              <p className="text-[11px] text-zinc-500">
                {v.result.unassignedUnits > 0
                  ? `${v.result.unassignedUnits} item(s) nobody took (${rupees(v.result.unassignedPaise)}) are shared equally by everyone. `
                  : 'Every item is taken. '}
                Service charge and tax are shared in the same proportion as what each person had.
              </p>
              <ul className="space-y-1 text-sm">
                {v.result.persons.map((p, i) => (
                  <li key={i} className="rounded-md bg-zinc-800/60 px-3 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-300">Person {i + 1}</span>
                      <span className="font-mono font-bold text-white">{rupees(p.totalPaise)}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {p.lines.length === 0 ? 'No items of their own' : p.lines.map((l) => `${l.qty} x ${l.name}`).join(', ')}
                      {p.sharedPaise + p.extrasPaise > 0 ? ` | shared + tax/service ${rupees(p.sharedPaise + p.extrasPaise)}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => dispatch({ type: 'clear' })} className="text-xs text-red-400 underline">
                Clear all picks
              </button>
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={v.onCopy}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition"
        >
          <i className="fa-regular fa-copy" /> {v.copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={v.onShare}
          className="bg-emerald-600 border border-emerald-500 text-white hover:bg-emerald-500 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition"
        >
          <i className="fa-brands fa-whatsapp" /> Share
        </button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        This only shows how much each person pays. The bill itself is not changed.
      </p>
    </div>
  );
}

export function SplitBillPanel({ total, invoiceNo, barName, invoice }: Props) {
  const items: SplitItem[] = (invoice?.items ?? []).map((i) => ({ name: i.beerName, qty: i.qty, total: i.total }));
  const qtys = items.map((i) => i.qty);

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, rawDispatch] = useReducer((s: SplitState, a: SplitAction) => splitReducer(s, a, qtys), items.length, initSplit);

  const dispatch = (a: SplitAction) => {
    setCopied(false);
    rawDispatch(a);
  };

  const useItems = state.mode === 'items' && items.length > 0;
  const shares = splitEqually(total, state.people);
  const result: ItemSplitResult | null = useItems
    ? splitByItems({ items, totalPaise: Math.round((Number(total) || 0) * 100), people: state.people, assigned: state.assigned })
    : null;

  const lines: string[] = [`${barName || 'Bill'} - Bill ${invoiceNo}`, `Total: ${fmtMoney(total)}`];
  if (result && result.ok) {
    lines.push(`Split by items between ${state.people} people:`);
    result.persons.forEach((p, i) => {
      lines.push(`Person ${i + 1}: ${rupees(p.totalPaise)}`);
      for (const l of p.lines) lines.push(`  ${l.qty} x ${l.name}`);
      if (p.sharedPaise + p.extrasPaise > 0) lines.push(`  Shared items + tax/service: ${rupees(p.sharedPaise + p.extrasPaise)}`);
    });
  } else {
    lines.push(`Split between ${state.people} people:`);
    shares.forEach((s, i) => lines.push(`Person ${i + 1}: ${fmtMoney(s)}`));
  }
  const text = lines.join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked on some phones. WhatsApp share still works.
    }
  };

  const share = () => {
    try {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } catch {
      // ignore
    }
  };

  return (
    <div className="no-print border-b border-zinc-800 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition"
        aria-expanded={open}
      >
        <i className="fa-solid fa-people-arrows" /> Split bill
      </button>

      {open && (
        <SplitBillView
          total={total}
          items={items}
          state={state}
          dispatch={dispatch}
          result={result}
          shares={shares}
          copied={copied}
          onCopy={copy}
          onShare={share}
        />
      )}
    </div>
  );
}
