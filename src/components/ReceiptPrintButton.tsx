import { useEffect, useState } from 'react';
import type { Invoice, KotRecord, Settings } from '@/types';
import {
  buildInvoiceReceipt,
  buildKotReceipt,
  printReceiptHtml,
  readPaperWidth,
  savePaperWidth,
  type PaperWidth,
} from '@/lib/receiptPrint';

type Props =
  | { kind: 'invoice'; invoice: Invoice; settings: Settings }
  | { kind: 'kot'; kot: KotRecord; tableName: string };

/** A "Thermal print" button with a 58 mm / 80 mm choice. Prints a small receipt for the thermal printer. */
export function ReceiptPrintButton(props: Props) {
  const [width, setWidth] = useState<PaperWidth>(80);

  // The saved choice is read after the page has opened (keeps the server and the browser the same).
  useEffect(() => {
    setWidth(readPaperWidth());
  }, []);

  const print = () => {
    const body =
      props.kind === 'invoice'
        ? buildInvoiceReceipt(props.invoice, props.settings)
        : buildKotReceipt(props.kot, props.tableName);
    const ok = printReceiptHtml(body, width);
    if (!ok) alert('The printer could not be opened. Use "Print / Save PDF" instead.');
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={print}
        className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition"
        title="Print a small receipt on a thermal printer"
      >
        <i className="fa-solid fa-receipt" /> Thermal print
      </button>
      <select
        value={width}
        onChange={e => {
          const w: PaperWidth = e.target.value === '58' ? 58 : 80;
          setWidth(w);
          savePaperWidth(w);
        }}
        aria-label="Paper width"
        className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg py-1 px-1.5 text-xs"
      >
        <option value="80">80 mm</option>
        <option value="58">58 mm</option>
      </select>
    </div>
  );
}
