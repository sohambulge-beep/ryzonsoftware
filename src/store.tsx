import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AppData, CartItem, ViewId, ModalId, Customer, Tap, Supplier, Expense, Invoice, InvoiceGst, Payment, Purchase, Settings } from './types';
import { loadState, saveState, resetToSample, clearAllData } from './data';
import { genId, genInvoiceNo, genReceiptNo, genPoNo, todayStr } from './utils';
import {
  alwaysInterstate,
  computeGst,
  evaluateEInvoiceApplicability,
  isInterstateSupply,
  readCachedGstSettings,
  resolveCustomerType,
  resolveGstRate,
  resolveHsn,
  type CustomerType,
} from './lib/gst';

export interface CustomerInput {
  id?: string;
  name: string;
  phone: string;
  email: string;
  tabLimit: number;
  customerType?: CustomerType;
  gstin?: string;
  legalName?: string;
  billingAddress?: string;
  stateName?: string;
  stateCode?: string;
}

/**
 * Builds the GST breakdown for a sale when GST billing is switched on.
 * Returns null when GST is off, so the existing simple tax flow is untouched.
 */
function buildInvoiceGst(
  items: CartItem[],
  taps: Tap[],
  customer: Customer | undefined,
): InvoiceGst | null {
  const settings = readCachedGstSettings();
  if (!settings.gstEnabled) return null;

  const buyerGstin = (customer?.gstin ?? '').trim().toUpperCase();
  const buyerStateCode = (customer?.stateCode ?? '').trim();
  const placeOfSupply = buyerStateCode || settings.placeOfSupply || settings.stateCode;
  const supplyType = resolveCustomerType(customer?.customerType, buyerGstin);
  const isInterstate =
    alwaysInterstate(supplyType) || isInterstateSupply(settings.stateCode, placeOfSupply);

  const lineInputs = items.map(item => {
      const tap = taps.find(t => t.id === item.beerId);
      return {
        description: item.beerName,
        hsnSac: resolveHsn(tap?.hsnCode, settings),
        quantity: item.qty,
        unitPrice: item.unitPrice,
        gstRate: resolveGstRate(tap?.gstRate, settings),
        unit: 'NOS',
      };
    });
  const breakup = computeGst(
    lineInputs,
    { isInterstate, placeOfSupply, supplyType },
  );

  const applicability = evaluateEInvoiceApplicability({
    settings,
    buyerGstin,
    customerType: supplyType,
    lines: lineInputs.map((line, index) => ({
      hsnSac: line.hsnSac,
      gstRateConfigured: typeof taps.find(t => t.id === items[index]?.beerId)?.gstRate === 'number' || settings.defaultTaxConfirmed,
    })),
  });

  return {
    supplyType,
    isInterstate,
    placeOfSupply,
    sellerGstin: settings.gstin,
    sellerLegalName: settings.legalName || settings.tradeName,
    sellerAddress: [settings.addressLine1, settings.addressLine2, settings.city, settings.pincode]
      .filter(Boolean)
      .join(', '),
    sellerStateCode: settings.stateCode,
    buyerGstin,
    buyerName: customer?.legalName || customer?.name || 'Walk-in Guest',
    buyerAddress: customer?.billingAddress ?? '',
    buyerStateCode,
    einvoiceReason: applicability.reason,
    taxableTotal: breakup.taxableTotal,
    cgstTotal: breakup.cgstTotal,
    sgstTotal: breakup.sgstTotal,
    igstTotal: breakup.igstTotal,
    taxTotal: breakup.taxTotal,
    grandTotal: breakup.grandTotal,
    einvoiceRequired: applicability.required,
    lines: breakup.lines.map((line, i) => ({
      beerId: items[i]?.beerId ?? '',
      beerName: line.description,
      hsnSac: line.hsnSac,
      qty: line.quantity,
      unitPrice: line.unitPrice,
      taxableValue: line.taxableValue,
      gstRate: line.gstRate,
      gstRateConfigured: typeof taps.find(t => t.id === items[i]?.beerId)?.gstRate === 'number' || settings.defaultTaxConfirmed,
      cgstAmount: line.cgstAmount,
      sgstAmount: line.sgstAmount,
      igstAmount: line.igstAmount,
      lineTotal: line.lineTotal,
    })),
  };
}

interface ModalState {
  id: ModalId | null;
  data?: unknown;
}

interface StoreContextValue {
  db: AppData;
  cart: CartItem[];
  currentView: ViewId;
  modal: ModalState;
  navigate: (view: ViewId) => void;
  openModal: (id: ModalId, data?: unknown) => void;
  closeModal: () => void;
  clearCart: () => void;
  addToCart: (tapId: string) => void;
  updateCartQty: (beerId: string, delta: number) => void;
  setCartCustomer: (customerId: string) => void;
  cartCustomerId: string;
  processCheckout: (method: 'Cash' | 'Card' | 'Tab') => string | null;
  processTableCheckout: (items: CartItem[], method: 'Cash' | 'Card') => string | null;
  quickPour: (tapId: string) => void;
  saveCustomer: (data: CustomerInput) => void;
  saveBeer: (data: Partial<Tap> & { name: string; tapNumber: number }) => void;
  saveSupplier: (data: Omit<Supplier, 'id'>) => void;
  saveExpense: (data: { title: string; category: string; amount: number; paymentMethod: string }) => void;
  deleteExpense: (id: string) => void;
  savePurchase: (data: { supplierId: string; beerId: string; kegQty: number; litersPerKeg: number; costPerLiter: number }) => void;
  savePayment: (data: { customerId: string; amount: number; paymentMethod: string; notes: string }) => void;
  restoreData: (data: AppData) => void;
  loadSample: () => void;
  clearAll: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<AppData>(() => loadState());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartCustomerId, setCartCustomerId] = useState('');
  const [currentView, setCurrentView] = useState<ViewId>('dashboard');
  const [modal, setModal] = useState<ModalState>({ id: null });

  useEffect(() => {
    saveState(db);
  }, [db]);

  const navigate = useCallback((view: ViewId) => {
    setCurrentView(view);
  }, []);

  const openModal = useCallback((id: ModalId, data?: unknown) => {
    setModal({ id, data });
  }, []);

  const closeModal = useCallback(() => {
    setModal({ id: null });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const addToCart = useCallback((tapId: string) => {
    setDb(prev => {
      const tap = prev.taps.find(t => t.id === tapId);
      if (!tap || tap.currentLiters < 0.5) return prev;

      setCart(prevCart => {
        const existing = prevCart.find(i => i.beerId === tapId);
        if (existing) {
          if ((existing.qty + 1) * 0.5 > tap.currentLiters) {
            alert(`Cannot add more pints! Only ${tap.currentLiters.toFixed(1)}L remaining in keg.`);
            return prevCart;
          }
          return prevCart.map(i =>
            i.beerId === tapId
              ? {
                  ...i,
                  qty: i.qty + 1,
                  litersTotal: (i.qty + 1) * 0.5,
                  total: (i.qty + 1) * i.unitPrice,
                  costTotal: (i.qty + 1) * 0.5 * tap.costPerLiter,
                }
              : i
          );
        }
        return [
          ...prevCart,
          {
            beerId: tap.id,
            beerName: tap.name,
            qty: 1,
            unitPrice: tap.pricePerPint,
            litersTotal: 0.5,
            costTotal: 0.5 * tap.costPerLiter,
            total: tap.pricePerPint,
          },
        ];
      });
      return prev;
    });
  }, []);

  const updateCartQty = useCallback((beerId: string, delta: number) => {
    setDb(prev => {
      const tap = prev.taps.find(t => t.id === beerId);
      setCart(prevCart => {
        const item = prevCart.find(i => i.beerId === beerId);
        if (!item) return prevCart;
        const newQty = item.qty + delta;
        if (newQty <= 0) return prevCart.filter(i => i.beerId !== beerId);
        if (tap && newQty * 0.5 > tap.currentLiters) {
          alert(`Not enough beer in keg! Remaining: ${tap.currentLiters.toFixed(1)}L`);
          return prevCart;
        }
        return prevCart.map(i =>
          i.beerId === beerId
            ? {
                ...i,
                qty: newQty,
                litersTotal: newQty * 0.5,
                total: newQty * i.unitPrice,
                costTotal: newQty * 0.5 * (tap?.costPerLiter ?? i.costTotal / i.litersTotal),
              }
            : i
        );
      });
      return prev;
    });
  }, []);

  const setCartCustomer = useCallback((customerId: string) => {
    setCartCustomerId(customerId);
  }, []);

  const processCheckout = useCallback((method: 'Cash' | 'Card' | 'Tab'): string | null => {
    if (cart.length === 0) {
      alert('Ticket is empty! Please add items first.');
      return null;
    }

    const custObj = db.customers.find(c => c.id === cartCustomerId);

    if (method === 'Tab' && !custObj) {
      alert('Please select or register a customer before placing an order on Tab!');
      return null;
    }

    const gst = buildInvoiceGst(cart, db.taps, custObj);
    const subtotal = gst ? gst.taxableTotal : cart.reduce((acc, i) => acc + i.total, 0);
    const tax = gst ? gst.taxTotal : Number((cart.reduce((acc, i) => acc + i.total, 0) * db.settings.taxRate).toFixed(2));
    const total = gst ? gst.grandTotal : Number((subtotal + tax).toFixed(2));


    if (method === 'Tab' && custObj) {
      const projected = (custObj.currentBalance || 0) + total;
      if (projected > custObj.tabLimit) {
        if (!confirm(`Warning: This sale will exceed ${custObj.name}'s credit limit (₹${custObj.tabLimit.toFixed(2)}). Current Tab: ₹${custObj.currentBalance.toFixed(2)}. Proceed anyway?`)) {
          return null;
        }
      }
    }

    const isPaid = method !== 'Tab';
    const invoiceId = genId('inv');
    const newInvoice: Invoice = {
      id: invoiceId,
      invoiceNo: genInvoiceNo(),
      customerId: custObj ? custObj.id : '',
      customerName: custObj ? custObj.name : 'Walk-in Guest',
      items: cart.map(i => ({ ...i })),
      subtotal,
      tax,
      total,
      paidAmount: isPaid ? total : 0,
      balanceDue: isPaid ? 0 : total,
      paymentMethod: method,
      status: isPaid ? 'Paid' : 'Unpaid',
      timestamp: new Date().toISOString(),
      ...(gst ? { gst } : {}),
    };

    setDb(prev => {
      const newTaps = prev.taps.map(t => {
        const cartItem = cart.find(i => i.beerId === t.id);
        if (cartItem) {
          return { ...t, currentLiters: Math.max(0, t.currentLiters - cartItem.litersTotal) };
        }
        return t;
      });

      const newCustomers = prev.customers.map(c => {
        if (custObj && c.id === custObj.id) {
          return {
            ...c,
            totalSpent: (c.totalSpent || 0) + total,
            currentBalance: !isPaid ? (c.currentBalance || 0) + total : c.currentBalance,
          };
        }
        return c;
      });

      return {
        ...prev,
        taps: newTaps,
        customers: newCustomers,
        invoices: [...prev.invoices, newInvoice],
      };
    });

    setCart([]);
    setCartCustomerId('');
    return invoiceId;
  }, [cart, cartCustomerId, db.customers, db.settings.taxRate]);

  const quickPour = useCallback((tapId: string) => {
    setDb(prev => {
      const tap = prev.taps.find(t => t.id === tapId);
      if (!tap) return prev;
      if (tap.currentLiters < 0.5) {
        alert(`Keg on Tap #${tap.tapNumber} (${tap.name}) is depleted! Please restock keg.`);
        return prev;
      }

      const costPerPint = tap.costPerLiter * 0.5;
      const lineItem = {
        beerId: tap.id,
        beerName: tap.name,
        qty: 1,
        unitPrice: tap.pricePerPint,
        litersTotal: 0.5,
        costTotal: costPerPint,
        total: tap.pricePerPint,
      };
      const gst = buildInvoiceGst([lineItem], prev.taps, undefined);
      const subtotal = gst ? gst.taxableTotal : tap.pricePerPint;
      const tax = gst ? gst.taxTotal : Number((tap.pricePerPint * prev.settings.taxRate).toFixed(2));
      const total = gst ? gst.grandTotal : Number((subtotal + tax).toFixed(2));

      const newInvoice: Invoice = {
        id: genId('inv'),
        invoiceNo: genInvoiceNo(),
        customerId: '',
        customerName: 'Walk-in Guest',
        items: [lineItem],
        subtotal,
        tax,
        total,
        paidAmount: total,
        balanceDue: 0,
        paymentMethod: 'Cash',
        status: 'Paid',
        timestamp: new Date().toISOString(),
        ...(gst ? { gst } : {}),
      };

      return {
        ...prev,
        taps: prev.taps.map(t => t.id === tapId ? { ...t, currentLiters: Math.max(0, t.currentLiters - 0.5) } : t),
        invoices: [...prev.invoices, newInvoice],
      };
    });
  }, []);

  const processTableCheckout = useCallback((items: CartItem[], method: 'Cash' | 'Card'): string | null => {
    if (items.length === 0) return null;
    const invoiceId = genId('inv');
    setDb(prev => {
      const gst = buildInvoiceGst(items, prev.taps, undefined);
      const rawSubtotal = items.reduce((sum, item) => sum + item.total, 0);
      const subtotal = gst ? gst.taxableTotal : rawSubtotal;
      const tax = gst ? gst.taxTotal : Number((rawSubtotal * prev.settings.taxRate).toFixed(2));
      const total = gst ? gst.grandTotal : Number((subtotal + tax).toFixed(2));
      const invoice: Invoice = {
        id: invoiceId,
        invoiceNo: genInvoiceNo(),
        customerId: '',
        customerName: 'Walk-in Guest',
        items: items.map(item => ({ ...item })),
        subtotal,
        tax,
        total,
        paidAmount: total,
        balanceDue: 0,
        paymentMethod: method,
        status: 'Paid',
        timestamp: new Date().toISOString(),
        ...(gst ? { gst } : {}),
      };
      return {
        ...prev,
        taps: prev.taps.map(tap => {
          const item = items.find(candidate => candidate.beerId === tap.id);
          return item ? { ...tap, currentLiters: Math.max(0, tap.currentLiters - item.litersTotal) } : tap;
        }),
        invoices: [...prev.invoices, invoice],
      };
    });
    return invoiceId;
  }, []);

  const saveCustomer = useCallback((data: CustomerInput) => {
    const gstFields = {
      customerType: data.customerType ?? ((data.gstin ?? '').trim() ? 'B2B' as const : 'B2C' as const),
      gstin: (data.gstin ?? '').trim().toUpperCase(),
      legalName: data.legalName ?? '',
      billingAddress: data.billingAddress ?? '',
      stateName: data.stateName ?? '',
      stateCode: data.stateCode ?? '',
    };
    setDb(prev => {
      if (data.id) {
        return {
          ...prev,
          customers: prev.customers.map(c =>
            c.id === data.id ? { ...c, name: data.name, phone: data.phone, email: data.email, tabLimit: data.tabLimit, ...gstFields } : c
          ),
        };
      }
      const newCustomer: Customer = {
        id: genId('cust'),
        name: data.name,
        phone: data.phone,
        email: data.email,
        tabLimit: data.tabLimit,
        currentBalance: 0,
        totalSpent: 0,
        ...gstFields,
      };
      return { ...prev, customers: [...prev.customers, newCustomer] };
    });
  }, []);

  const saveBeer = useCallback((data: Partial<Tap> & { name: string; tapNumber: number }) => {
    setDb(prev => {
      if (data.id) {
        return {
          ...prev,
          taps: prev.taps.map(t =>
            t.id === data.id ? {
              ...t,
              name: data.name,
              tapNumber: data.tapNumber,
              brewery: data.brewery ?? 'Craft House',
              style: data.style ?? 'Ale',
              abv: data.abv ?? 5.0,
              currentLiters: data.currentLiters ?? 0,
              capacityLiters: data.capacityLiters ?? 50,
              costPerLiter: data.costPerLiter ?? 3.0,
              pricePerPint: data.pricePerPint ?? 7.0,
              hsnCode: data.hsnCode ?? t.hsnCode,
              gstRate: data.gstRate ?? t.gstRate,
            } : t
          ),
        };
      }
      const newTap: Tap = {
        id: genId('tap'),
        tapNumber: data.tapNumber,
        name: data.name,
        brewery: data.brewery ?? 'Craft House',
        style: data.style ?? 'Ale',
        abv: data.abv ?? 5.0,
        costPerLiter: data.costPerLiter ?? 3.0,
        pricePerPint: data.pricePerPint ?? 7.0,
        currentLiters: data.currentLiters ?? 0,
        capacityLiters: data.capacityLiters ?? 50,
        supplierId: prev.suppliers[0]?.id ?? '',
        ...(data.hsnCode ? { hsnCode: data.hsnCode } : {}),
        ...(typeof data.gstRate === 'number' ? { gstRate: data.gstRate } : {}),
      };
      return { ...prev, taps: [...prev.taps, newTap] };
    });
  }, []);

  const saveSupplier = useCallback((data: Omit<Supplier, 'id'>) => {
    setDb(prev => ({
      ...prev,
      suppliers: [...prev.suppliers, { ...data, id: genId('sup') }],
    }));
  }, []);

  const saveExpense = useCallback((data: { title: string; category: string; amount: number; paymentMethod: string }) => {
    const newExpense: Expense = {
      id: genId('exp'),
      title: data.title,
      category: data.category,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      date: todayStr(),
    };
    setDb(prev => ({ ...prev, expenses: [...prev.expenses, newExpense] }));
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setDb(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }));
  }, []);

  const savePurchase = useCallback((data: { supplierId: string; beerId: string; kegQty: number; litersPerKeg: number; costPerLiter: number }) => {
    const totalVolume = data.kegQty * data.litersPerKeg;
    const totalCost = totalVolume * data.costPerLiter;
    const purchase: Purchase = {
      id: genPoNo(),
      supplierId: data.supplierId,
      beerId: data.beerId,
      kegQty: data.kegQty,
      litersAdded: totalVolume,
      costPerLiter: data.costPerLiter,
      totalCost,
      date: todayStr(),
      status: 'Received',
    };
    setDb(prev => ({
      ...prev,
      purchases: [...prev.purchases, purchase],
      taps: prev.taps.map(t =>
        t.id === data.beerId
          ? { ...t, currentLiters: t.currentLiters + totalVolume, costPerLiter: data.costPerLiter, supplierId: data.supplierId }
          : t
      ),
    }));
    alert(`Success! Purchase recorded. Added +${totalVolume.toFixed(1)} Liters to the selected tap.`);
  }, []);

  const savePayment = useCallback((data: { customerId: string; amount: number; paymentMethod: string; notes: string }) => {
    setDb(prev => {
      const cust = prev.customers.find(c => c.id === data.customerId);
      if (!cust) return prev;

      const payment: Payment = {
        id: genId('pay'),
        receiptNo: genReceiptNo(),
        customerId: cust.id,
        customerName: cust.name,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        notes: data.notes || `Settled tab balance (₹${data.amount.toFixed(2)})`,
        timestamp: new Date().toISOString(),
      };

      let remainingPaid = data.amount;
      const newInvoices = prev.invoices.map(inv => {
        if (inv.customerId === cust.id && inv.balanceDue > 0 && remainingPaid > 0) {
          if (remainingPaid >= inv.balanceDue) {
            remainingPaid -= inv.balanceDue;
            return { ...inv, paidAmount: inv.paidAmount + inv.balanceDue, balanceDue: 0, status: 'Paid' as const };
          } else {
            return { ...inv, paidAmount: inv.paidAmount + remainingPaid, balanceDue: inv.balanceDue - remainingPaid, status: 'Partial' as const };
          }
        }
        return inv;
      });

      const newCustomers = prev.customers.map(c =>
        c.id === cust.id ? { ...c, currentBalance: Math.max(0, (c.currentBalance || 0) - data.amount) } : c
      );

      return {
        ...prev,
        payments: [...prev.payments, payment],
        invoices: newInvoices,
        customers: newCustomers,
      };
    });
  }, []);

  const restoreData = useCallback((data: AppData) => {
    setDb(data);
  }, []);

  const loadSample = useCallback(() => {
    setDb(resetToSample());
  }, []);

  const clearAll = useCallback(() => {
    setDb(clearAllData());
  }, []);

  const value: StoreContextValue = {
    db, cart, currentView, modal, navigate, openModal, closeModal,
    clearCart, addToCart, updateCartQty, setCartCustomer, cartCustomerId,
    processCheckout, processTableCheckout, quickPour, saveCustomer, saveBeer, saveSupplier,
    saveExpense, deleteExpense, savePurchase, savePayment,
    restoreData, loadSample, clearAll,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
