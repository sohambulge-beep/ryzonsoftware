import type { AppData, Invoice } from '@/types';

export type DiscountMode = 'amount' | 'percent';

export interface DiscountInput {
  mode: DiscountMode;
  value: number;
  reason: string;
}

/** Staff (anyone who is not the owner) can give at most this much, as a percent of the bill. */
export const STAFF_MAX_PERCENT = 10;

// All money maths below is done in paise (whole numbers) so totals always add up exactly.
const toPaise = (n: number): number => Math.round(((Number(n) || 0) + Number.EPSILON) * 100);
const fromPaise = (p: number): number => p / 100;
const money = (p: number): string => `₹${(p / 100).toFixed(2)}`;

export type DiscountCheck = { ok: true; amount: number } | { ok: false; error: string };

/** Checks a discount against the bill's subtotal (before tax) and returns the discount in rupees. */
export function checkDiscount(subtotal: number, input: DiscountInput, isOwner: boolean): DiscountCheck {
  const grossPaise = toPaise(subtotal);
  if (grossPaise <= 0) return { ok: false, error: 'Add items to the bill first.' };

  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'Enter a discount of more than 0.' };
  if (input.mode === 'percent' && value > 100) {
    return { ok: false, error: 'A percent discount cannot be more than 100%.' };
  }

  const paise = input.mode === 'percent' ? Math.round((grossPaise * value) / 100) : toPaise(value);
  if (paise <= 0) return { ok: false, error: 'This discount is too small to count.' };
  if (paise > grossPaise) {
    return { ok: false, error: `Discount cannot be more than the bill (${money(grossPaise)}).` };
  }
  if (!isOwner && paise * 100 > grossPaise * STAFF_MAX_PERCENT) {
    return { ok: false, error: `Staff can give up to ${STAFF_MAX_PERCENT}% discount. Ask the owner for more.` };
  }
  if (String(input.reason ?? '').trim().length < 3) {
    return { ok: false, error: 'Please write a reason (at least 3 letters).' };
  }
  return { ok: true, amount: fromPaise(paise) };
}

/**
 * Shares a discount across the bill's lines in proportion to each line, to the exact paisa.
 * Used so item totals, profit, stock reports and sales returns all see the discounted price.
 */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const parts = lineTotals.map(toPaise);
  const total = parts.reduce((a, b) => a + b, 0);
  const d = Math.min(toPaise(discount), total);
  if (total <= 0 || d <= 0) return lineTotals.map(() => 0);

  const raw = parts.map(p => (p * d) / total);
  const shares = raw.map(r => Math.floor(r));
  let left = d - shares.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && left > 0; k++) {
    shares[order[k].i] += 1;
    left -= 1;
  }
  return shares.map(fromPaise);
}

export type DiscountBuild = { error: string } | { amount: number; invoice: Invoice; db: AppData };

/**
 * Works out the bill after a discount, without changing anything outside the returned copy.
 * The discount is taken off before tax, and tax is worked out on what is left.
 * GST bills are not changed here (their tax and e-invoice records need a separate, careful step).
 */
export function applyDiscountToDb(
  db: AppData,
  invoiceId: string,
  input: DiscountInput,
  ctx: { isOwner: boolean; by: string },
): DiscountBuild {
  const inv = db.invoices.find(i => i.id === invoiceId);
  if (!inv) return { error: 'This bill was not found.' };
  if (inv.gst) return { error: 'Discount is not available on GST bills yet.' };
  if ((inv.discount ?? 0) > 0) return { error: 'This bill already has a discount.' };

  const grossPaise = inv.items.reduce((s, it) => s + toPaise(it.total), 0);
  const check = checkDiscount(fromPaise(grossPaise), input, ctx.isOwner);
  if (!check.ok) return { error: check.error };

  const shares = allocateDiscount(inv.items.map(it => it.total), check.amount);
  const newItems = inv.items.map((it, i) => ({ ...it, total: fromPaise(toPaise(it.total) - toPaise(shares[i])) }));
  const newSubtotal = fromPaise(newItems.reduce((s, it) => s + toPaise(it.total), 0));
  const newTax = Number((newSubtotal * db.settings.taxRate).toFixed(2));
  const newTotal = Number((newSubtotal + newTax).toFixed(2));
  const delta = fromPaise(toPaise(inv.total) - toPaise(newTotal));

  const onTab = inv.paymentMethod === 'Tab';
  let paidAmount = inv.paidAmount;
  let balanceDue: number;
  let status: Invoice['status'];
  if (onTab) {
    balanceDue = Math.max(0, fromPaise(toPaise(newTotal) - toPaise(paidAmount)));
    status = balanceDue <= 0.005 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
  } else {
    paidAmount = newTotal;
    balanceDue = 0;
    status = 'Paid';
  }

  const invoice: Invoice = {
    ...inv,
    items: newItems,
    subtotal: newSubtotal,
    tax: newTax,
    total: newTotal,
    paidAmount,
    balanceDue,
    status,
    discount: check.amount,
    discountReason: input.reason.trim().slice(0, 200),
    discountBy: ctx.by,
  };

  const next: AppData = {
    ...db,
    invoices: db.invoices.map(i => (i.id === inv.id ? invoice : i)),
    customers: db.customers.map(c =>
      c.id === inv.customerId
        ? {
            ...c,
            totalSpent: Math.max(0, fromPaise(toPaise(c.totalSpent || 0) - toPaise(delta))),
            currentBalance: onTab
              ? Math.max(0, fromPaise(toPaise(c.currentBalance || 0) - toPaise(delta)))
              : c.currentBalance,
          }
        : c,
    ),
  };

  return { amount: check.amount, invoice, db: next };
}
