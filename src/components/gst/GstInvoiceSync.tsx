import { useEffect, useRef } from 'react';
import { useStore } from '@/store';
import { useRecordGstInvoice } from '@/hooks/useGst';

const SYNC_KEY = 'taptrack_gst_synced_invoices_v1';

function readSynced(): string[] {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSynced(ids: string[]) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(ids.slice(-500)));
  } catch {
    /* storage full — syncing will simply retry later */
  }
}

/**
 * Pushes completed GST sales into the GST records in the background.
 * Renders nothing and never blocks billing: if the backend is unreachable the
 * sale stays valid locally and the invoice is retried on the next app load.
 */
export function GstInvoiceSync() {
  const { db } = useStore();
  const record = useRecordGstInvoice();
  const busy = useRef(false);

  useEffect(() => {
    if (busy.current) return;
    const synced = readSynced();
    const pending = db.invoices.filter(inv => inv.gst && !synced.includes(inv.id));
    const next = pending[0];
    if (!next?.gst) return;
    const gst = next.gst;

    busy.current = true;
    record.mutate(
      {
        localInvoiceId: next.id,
        invoiceNo: next.invoiceNo,
        invoiceTimestamp: next.timestamp,
        supplyType: gst.supplyType,
        isInterstate: gst.isInterstate,
        sellerGstin: gst.sellerGstin,
        sellerLegalName: gst.sellerLegalName ?? '',
        sellerStateCode: gst.sellerStateCode ?? '',
        buyerName: gst.buyerName ?? next.customerName,
        buyerGstin: gst.buyerGstin,
        buyerAddress: gst.buyerAddress ?? '',
        buyerStateCode: gst.buyerStateCode ?? '',
        placeOfSupply: gst.placeOfSupply,
        taxableTotal: gst.taxableTotal,
        cgstTotal: gst.cgstTotal,
        sgstTotal: gst.sgstTotal,
        igstTotal: gst.igstTotal,
        cessTotal: 0,
        taxTotal: gst.taxTotal,
        grandTotal: gst.grandTotal,
        einvoiceRequired: gst.einvoiceRequired,
        items: gst.lines.map((line, i) => ({
          lineNo: i + 1,
          description: line.beerName,
          hsnSac: line.hsnSac,
          unit: 'NOS',
          quantity: line.qty,
          unitPrice: line.unitPrice,
          discount: 0,
          taxableValue: line.taxableValue,
          gstRate: line.gstRate,
          gstRateConfigured: line.gstRateConfigured,
          cgstAmount: line.cgstAmount,
          sgstAmount: line.sgstAmount,
          igstAmount: line.igstAmount,
          cessAmount: 0,
          lineTotal: line.lineTotal,
        })),
      },
      {
        onSuccess: () => {
          writeSynced([...readSynced(), next.id]);
          busy.current = false;
        },
        onError: () => {
          // Leave it unsynced so it retries later; the sale itself is unaffected.
          busy.current = false;
        },
      },
    );
  }, [db.invoices, record]);

  return null;
}
