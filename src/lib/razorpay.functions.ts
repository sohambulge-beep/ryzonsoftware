import { createServerFn } from '@tanstack/react-start';

type Tier = 'basic' | 'pro' | 'premium';
type Cycle = 'monthly' | 'yearly';

export type CreateOrderResult =
  | { ok: true; orderId: string; amountPaise: number; currency: string; keyId: string; businessName: string }
  | { ok: false; error: string };

export type VerifyPaymentResult =
  | { ok: true; state: 'active' | 'pending'; paidUntil: string | null }
  | { ok: false; error: string };

// Step 1: the customer taps "Pay". The server checks who they are, decides the price, and asks Razorpay for an order.
// The customer is identified by their CLOUD login token (the same login used for "My account").
export const createRazorpayOrder = createServerFn({ method: 'POST' })
  .inputValidator((input: { cloudToken: string; plan: Tier; cycle: Cycle }) => input)
  .handler(async ({ data }): Promise<CreateOrderResult> => {
    const s = await import('@/lib/razorpay.server');
    try {
      const order = await s.createOrderForToken(data.cloudToken, data.plan, data.cycle);
      return { ok: true, ...order };
    } catch (e) {
      return { ok: false, error: s.friendlyMessage(e) };
    }
  });

// Step 2: Razorpay Checkout says the payment is done. The server re-checks everything before changing the plan.
export const verifyRazorpayPayment = createServerFn({ method: 'POST' })
  .inputValidator((input: { cloudToken: string; orderId: string; paymentId: string; signature: string }) => input)
  .handler(async ({ data }): Promise<VerifyPaymentResult> => {
    const s = await import('@/lib/razorpay.server');
    try {
      const r = await s.verifyPaymentForToken(data.cloudToken, data.orderId, data.paymentId, data.signature);
      return { ok: true, state: r.state, paidUntil: r.paidUntil };
    } catch (e) {
      return { ok: false, error: s.friendlyMessage(e) };
    }
  });
