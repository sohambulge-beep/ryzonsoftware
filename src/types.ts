export interface Settings {
  barName: string;
  taxRate: number;
  currency: string;
}

export interface Tap {
  id: string;
  tapNumber: number;
  name: string;
  brewery: string;
  style: string;
  abv: number;
  costPerLiter: number;
  pricePerPint: number;
  currentLiters: number;
  capacityLiters: number;
  supplierId: string;
  /** GST: HSN/SAC code for this item (optional — falls back to the business default). */
  hsnCode?: string;
  /** GST: applicable GST rate in percent (optional — falls back to the business default). */
  gstRate?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  tabLimit: number;
  currentBalance: number;
  totalSpent: number;
  /** GST billing details (optional — blank for walk-in / unregistered customers). */
  gstin?: string;
  legalName?: string;
  billingAddress?: string;
  stateName?: string;
  stateCode?: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  beerId: string;
  kegQty: number;
  litersAdded: number;
  costPerLiter: number;
  totalCost: number;
  date: string;
  status: string;
}

export interface InvoiceItem {
  beerId: string;
  beerName: string;
  qty: number;
  unitPrice: number;
  litersTotal: number;
  costTotal: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  paymentMethod: string;
  status: 'Paid' | 'Unpaid' | 'Partial';
  timestamp: string;
  /** GST breakdown, present only when GST billing was on for this sale. */
  gst?: InvoiceGst;
}

export interface InvoiceGstLine {
  beerId: string;
  beerName: string;
  hsnSac: string;
  qty: number;
  unitPrice: number;
  taxableValue: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

export interface InvoiceGst {
  supplyType: 'B2B' | 'B2C';
  isInterstate: boolean;
  placeOfSupply: string;
  sellerGstin: string;
  buyerGstin: string;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: InvoiceGstLine[];
  einvoiceRequired: boolean;
}

export interface Payment {
  id: string;
  receiptNo: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  notes: string;
  timestamp: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  date: string;
}

export interface CartItem {
  beerId: string;
  beerName: string;
  qty: number;
  unitPrice: number;
  litersTotal: number;
  costTotal: number;
  total: number;
}

export interface AppData {
  settings: Settings;
  taps: Tap[];
  suppliers: Supplier[];
  customers: Customer[];
  purchases: Purchase[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
}

export type ViewId =
  | 'dashboard' | 'pos' | 'billing' | 'customers' | 'expenses'
  | 'inventory' | 'suppliers' | 'payments' | 'profitloss'
  | 'reports' | 'backup' | 'owner' | 'insights' | 'settings' | 'staff' | 'gst';

export type ModalId =
  | 'purchase' | 'supplier' | 'payment' | 'customer' | 'beer'
  | 'expense' | 'invoiceView';
