import type { Invoice, KotRecord, Settings } from '@/types';

// Thermal receipt printing (58 mm and 80 mm paper).
// It builds a small, plain receipt and prints only that, through the phone's or computer's normal print dialog.
// The existing "Print / Save PDF" buttons are not touched.

export type PaperWidth = 58 | 80;

const WIDTH_KEY = 'pt_receipt_paper_width';

export function readPaperWidth(): PaperWidth {
  try {
    return localStorage.getItem(WIDTH_KEY) === '58' ? 58 : 80;
  } catch {
    return 80;
  }
}

export function savePaperWidth(w: PaperWidth) {
  try {
    localStorage.setItem(WIDTH_KEY, String(w));
  } catch {
    // storage can be blocked; the choice is just not remembered
  }
}

/** Makes any text safe to put inside the receipt page (item names are typed by people). */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(n: number): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const row = (left: string, right: string, cls = ''): string =>
  `<div class="row ${cls}"><span>${left}</span><span>${right}</span></div>`;
const sep = '<div class="sep"></div>';
const center = (text: string, cls = ''): string => `<div class="c ${cls}">${text}</div>`;

/** The receipt body for a bill. Works for normal bills and GST bills. */
export function buildInvoiceReceipt(inv: Invoice, settings: Settings): string {
  const out: string[] = [];
  const gst = inv.gst;

  out.push(center(esc(gst?.sellerLegalName || settings?.barName || 'Receipt'), 'b big'));
  if (gst) {
    out.push(center('TAX INVOICE', 'b'));
    if (gst.sellerAddress) out.push(center(esc(gst.sellerAddress), 'small'));
    if (gst.sellerGstin) out.push(center(`GSTIN: ${esc(gst.sellerGstin)}`, 'small'));
  }
  out.push(sep);
  out.push(row('Bill No', esc(inv.invoiceNo)));
  out.push(row('Date', esc(when(inv.timestamp))));
  out.push(row('Customer', esc(gst?.buyerName || inv.customerName || 'Walk-in Guest')));
  if (gst?.buyerGstin) out.push(row('Buyer GSTIN', esc(gst.buyerGstin)));
  out.push(sep);

  if (gst) {
    for (const line of gst.lines) {
      out.push(`<div class="item">${esc(line.beerName)}</div>`);
      out.push(row(`${esc(line.qty)} x ${money(line.unitPrice)}`, money(line.lineTotal)));
      out.push(
        `<div class="small">HSN ${esc(line.hsnSac || '-')} | GST ${esc(line.gstRate)}% | Taxable ${money(line.taxableValue)}</div>`,
      );
    }
  } else {
    for (const item of inv.items) {
      out.push(`<div class="item">${esc(item.beerName)}</div>`);
      out.push(row(`${esc(item.qty)} x ${money(item.unitPrice)}`, money(item.total)));
    }
  }
  out.push(sep);

  if (gst) {
    out.push(row('Taxable value', money(gst.taxableTotal)));
    if (gst.isInterstate) {
      out.push(row('IGST', money(gst.igstTotal)));
    } else {
      out.push(row('CGST', money(gst.cgstTotal)));
      out.push(row('SGST', money(gst.sgstTotal)));
    }
  } else {
    const service = inv.serviceCharge ?? 0;
    if (service > 0) {
      out.push(row('Items subtotal', money(Number((inv.subtotal - service).toFixed(2)))));
      out.push(
        row(`Service charge${inv.serviceChargePct ? ` (${esc(inv.serviceChargePct)}%)` : ''}`, money(service)),
      );
    } else {
      out.push(row('Subtotal', money(inv.subtotal)));
    }
    if ((inv.discount ?? 0) > 0) {
      out.push(`<div class="small">Includes discount of ${money(inv.discount ?? 0)}</div>`);
    }
    out.push(row(`Tax (${((settings?.taxRate ?? 0) * 100).toFixed(1)}%)`, money(inv.tax)));
  }
  out.push(row('TOTAL', money(inv.total), 'b big'));
  out.push(sep);
  out.push(row('Paid', `${money(inv.paidAmount)} (${esc(inv.paymentMethod)})`));
  if (inv.balanceDue > 0) out.push(row('Balance due', money(inv.balanceDue), 'b'));
  out.push(sep);
  out.push(center('Thank you! Visit again.', 'small'));
  return out.join('\n');
}

/** The receipt body for a kitchen order ticket. */
export function buildKotReceipt(kot: KotRecord, tableName: string): string {
  const out: string[] = [];
  out.push(center('KITCHEN ORDER TICKET', 'b big'));
  out.push(center(`Table: ${esc(tableName)}`, 'b'));
  out.push(
    center(
      `KOT #${esc(kot.kot_no)} - ${kot.type === 'New' ? 'NEW ORDER' : kot.type === 'Add' ? 'ADDITION' : 'CANCELLATION'}`,
      'b',
    ),
  );
  out.push(center(esc(when(kot.created_at)), 'small'));
  out.push(sep);
  for (const it of kot.items) {
    out.push(
      row(
        `${esc(it.beerName)}${it.cancelled ? ' (CANCEL)' : ''}`,
        `x ${esc(it.qty)}`,
        it.cancelled ? 'b cut' : 'b',
      ),
    );
  }
  if (kot.note) {
    out.push(sep);
    out.push(`<div><b>Note:</b> ${esc(kot.note)}</div>`);
  }
  out.push(sep);
  return out.join('\n');
}

/** Wraps a receipt body in a full page sized for the paper. */
export function receiptDocument(body: string, width: PaperWidth): string {
  const font = width === 58 ? 11 : 12;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${width}mm; box-sizing: border-box; padding: 2mm 3mm; font-family: "Courier New", Courier, monospace; font-size: ${font}px; line-height: 1.35; }
.c { text-align: center; }
.b { font-weight: bold; }
.big { font-size: 1.25em; }
.small { font-size: 0.85em; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.row span:last-child { text-align: right; }
.item { margin-top: 3px; word-break: break-word; }
.sep { border-top: 1px dashed #000; margin: 4px 0; }
.cut { text-decoration: line-through; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Prints a receipt page through a hidden frame, so nothing on the screen changes.
 * Returns false when the browser did not allow it.
 */
export function printReceiptHtml(body: string, width: PaperWidth): boolean {
  let frame: HTMLIFrameElement | null = null;
  try {
    frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);

    const win = frame.contentWindow;
    const doc = win?.document;
    if (!win || !doc) {
      frame.remove();
      return false;
    }
    doc.open();
    doc.write(receiptDocument(body, width));
    doc.close();

    const cleanup = () => {
      try {
        frame?.remove();
      } catch {
        // already gone
      }
    };
    try {
      win.addEventListener('afterprint', cleanup);
    } catch {
      // not every browser lets us listen
    }
    // The print dialog can stay open for a while on a phone, so the frame is removed late.
    setTimeout(cleanup, 120000);

    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    }, 150);
    return true;
  } catch {
    try {
      frame?.remove();
    } catch {
      // ignore
    }
    return false;
  }
}
