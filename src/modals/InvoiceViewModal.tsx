import { Modal } from '@/components/Modal';
import { useStore } from '@/store';
import { fmtMoney, fmtDateTime } from '@/utils';
import { sendInvoiceOnWhatsApp } from '@/lib/whatsapp';
import { usePlan } from '@/lib/plan';

export function InvoiceViewModal() {
  const { modal, closeModal, db } = useStore();
  const { hasFeature } = usePlan();
  const open = modal.id === 'invoiceView';
  const invId = modal.data as string | undefined;
  const inv = invId ? db.invoices.find(i => i.id === invId) : undefined;

  if (!inv) return <Modal open={open} onClose={closeModal} title="Invoice Receipt" icon="fa-solid fa-receipt"><div className="p-6 text-center text-zinc-400">Invoice not found.</div></Modal>;

  return (
    <Modal open={open} onClose={closeModal} title="Invoice Receipt" icon="fa-solid fa-receipt" maxWidth="max-w-md">
      <div className="flex items-center gap-2 p-4 border-b border-zinc-800 no-print">
        <button onClick={() => window.print()} className="bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 font-medium rounded-lg py-1 px-2.5 text-xs flex items-center gap-1.5 transition">
          <i className="fa-solid fa-print" /> Print
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
