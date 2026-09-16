import { Modal } from '@/components/Modal';
import { useStore } from '@/store';
import { fmtMoney, fmtDateTime } from '@/utils';
import { sendInvoiceOnWhatsApp } from '@/lib/whatsapp';
import { usePlan } from '@/lib/plan';
import { useGstInvoices } from '@/hooks/useGst';
import { CUSTOMER_TYPE_LABELS, EINVOICE_STATUS_LABELS, type CustomerType } from '@/lib/gst';
import type { InvoiceGst } from '@/types';

function rateRows(gst: InvoiceGst) {
  const map = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const line of gst.lines) {
    const row = map.get(line.gstRate) ?? { rate: line.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable += line.taxableValue;
    row.cgst += line.cgstAmount;
    row.sgst += line.sgstAmount;
    row.igst += line.igstAmount;
    map.set(line.gstRate, row);
  }
  return [...map.values()].sort((a, b) => a.rate - b.rate);
}

export function InvoiceViewModal() {
  const { modal, closeModal, db } = useStore();
  const { hasFeature } = usePlan();
  const open = modal.id === 'invoiceView';
  const invId = modal.data as string | undefined;
  const inv = invId ? db.invoices.find(i => i.id === invId) : undefined;
  const { invoices: gstInvoices } = useGstInvoices();
  const gstRecord = inv ? gstInvoices.find(g => g.local_invoice_id === inv.id) : undefined;

  if (!inv) return <Modal open={open} onClose={closeModal} title="Invoice Receipt" icon="fa-solid fa-receipt"><div className="p-6 text-center text-zinc-400">Invoice not found.</div></Modal>;

  const gst = inv.gst;

  const actions = (
    <div className="flex items-center gap-2 p-4 border-b border-zinc-800 no-print">
      <button onClick={() => window.print()} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition">
        <i className="fa-solid fa-print" /> Print / Save PDF
      </button>
      {hasFeature('whatsapp') && (
        <button
          onClick={() => sendInvoiceOnWhatsApp(inv, db.settings, db.customers.find(c => c.id === inv.customerId)?.phone)}
          className="bg-emerald-600 border border-emerald-500 text-white hover:bg-emerald-500 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition"
          title="Send this invoice on WhatsApp"
        >
          <i className="fa-brands fa-whatsapp" /> Send on WhatsApp
        </button>
      )}
    </div>
  );

  if (gst) {
    const rows = rateRows(gst);
    return (
      <Modal open={open} onClose={closeModal} title="Tax Invoice" icon="fa-solid fa-file-invoice" maxWidth="max-w-3xl">
        {actions}
        <div id="print-area" className="p-6 bg-white text-zinc-900">
          <div className="text-center pb-3 border-b-2 border-zinc-800">
            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600">Tax Invoice</p>
            <h2 className="text-xl font-bold uppercase tracking-wider">{gst.sellerLegalName || db.settings.barName}</h2>
            {gst.sellerAddress && <p className="text-[11px] text-zinc-600">{gst.sellerAddress}</p>}
            <p className="text-[11px] font-mono mt-1">
              GSTIN: <strong>{gst.sellerGstin || '—'}</strong>
              {gst.sellerStateCode ? ` • State Code: ${gst.sellerStateCode}` : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 py-3 border-b border-zinc-300 text-[11px]">
            <div>
              <p className="font-bold uppercase text-[10px] text-zinc-500 mb-1">Bill To</p>
              <div className="font-semibold">{gst.buyerName || inv.customerName}</div>
              {gst.buyerAddress && <div className="text-zinc-600">{gst.buyerAddress}</div>}
              <div className="font-mono">GSTIN: {gst.buyerGstin || 'Unregistered'}</div>
              <div className="font-mono">
                Type: {CUSTOMER_TYPE_LABELS[gst.supplyType as CustomerType] ?? gst.supplyType}
                {gst.buyerStateCode ? ` • State Code: ${gst.buyerStateCode}` : ''}
              </div>
            </div>
            <div className="font-mono text-right">
              <div><strong>Invoice No:</strong> {inv.invoiceNo}</div>
              <div><strong>Date:</strong> {fmtDateTime(inv.timestamp)}</div>
              <div><strong>Place of Supply:</strong> {gst.placeOfSupply || '—'}</div>
              <div><strong>Supply:</strong> {gst.isInterstate ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</div>
            </div>
          </div>

          <div className="py-3 border-b border-zinc-300 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-zinc-300 text-left font-mono">
                  <th className="py-1">#</th>
                  <th className="py-1">Description</th>
                  <th className="py-1">HSN/SAC</th>
                  <th className="py-1 text-center">Qty</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Taxable</th>
                  <th className="py-1 text-center">GST%</th>
                  {gst.isInterstate ? (
                    <th className="py-1 text-right">IGST</th>
                  ) : (
                    <>
                      <th className="py-1 text-right">CGST</th>
                      <th className="py-1 text-right">SGST</th>
                    </>
                  )}
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono">
                {gst.lines.map((line, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{i + 1}</td>
                    <td className="py-1.5 font-sans font-medium">{line.beerName}</td>
                    <td className="py-1.5">{line.hsnSac || '—'}</td>
                    <td className="py-1.5 text-center">{line.qty}</td>
                    <td className="py-1.5 text-right">{fmtMoney(line.unitPrice)}</td>
                    <td className="py-1.5 text-right">{fmtMoney(line.taxableValue)}</td>
                    <td className="py-1.5 text-center">{line.gstRate}%</td>
                    {gst.isInterstate ? (
                      <td className="py-1.5 text-right">{fmtMoney(line.igstAmount)}</td>
                    ) : (
                      <>
                        <td className="py-1.5 text-right">{fmtMoney(line.cgstAmount)}</td>
                        <td className="py-1.5 text-right">{fmtMoney(line.sgstAmount)}</td>
                      </>
                    )}
                    <td className="py-1.5 text-right font-bold">{fmtMoney(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid md:grid-cols-2 gap-4 py-3 border-b border-zinc-300">
            <div>
              <p className="font-bold uppercase text-[10px] text-zinc-500 mb-1">Rate-wise Tax Summary</p>
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-zinc-200 text-left">
                    <th className="py-1">Rate</th>
                    <th className="py-1 text-right">Taxable</th>
                    <th className="py-1 text-right">CGST</th>
                    <th className="py-1 text-right">SGST</th>
                    <th className="py-1 text-right">IGST</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.rate}>
                      <td className="py-1">{r.rate}%</td>
                      <td className="py-1 text-right">{fmtMoney(r.taxable)}</td>
                      <td className="py-1 text-right">{fmtMoney(r.cgst)}</td>
                      <td className="py-1 text-right">{fmtMoney(r.sgst)}</td>
                      <td className="py-1 text-right">{fmtMoney(r.igst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] font-mono space-y-1">
              <div className="flex justify-between"><span>Total Taxable Value:</span> <span>{fmtMoney(gst.taxableTotal)}</span></div>
              {!gst.isInterstate && (
                <>
                  <div className="flex justify-between"><span>CGST:</span> <span>{fmtMoney(gst.cgstTotal)}</span></div>
                  <div className="flex justify-between"><span>SGST:</span> <span>{fmtMoney(gst.sgstTotal)}</span></div>
                </>
              )}
              {gst.isInterstate && <div className="flex justify-between"><span>IGST:</span> <span>{fmtMoney(gst.igstTotal)}</span></div>}
              <div className="flex justify-between"><span>Total Tax:</span> <span>{fmtMoney(gst.taxTotal)}</span></div>
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-zinc-300"><span>Invoice Total:</span> <span>{fmtMoney(inv.total)}</span></div>
              <div className="flex justify-between text-zinc-600"><span>Paid:</span> <span>{fmtMoney(inv.paidAmount)} ({inv.paymentMethod})</span></div>
              {inv.balanceDue > 0 && <div className="flex justify-between text-red-600 font-bold"><span>Balance Due on Tab:</span> <span>{fmtMoney(inv.balanceDue)}</span></div>}
            </div>
          </div>

          <div className="py-3 text-[11px] font-mono">
            <p className="font-bold uppercase text-[10px] text-zinc-500 mb-1">e-Invoice</p>
            <div>Status: {EINVOICE_STATUS_LABELS[(gstRecord?.einvoice_status ?? (gst.einvoiceRequired ? 'pending' : 'not_required')) as keyof typeof EINVOICE_STATUS_LABELS]}</div>
            {gstRecord?.irn ? (
              <>
                <div className="break-all">IRN: {gstRecord.irn}</div>
                <div>Ack No: {gstRecord.ack_no ?? '—'}</div>
                <div>Ack Date: {gstRecord.ack_date ? fmtDateTime(gstRecord.ack_date) : '—'}</div>
                {gstRecord.signed_qr && (
                  <div className="mt-1 text-[10px] break-all text-zinc-600">Signed QR stored with this invoice.</div>
                )}
              </>
            ) : (
              <div className="text-zinc-600">{gst.einvoiceReason ?? 'No IRN has been issued for this invoice yet.'}</div>
            )}
          </div>

          <div className="pt-3 border-t border-zinc-300 text-center text-[10px] text-zinc-500">
            <p>This is a computer-generated tax invoice.</p>
            <p className="font-mono mt-1">TapTrack OS &bull; GST Tax Invoice</p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={closeModal} title="Invoice Receipt" icon="fa-solid fa-receipt" maxWidth="max-w-md">
      {actions}
      <div id="print-area" className="p-6 bg-white text-zinc-900">
        <div className="text-center pb-4 border-b border-zinc-300">
          <h2 className="text-xl font-bold uppercase tracking-wider">{db.settings.barName}</h2>
          <p className="text-xs text-zinc-600">Draft Beer Bar & Taphouse</p>
          <div className="mt-2 text-xs font-mono">
            <div><strong>Receipt #:</strong> {inv.invoiceNo}</div>
            <div><strong>Date:</strong> {fmtDateTime(inv.timestamp)}</div>
            <div><strong>Patron:</strong> {inv.customerName}</div>
          </div>
        </div>
        <div className="py-4 border-b border-zinc-300">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-left font-mono">
                <th className="py-1">Item</th>
                <th className="py-1 text-center">Qty</th>
                <th className="py-1 text-right">Price</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {inv.items.map((item, i) => (
                <tr key={i}>
                  <td className="py-1.5 font-medium">{item.beerName}</td>
                  <td className="py-1.5 text-center font-mono">{item.qty}</td>
                  <td className="py-1.5 text-right font-mono">{fmtMoney(item.unitPrice)}</td>
                  <td className="py-1.5 text-right font-mono font-bold">{fmtMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="py-3 space-y-1 text-xs font-mono border-b border-zinc-300">
          <div className="flex justify-between"><span>Subtotal:</span> <span>{fmtMoney(inv.subtotal)}</span></div>
          <div className="flex justify-between"><span>Sales Tax ({(db.settings.taxRate * 100).toFixed(1)}%):</span> <span>{fmtMoney(inv.tax)}</span></div>
          <div className="flex justify-between font-bold text-sm pt-1 border-t border-zinc-200">
            <span>Grand Total:</span>
            <span>{fmtMoney(inv.total)}</span>
          </div>
          <div className="flex justify-between text-zinc-600"><span>Paid:</span> <span>{fmtMoney(inv.paidAmount)} ({inv.paymentMethod})</span></div>
          {inv.balanceDue > 0 && <div className="flex justify-between text-red-600 font-bold"><span>Balance Due on Tab:</span> <span>{fmtMoney(inv.balanceDue)}</span></div>}
        </div>
        <div className="pt-4 text-center text-xs text-zinc-500">
          <p>Thank you for drinking craft with us!</p>
          <p className="font-mono text-[10px] mt-1">TapTrack OS &bull; Bar POS Receipt</p>
        </div>
      </div>
    </Modal>
  );
}
