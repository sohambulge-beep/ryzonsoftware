/**
 * Pure GST calculation helpers.
 *
 * This file contains no UI, no network calls and no provider code — it is the
 * shared maths used by the POS, the tax invoice and the GST module.
 * Prices in TapTrack are stored tax-exclusive, so line price = taxable value.
 */

export const GST_RATES = [0, 5, 12, 18, 28] as const;

export type SupplyType = 'B2B' | 'B2C';

export type EInvoiceStatus =
  | 'not_required'
  | 'pending'
  | 'generated'
  | 'failed'
  | 'cancelled';

export const EINVOICE_STATUS_LABELS: Record<EInvoiceStatus, string> = {
  not_required: 'Not Required',
  pending: 'Pending',
  generated: 'Generated',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export interface GstBusinessSettings {
  legalName: string;
  tradeName: string;
  gstin: string;
  stateName: string;
  stateCode: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  placeOfSupply: string;
  gstEnabled: boolean;
  einvoiceApplicable: boolean;
  /** 'off' = feature parked, 'ready' = structure active, awaiting an IRP/GSP connection. */
  einvoiceMode: 'off' | 'ready';
  einvoiceThreshold: number;
  defaultHsn: string;
  defaultGstRate: number;
}

export const EMPTY_GST_SETTINGS: GstBusinessSettings = {
  legalName: '',
  tradeName: '',
  gstin: '',
  stateName: '',
  stateCode: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  pincode: '',
  placeOfSupply: '',
  gstEnabled: false,
  einvoiceApplicable: false,
  einvoiceMode: 'off',
  einvoiceThreshold: 0,
  defaultHsn: '',
  defaultGstRate: 5,
};

export interface GstLineInput {
  description: string;
  hsnSac: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  gstRate: number;
  unit?: string;
}

export interface GstLine {
  lineNo: number;
  description: string;
  hsnSac: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableValue: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  lineTotal: number;
}

export interface GstTotals {
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  cessTotal: number;
  taxTotal: number;
  grandTotal: number;
}

export interface GstBreakup extends GstTotals {
  isInterstate: boolean;
  placeOfSupply: string;
  supplyType: SupplyType;
  lines: GstLine[];
}

export interface RateSummaryRow {
  gstRate: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  total: number;
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** First two digits of a GSTIN are the state code. */
export function stateCodeFromGstin(gstin: string): string {
  const trimmed = (gstin ?? '').trim();
  return /^\d{2}/.test(trimmed) ? trimmed.slice(0, 2) : '';
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(gstin: string): boolean {
  return GSTIN_PATTERN.test((gstin ?? '').trim().toUpperCase());
}

export function isInterstateSupply(sellerStateCode: string, placeOfSupplyCode: string): boolean {
  const seller = (sellerStateCode ?? '').trim();
  const pos = (placeOfSupplyCode ?? '').trim();
  if (!seller || !pos) return false;
  return seller !== pos;
}

export function resolveHsn(itemHsn: string | undefined, settings: GstBusinessSettings): string {
  return (itemHsn ?? '').trim() || settings.defaultHsn.trim();
}

export function resolveGstRate(itemRate: number | undefined, settings: GstBusinessSettings): number {
  return typeof itemRate === 'number' && !Number.isNaN(itemRate)
    ? itemRate
    : settings.defaultGstRate;
}

/** Split a set of tax-exclusive lines into CGST/SGST or IGST and roll up totals. */
export function computeGst(
  inputs: GstLineInput[],
  options: { isInterstate: boolean; placeOfSupply: string; supplyType: SupplyType },
): GstBreakup {
  const lines: GstLine[] = inputs.map((input, index) => {
    const discount = round2(input.discount ?? 0);
    const taxableValue = round2(input.quantity * input.unitPrice - discount);
    const rate = Number(input.gstRate) || 0;
    const totalTax = round2((taxableValue * rate) / 100);
    const half = round2(totalTax / 2);

    const cgstAmount = options.isInterstate ? 0 : half;
    const sgstAmount = options.isInterstate ? 0 : round2(totalTax - half);
    const igstAmount = options.isInterstate ? totalTax : 0;

    return {
      lineNo: index + 1,
      description: input.description,
      hsnSac: input.hsnSac,
      unit: input.unit ?? 'NOS',
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      discount,
      taxableValue,
      gstRate: rate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      cessAmount: 0,
      lineTotal: round2(taxableValue + cgstAmount + sgstAmount + igstAmount),
    };
  });

  const sum = (pick: (l: GstLine) => number) => round2(lines.reduce((acc, l) => acc + pick(l), 0));

  const taxableTotal = sum(l => l.taxableValue);
  const cgstTotal = sum(l => l.cgstAmount);
  const sgstTotal = sum(l => l.sgstAmount);
  const igstTotal = sum(l => l.igstAmount);
  const cessTotal = sum(l => l.cessAmount);
  const taxTotal = round2(cgstTotal + sgstTotal + igstTotal + cessTotal);

  return {
    isInterstate: options.isInterstate,
    placeOfSupply: options.placeOfSupply,
    supplyType: options.supplyType,
    lines,
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    cessTotal,
    taxTotal,
    grandTotal: round2(taxableTotal + taxTotal),
  };
}

export function rateWiseSummary(lines: GstLine[]): RateSummaryRow[] {
  const map = new Map<number, RateSummaryRow>();
  for (const line of lines) {
    const row = map.get(line.gstRate) ?? {
      gstRate: line.gstRate,
      taxableValue: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      total: 0,
    };
    row.taxableValue = round2(row.taxableValue + line.taxableValue);
    row.cgstAmount = round2(row.cgstAmount + line.cgstAmount);
    row.sgstAmount = round2(row.sgstAmount + line.sgstAmount);
    row.igstAmount = round2(row.igstAmount + line.igstAmount);
    row.total = round2(row.taxableValue + row.cgstAmount + row.sgstAmount + row.igstAmount);
    map.set(line.gstRate, row);
  }
  return [...map.values()].sort((a, b) => a.gstRate - b.gstRate);
}

export interface ApplicabilityResult {
  required: boolean;
  status: EInvoiceStatus;
  reason: string;
}

/**
 * Decides whether an e-invoice is legally applicable for one sale.
 * When it is not, the sale is simply a normal invoice — nothing is blocked.
 */
export function evaluateEInvoiceApplicability(args: {
  settings: GstBusinessSettings;
  buyerGstin: string;
  invoiceTotal: number;
}): ApplicabilityResult {
  const { settings, buyerGstin, invoiceTotal } = args;

  if (!settings.gstEnabled) {
    return { required: false, status: 'not_required', reason: 'GST billing is switched off.' };
  }
  if (!settings.einvoiceApplicable) {
    return {
      required: false,
      status: 'not_required',
      reason: 'e-Invoicing is not applicable for this business.',
    };
  }
  if (!isValidGstin(settings.gstin)) {
    return { required: false, status: 'not_required', reason: 'Business GSTIN is missing or invalid.' };
  }
  if (!buyerGstin || !isValidGstin(buyerGstin)) {
    return {
      required: false,
      status: 'not_required',
      reason: 'B2C sale — e-Invoice is required only for registered (B2B) buyers.',
    };
  }
  if (settings.einvoiceThreshold > 0 && invoiceTotal < 0) {
    return { required: false, status: 'not_required', reason: 'Invoice value is not valid.' };
  }
  return { required: true, status: 'pending', reason: 'B2B sale — e-Invoice is applicable.' };
}

/** IRN cancellation is allowed within 24 hours of the acknowledgement. */
export function canCancelIrn(ackDate: string | null | undefined): boolean {
  if (!ackDate) return false;
  const ack = new Date(ackDate).getTime();
  if (Number.isNaN(ack)) return false;
  return Date.now() - ack < 24 * 60 * 60 * 1000;
}

export const CANCEL_REASONS: { code: string; label: string }[] = [
  { code: '1', label: 'Duplicate' },
  { code: '2', label: 'Data entry mistake' },
  { code: '3', label: 'Order cancelled' },
  { code: '4', label: 'Other' },
];

/** Local cache of the business GST settings so synchronous billing code can read them. */
const LOCAL_KEY = 'taptrack_gst_settings_v1';

export function readCachedGstSettings(): GstBusinessSettings {
  if (typeof window === 'undefined') return EMPTY_GST_SETTINGS;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return EMPTY_GST_SETTINGS;
    return { ...EMPTY_GST_SETTINGS, ...(JSON.parse(raw) as Partial<GstBusinessSettings>) };
  } catch {
    return EMPTY_GST_SETTINGS;
  }
}

export function writeCachedGstSettings(settings: GstBusinessSettings): void {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
  } catch {
    /* noop */
  }
}
