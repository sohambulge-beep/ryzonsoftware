import { getCloudClient } from '@/lib/adminCheck';
import { persistPlan, type PlanId } from '@/lib/plan';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export type PayOutcome = {
  status: 'active' | 'pending' | 'cancelled' | 'error';
  message: string;
};

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadCheckout(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const done = () => resolve(!!window.Razorpay);
    const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const s = document.createElement('script');
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = done;
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

async function getCloudToken(): Promise<string | null> {
  try {
    const c = getCloudClient();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Runs the whole payment: create order -> Razorpay popup -> server verification.
 * createOrder / verifyPayment are the server functions from razorpay.functions.ts
 * (wrapped with useServerFn in the page).
 */
export async function payForPlan(args: {
  plan: PlanId;
  cycle: 'monthly' | 'yearly';
  createOrder: (a: any) => Promise<any>;
  verifyPayment: (a: any) => Promise<any>;
}): Promise<PayOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'error', message: 'No internet. Please connect and try again.' };
  }

  const cloudToken = await getCloudToken();
  if (!cloudToken) {
    return {
      status: 'error',
      message: 'Please sign in to your business account (My account / Cloud login) first, then try again.',
    };
  }

  const scriptOk = await loadCheckout();
  if (!scriptOk) {
    return { status: 'error', message: 'Could not open the payment window. Check your internet and try again.' };
  }

  const order = await args.createOrder({ data: { cloudToken, plan: args.plan, cycle: args.cycle } });
  if (!order?.ok) {
    return { status: 'error', message: order?.error || 'Could not start the payment.' };
  }

  return new Promise<PayOutcome>((resolve) => {
    let handled = false;

    const options = {
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      order_id: order.orderId,
      name: 'TapTrack',
      description: `${args.plan} plan (${args.cycle})`,
      theme: { color: '#f59e0b' },
      handler: async (resp: any) => {
        handled = true;
        try {
          const fresh = await getCloudToken();
          const v = await args.verifyPayment({
            data: {
              cloudToken: fresh ?? cloudToken,
              orderId: resp?.razorpay_order_id,
              paymentId: resp?.razorpay_payment_id,
              signature: resp?.razorpay_signature,
            },
          });
          if (!v?.ok) {
            resolve({
              status: 'error',
              message: `${v?.error || 'Could not confirm the payment.'} If money was deducted, your plan will activate automatically within a few minutes.`,
            });
            return;
          }
          if (v.state === 'active') {
            persistPlan(args.plan);
            resolve({
              status: 'active',
              message: `Payment successful. Your plan is active${v.paidUntil ? ` till ${v.paidUntil}` : ''}.`,
            });
          } else {
            resolve({
              status: 'pending',
              message: 'Payment received. Your plan will activate in a few minutes. You can close this page.',
            });
          }
        } catch {
          resolve({
            status: 'error',
            message: 'Could not confirm the payment. If money was deducted, your plan will activate automatically within a few minutes.',
          });
        }
      },
      modal: {
        ondismiss: () => {
          if (!handled) resolve({ status: 'cancelled', message: 'Payment cancelled.' });
        },
      },
    };

    try {
      const rzp = new window.Razorpay!(options);
      rzp.open();
    } catch {
      resolve({ status: 'error', message: 'Could not open the payment window. Please try again.' });
    }
  });
}
