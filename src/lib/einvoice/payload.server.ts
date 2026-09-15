/**
 * Builds the standard IRP e-Invoice JSON (schema version 1.1) from a stored
 * GST invoice. Server-only; kept separate from the billing system so a real
 * IRP/GSP integration can consume it unchanged.
 */

export interface PayloadInvoice {
  invoice_no: string;
  invoice_date: string;
  supply_type: string;
  is_interstate: boolean;
  seller_gstin: string;
  seller_legal_name: string;
  seller_state_code: string;
  buyer_gstin: string;
  buyer_name: string;
  buyer_address: string;
  buyer_state_code: string;
  place_of_supply: string;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  cess_total: number;
  grand_total: number;
}

export interface PayloadItem {
  line_no: number;
  description: string;
  hsn_sac: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount: number;
  taxable_value: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  line_total: number;
}

function toIrpDate(date: string): string {
  const d = new Date(date);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function buildIrpPayload(
  invoice: PayloadInvoice,
  items: PayloadItem[],
): Record<string, unknown> {
  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: invoice.supply_type === 'B2B' ? 'B2B' : 'B2C',
      RegRev: 'N',
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: 'INV',
      No: invoice.invoice_no,
      Dt: toIrpDate(invoice.invoice_date),
    },
    SellerDtls: {
      Gstin: invoice.seller_gstin,
      LglNm: invoice.seller_legal_name,
      Addr1: '',
      Loc: '',
      Pin: 0,
      Stcd: invoice.seller_state_code,
    },
    BuyerDtls: {
      Gstin: invoice.buyer_gstin,
      LglNm: invoice.buyer_name,
      Pos: invoice.place_of_supply,
      Addr1: invoice.buyer_address,
      Loc: '',
      Pin: 0,
      Stcd: invoice.buyer_state_code,
    },
    ItemList: items.map(item => ({
      SlNo: String(item.line_no),
      PrdDesc: item.description,
      IsServc: 'N',
      HsnCd: item.hsn_sac,
      Qty: item.quantity,
      Unit: item.unit,
      UnitPrice: item.unit_price,
      TotAmt: Number((item.quantity * item.unit_price).toFixed(2)),
      Discount: item.discount,
      AssAmt: item.taxable_value,
      GstRt: item.gst_rate,
      CgstAmt: item.cgst_amount,
      SgstAmt: item.sgst_amount,
      IgstAmt: item.igst_amount,
      CesAmt: item.cess_amount,
      TotItemVal: item.line_total,
    })),
    ValDtls: {
      AssVal: invoice.taxable_total,
      CgstVal: invoice.cgst_total,
      SgstVal: invoice.sgst_total,
      IgstVal: invoice.igst_total,
      CesVal: invoice.cess_total,
      TotInvVal: invoice.grand_total,
    },
  };
}
