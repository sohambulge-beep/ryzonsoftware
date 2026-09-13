import type { AppData } from './types';

const STORAGE_KEY = 'TAPTRACK_OS_STORE_V3';

function daysAgo(n: number): string {
  return new Date(Date.now() - 86400000 * n).toISOString().split('T')[0];
}
function hoursAgo(n: number): string {
  return new Date(Date.now() - 3600000 * n).toISOString();
}

export const INITIAL_DATA: AppData = {
  settings: {
    barName: 'The Rusty Hop Taphouse',
    taxRate: 0.085,
    currency: '₹',
  },
  taps: [
    { id: 'tap-1', tapNumber: 1, name: 'Juicy Haze NEIPA', brewery: 'Cloudline Brewing', style: 'IPA', abv: 6.8, costPerLiter: 3.40, pricePerPint: 8.50, currentLiters: 42.5, capacityLiters: 50.0, supplierId: 'sup-1' },
    { id: 'tap-2', tapNumber: 2, name: 'Midnight Obsidian Stout', brewery: 'Dark River', style: 'Stout', abv: 7.5, costPerLiter: 3.80, pricePerPint: 9.00, currentLiters: 18.0, capacityLiters: 50.0, supplierId: 'sup-2' },
    { id: 'tap-3', tapNumber: 3, name: 'Golden Valley Crisp Lager', brewery: 'Bavaria Craft', style: 'Lager', abv: 4.8, costPerLiter: 2.50, pricePerPint: 6.50, currentLiters: 35.0, capacityLiters: 50.0, supplierId: 'sup-1' },
    { id: 'tap-4', tapNumber: 4, name: 'Sunset Mango Wheat', brewery: 'Sunburst Ales', style: 'Wheat', abv: 5.2, costPerLiter: 3.10, pricePerPint: 7.50, currentLiters: 9.5, capacityLiters: 50.0, supplierId: 'sup-3' },
    { id: 'tap-5', tapNumber: 5, name: 'Pacific Northwest Pine IPA', brewery: 'Cascadia', style: 'IPA', abv: 7.1, costPerLiter: 3.60, pricePerPint: 8.50, currentLiters: 48.0, capacityLiters: 50.0, supplierId: 'sup-2' },
    { id: 'tap-6', tapNumber: 6, name: 'Bavarian Dunkel Weiss', brewery: 'Bavaria Craft', style: 'Wheat', abv: 5.4, costPerLiter: 3.00, pricePerPint: 7.50, currentLiters: 27.5, capacityLiters: 50.0, supplierId: 'sup-1' },
    { id: 'tap-7', tapNumber: 7, name: 'Highland Amber Ale', brewery: 'Heritage Malt', style: 'Amber', abv: 5.8, costPerLiter: 2.80, pricePerPint: 7.00, currentLiters: 31.0, capacityLiters: 50.0, supplierId: 'sup-3' },
    { id: 'tap-8', tapNumber: 8, name: 'Tart Cherry Sour', brewery: 'Wild Barrel Works', style: 'Sour', abv: 6.0, costPerLiter: 4.20, pricePerPint: 9.50, currentLiters: 12.0, capacityLiters: 30.0, supplierId: 'sup-2' },
  ],
  suppliers: [
    { id: 'sup-1', name: 'Cloudline & Bavaria Distro', contact: 'Mark Stevens', phone: '(555) 234-8901', email: 'orders@cloudlinecraft.com' },
    { id: 'sup-2', name: 'Dark River Keg Supplies', contact: 'Sarah Jenkins', phone: '(555) 987-1234', email: 'delivery@darkriverbrew.com' },
    { id: 'sup-3', name: 'Northwest Artisan Malts', contact: 'Dave Miller', phone: '(555) 456-7890', email: 'dave@nwartisan.com' },
  ],
  customers: [
    { id: 'cust-1', name: 'Michael Vance', phone: '(555) 345-6789', email: 'michael.vance@gmail.com', tabLimit: 250, currentBalance: 46.50, totalSpent: 420.00 },
    { id: 'cust-2', name: 'Elena Rostova', phone: '(555) 890-1234', email: 'elena.r@craftlovers.org', tabLimit: 300, currentBalance: 0.00, totalSpent: 680.50 },
    { id: 'cust-3', name: "Liam O'Connor", phone: '(555) 678-9012', email: 'liam@oconnorpub.com', tabLimit: 150, currentBalance: 78.25, totalSpent: 310.00 },
  ],
  purchases: [
    { id: 'po-101', supplierId: 'sup-1', beerId: 'tap-1', kegQty: 2, litersAdded: 100, costPerLiter: 3.40, totalCost: 340.00, date: daysAgo(4), status: 'Received' },
    { id: 'po-102', supplierId: 'sup-2', beerId: 'tap-2', kegQty: 1, litersAdded: 50, costPerLiter: 3.80, totalCost: 190.00, date: daysAgo(2), status: 'Received' },
    { id: 'po-103', supplierId: 'sup-3', beerId: 'tap-4', kegQty: 1, litersAdded: 50, costPerLiter: 3.10, totalCost: 155.00, date: daysAgo(1), status: 'Received' },
  ],
  invoices: [
    {
      id: 'inv-1001', invoiceNo: 'INV-1001', customerId: 'cust-1', customerName: 'Michael Vance',
      items: [
        { beerId: 'tap-1', beerName: 'Juicy Haze NEIPA', qty: 3, unitPrice: 8.50, litersTotal: 1.5, costTotal: 5.10, total: 25.50 },
        { beerId: 'tap-3', beerName: 'Golden Valley Crisp Lager', qty: 2, unitPrice: 6.50, litersTotal: 1.0, costTotal: 2.50, total: 13.00 },
      ],
      subtotal: 38.50, tax: 3.27, total: 41.77, paidAmount: 0.00, balanceDue: 41.77, paymentMethod: 'Tab', status: 'Unpaid', timestamp: daysAgo(1),
    },
    {
      id: 'inv-1002', invoiceNo: 'INV-1002', customerId: 'cust-2', customerName: 'Elena Rostova',
      items: [
        { beerId: 'tap-2', beerName: 'Midnight Obsidian Stout', qty: 2, unitPrice: 9.00, litersTotal: 1.0, costTotal: 3.80, total: 18.00 },
        { beerId: 'tap-8', beerName: 'Tart Cherry Sour', qty: 2, unitPrice: 9.50, litersTotal: 1.0, costTotal: 4.20, total: 19.00 },
      ],
      subtotal: 37.00, tax: 3.15, total: 40.15, paidAmount: 40.15, balanceDue: 0.00, paymentMethod: 'Card', status: 'Paid', timestamp: hoursAgo(4),
    },
    {
      id: 'inv-1003', invoiceNo: 'INV-1003', customerId: 'cust-3', customerName: "Liam O'Connor",
      items: [
        { beerId: 'tap-5', beerName: 'Pacific Northwest Pine IPA', qty: 4, unitPrice: 8.50, litersTotal: 2.0, costTotal: 7.20, total: 34.00 },
      ],
      subtotal: 34.00, tax: 2.89, total: 36.89, paidAmount: 0.00, balanceDue: 36.89, paymentMethod: 'Tab', status: 'Unpaid', timestamp: hoursAgo(2),
    },
  ],
  payments: [
    {
      id: 'pay-501', receiptNo: 'RCP-501', customerId: 'cust-2', customerName: 'Elena Rostova',
      amount: 40.15, paymentMethod: 'Credit Card', notes: 'Settled Invoice INV-1002 in full', timestamp: hoursAgo(3),
    },
  ],
  expenses: [
    { id: 'exp-1', title: 'CO2 Tank Refill (50 lb cylinder)', category: 'CO2 & Gas', amount: 65.00, paymentMethod: 'Company Card', date: daysAgo(3) },
    { id: 'exp-2', title: 'Weekly Draft Line Sanitization & Chemical Flush', category: 'Maintenance & Line Cleaning', amount: 120.00, paymentMethod: 'Bank Transfer', date: daysAgo(2) },
    { id: 'exp-3', title: 'Bar Snacks & Glassware Restock', category: 'Bar Supplies', amount: 84.50, paymentMethod: 'Company Card', date: daysAgo(1) },
  ],
};

export function loadState(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>;
      return {
        settings: parsed.settings ?? INITIAL_DATA.settings,
        taps: parsed.taps ?? [],
        suppliers: parsed.suppliers ?? [],
        customers: parsed.customers ?? [],
        purchases: parsed.purchases ?? [],
        invoices: parsed.invoices ?? [],
        payments: parsed.payments ?? [],
        expenses: parsed.expenses ?? [],
      };
    }
  } catch {
    // fall through to default
  }
  return structuredClone(INITIAL_DATA);
}

export function saveState(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetToSample(): AppData {
  return structuredClone(INITIAL_DATA);
}

export function clearAllData(): AppData {
  return {
    settings: INITIAL_DATA.settings,
    taps: INITIAL_DATA.taps,
    suppliers: INITIAL_DATA.suppliers,
    customers: [],
    purchases: [],
    invoices: [],
    payments: [],
    expenses: [],
  };
}

export { STORAGE_KEY };
