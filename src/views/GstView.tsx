import { useMemo, useState } from 'react';
import { fmtMoney, fmtDateTime } from '@/utils';
import {
  useCancelEInvoice,
  useGenerateEInvoice,
  useGstInvoiceDetail,
  useGstInvoices,
  useGstSettings,
} from '@/hooks/useGst';
import {
  CANCEL_REASONS,
  EINVOICE_API_CONNECTED,
  EINVOICE_STATUS_LABELS,
  canCancelIrn,
  type EInvoiceStatus,
} from '@/lib/gst';
import { GstSettingsForm } from '@/components/gst/GstSettingsForm';

type TabId = 'invoices' | 'settings';

const STATUS_CLASS: Record<EInvoiceStatus, string> = {
  not_required: 'text-zinc-400 bg-zinc-800/70 border border-zinc-700',
  pending: 'text-amber-400 bg-amber-950/60 border border-amber-800/60',
  generated: 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60',
  failed: 'text-red-400 bg-red-950/60 border border-red-800/60',
  cancelled: 'text-zinc-300 bg-zinc-900 border border-zinc-700',
};

export function GstView() {
  const [tab, setTab] = useState<TabId>('invoices');
  const [statusFilter, setStatusFilter] = useState<'all' | EInvoiceStatus>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('1');
  const [cancelRemark, setCancelRemark] = useState('');

  const { settings } = useGstSettings();
  const { data: invoices = [], isLoading, error, refetch } = useGstInvoices();
  const detail = useGstInvoiceDetail(selected);
  const generate = useGenerateEInvoice();
  const cancel = useCancelEInvoice();

  const filtered = useMemo(
    () => invoices.filter(inv => statusFilter === 'all' || inv.einvoice_status === statusFilter),
    [invoices, statusFilter],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = { pending: 0, generated: 0, failed: 0, not_required: 0, cancelled: 0 };
    for (const inv of invoices) base[inv.einvoice_status] = (base[inv.einvoice_status] ?? 0) + 1;
    return base;
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-file-invoice text-amber-400" /> GST &amp; e-Invoice
          </h2>
          <p className="text-xs text-zinc-400">
            Tax invoices saved in TapTrack with CGST/SGST/IGST and e-Invoice readiness status.
          </p>
        </div>
        <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full ${settings.gstEnabled ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-600/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
          GST billing {settings.gstEnabled ? 'ON' : 'OFF'}
        </span>
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-600/30">
          API Not Connected
        </span>
      </div>

      <div className="flex gap-2 border-b border-zinc-800 pb-2 overflow-x-auto">
        {([
          { id: 'invoices' as const, label: 'Tax Invoices', icon: 'fa-solid fa-receipt' },
          { id: 'settings' as const, label: 'GST Settings', icon: 'fa-solid fa-gear' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              tab === t.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <i className={`${t.icon} mr-1.5`} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <GstSettingsForm />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['pending', 'generated', 'failed', 'not_required'] as EInvoiceStatus[]).map(s => (
              <div key={s} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
                <div className="text-[10px] uppercase font-mono text-zinc-500">{EINVOICE_STATUS_LABELS[s]}</div>
                <div className="text-xl font-bold text-white font-mono">{counts[s] ?? 0}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'pending', 'generated', 'failed', 'cancelled', 'not_required'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  statusFilter === s ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {s === 'all' ? 'All' : EINVOICE_STATUS_LABELS[s]}
              </button>
            ))}
            <button onClick={() => void refetch()} className="ml-auto px-2.5 py-1 rounded text-[11px] bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
              <i className="fa-solid fa-rotate mr-1" /> Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-zinc-500 text-xs"><i className="fa-solid fa-spinner fa-spin mr-2" />Loading tax invoices…</div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl">
              Could not load tax invoices.
              <button onClick={() => void refetch()} className="ml-2 underline">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-zinc-500 text-xs bg-zinc-900/70 border border-zinc-800 rounded-xl">
              No tax invoices yet. Turn on GST billing in GST Settings, then complete a sale.
            </div>
          ) : (
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800 text-[11px]">
                    <tr>
                      <th className="p-3">Invoice #</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Buyer</th>
                      <th className="p-3">GSTIN</th>
                      <th className="p-3 text-right">Taxable</th>
                      <th className="p-3 text-right">Tax</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-center">e-Invoice</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filtered.map(inv => {
                      const status = inv.einvoice_status as EInvoiceStatus;
                      const busy = generate.isPending && generate.variables === inv.id;
                       const canGenerate = EINVOICE_API_CONNECTED && inv.einvoice_required && status !== 'generated' && status !== 'cancelled';
                      return (
                        <tr key={inv.id} className="hover:bg-zinc-900/50 transition align-top">
                          <td className="p-3 font-mono font-bold text-amber-400">{inv.invoice_no}</td>
                          <td className="p-3 text-zinc-400 font-mono text-[11px]">{fmtDateTime(inv.invoice_timestamp)}</td>
                          <td className="p-3 text-zinc-200">{inv.buyer_name || 'Walk-in Guest'}</td>
                          <td className="p-3 font-mono text-[11px] text-zinc-400">{inv.buyer_gstin || '—'}</td>
                          <td className="p-3 text-right font-mono text-zinc-200">{fmtMoney(Number(inv.taxable_total))}</td>
                          <td className="p-3 text-right font-mono text-zinc-300">{fmtMoney(Number(inv.tax_total))}</td>
                          <td className="p-3 text-right font-mono font-bold text-white">{fmtMoney(Number(inv.grand_total))}</td>
                          <td className="p-3 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${STATUS_CLASS[status]}`}>
                              {EINVOICE_STATUS_LABELS[status]}
                            </span>
                            {status === 'failed' && inv.last_error_message && (
                              <div className="text-[10px] text-red-400 mt-1 max-w-[220px] mx-auto">{inv.last_error_message}</div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              <button onClick={() => setSelected(inv.id)} className="text-zinc-400 hover:text-amber-400 text-[11px]">
                                <i className="fa-solid fa-eye mr-1" />Details
                              </button>
                              {canGenerate && (
                                <button
                                  onClick={() => generate.mutate(inv.id)}
                                  disabled={busy}
                                  className="bg-amber-500/15 border border-amber-600/40 text-amber-300 rounded px-2 py-1 text-[11px] hover:bg-amber-500/25 disabled:opacity-60"
                                >
                                  {busy ? <><i className="fa-solid fa-spinner fa-spin mr-1" />Working…</> : (status === 'failed' ? 'Retry e-Invoice' : 'Generate e-Invoice')}
                                </button>
                              )}
                               {!EINVOICE_API_CONNECTED && inv.einvoice_required && status !== 'generated' && status !== 'cancelled' && (
                                 <span className="text-[10px] text-zinc-500">API Not Connected</span>
                               )}
                              {EINVOICE_API_CONNECTED && status === 'generated' && canCancelIrn(inv.ack_date) && (
                                <button
                                  onClick={() => { setCancelFor(inv.id); setCancelRemark(''); }}
                                  className="text-red-400 hover:text-red-300 text-[11px]"
                                >
                                  Cancel IRN
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {generate.isError && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg p-3">
              The e-Invoice request could not be sent. Your sale is unaffected — you can retry any time.
            </div>
          )}
          {generate.data && !generate.data.success && generate.data.errorMessage && (
            <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg p-3">
              {generate.data.errorMessage}
            </div>
          )}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 cursor-default" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-sm">Tax Invoice Details</h3>
              <button onClick={() => setSelected(null)} className="text-zinc-400 hover:text-white"><i className="fa-solid fa-xmark" /></button>
            </div>
            {detail.isLoading ? (
              <div className="text-xs text-zinc-500 py-8 text-center"><i className="fa-solid fa-spinner fa-spin mr-2" />Loading…</div>
            ) : !detail.data?.invoice ? (
              <div className="text-xs text-zinc-500 py-8 text-center">Not found.</div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 text-zinc-300">
                  <div><span className="text-zinc-500">Invoice:</span> <span className="font-mono text-amber-400">{detail.data.invoice.invoice_no}</span></div>
                  <div><span className="text-zinc-500">Date:</span> {fmtDateTime(detail.data.invoice.invoice_timestamp)}</div>
                  <div><span className="text-zinc-500">Supply:</span> {detail.data.invoice.supply_type} · {detail.data.invoice.is_interstate ? 'Inter-state (IGST)' : 'Intra-state (CGST+SGST)'}</div>
                  <div><span className="text-zinc-500">Place of supply:</span> {detail.data.invoice.place_of_supply || '—'}</div>
                  <div><span className="text-zinc-500">Buyer:</span> {detail.data.invoice.buyer_name || 'Walk-in Guest'}</div>
                  <div><span className="text-zinc-500">Buyer GSTIN:</span> <span className="font-mono">{detail.data.invoice.buyer_gstin || '—'}</span></div>
                  <div><span className="text-zinc-500">IRN:</span> <span className="font-mono break-all">{detail.data.invoice.irn || '—'}</span></div>
                  <div><span className="text-zinc-500">Ack No:</span> <span className="font-mono">{detail.data.invoice.ack_no || '—'}</span></div>
                </div>

                <table className="w-full text-[11px]">
                  <thead className="text-zinc-500 font-mono uppercase border-b border-zinc-800">
                    <tr>
                      <th className="py-1 text-left">Item</th>
                      <th className="py-1">HSN</th>
                      <th className="py-1 text-center">Qty</th>
                      <th className="py-1 text-right">Taxable</th>
                      <th className="py-1 text-center">Rate</th>
                      <th className="py-1 text-right">Tax</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {detail.data.items.map(item => (
                      <tr key={item.id}>
                        <td className="py-1.5">{item.description}</td>
                        <td className="py-1.5 font-mono text-center">{item.hsn_sac || '—'}</td>
                        <td className="py-1.5 text-center font-mono">{Number(item.quantity)}</td>
                        <td className="py-1.5 text-right font-mono">{fmtMoney(Number(item.taxable_value))}</td>
                        <td className="py-1.5 text-center font-mono">{item.gst_rate_configured ? `${Number(item.gst_rate)}%` : 'Not set'}</td>
                        <td className="py-1.5 text-right font-mono">{fmtMoney(Number(item.cgst_amount) + Number(item.sgst_amount) + Number(item.igst_amount))}</td>
                        <td className="py-1.5 text-right font-mono font-bold">{fmtMoney(Number(item.line_total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-1 font-mono text-zinc-300">
                  <div className="flex justify-between"><span>Taxable value</span><span>{fmtMoney(Number(detail.data.invoice.taxable_total))}</span></div>
                  <div className="flex justify-between"><span>CGST</span><span>{fmtMoney(Number(detail.data.invoice.cgst_total))}</span></div>
                  <div className="flex justify-between"><span>SGST</span><span>{fmtMoney(Number(detail.data.invoice.sgst_total))}</span></div>
                  <div className="flex justify-between"><span>IGST</span><span>{fmtMoney(Number(detail.data.invoice.igst_total))}</span></div>
                  <div className="flex justify-between font-bold text-white border-t border-zinc-800 pt-1"><span>Total</span><span>{fmtMoney(Number(detail.data.invoice.grand_total))}</span></div>
                </div>

                <div>
                  <div className="text-zinc-500 font-mono uppercase text-[10px] mb-1.5">e-Invoice attempts</div>
                  {detail.data.logs.length === 0 ? (
                    <p className="text-zinc-500">No attempts yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {detail.data.logs.map(log => (
                        <li key={log.id} className="flex items-start justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5">
                          <span className="text-zinc-400 font-mono text-[10px]">{fmtDateTime(log.created_at)} · {log.action}</span>
                          <span className={log.success ? 'text-emerald-400' : 'text-red-400'}>
                            {log.success ? 'Success' : (log.error_message ?? 'Failed')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel IRN */}
      {cancelFor && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 cursor-default" onClick={() => setCancelFor(null)} />
          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-white font-bold text-sm">Cancel IRN</h3>
            <p className="text-xs text-zinc-400">An IRN can be cancelled within 24 hours of generation.</p>
            <select value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
              {CANCEL_REASONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
            <input
              value={cancelRemark}
              onChange={e => setCancelRemark(e.target.value)}
              placeholder="Remark"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
            />
            {cancel.data && !cancel.data.success && (
              <p className="text-xs text-amber-300">{cancel.data.errorMessage}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCancelFor(null)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg py-2 px-3 text-xs">Close</button>
              <button
                onClick={() => cancel.mutate({ gstInvoiceId: cancelFor, reasonCode: cancelReason, remark: cancelRemark })}
                disabled={cancel.isPending}
                className="bg-red-600 hover:bg-red-500 text-white rounded-lg py-2 px-3 text-xs disabled:opacity-60"
              >
                {cancel.isPending ? 'Cancelling…' : 'Cancel IRN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
