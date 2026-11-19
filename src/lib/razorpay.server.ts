// Server-only Razorpay helpers. Never import this file from browser code.
// The customer's plan lives in the CLOUD Supabase project (the one with the `businesses` table),
// so every database call below goes to that project with its service-role key.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CLOUD_URL } from '@/lib/cloudConfig';

export type Tier = 'basic' | 'pro' | 'premium';
export type Cycle = 'monthly' | 'yearly';

// Keep these prices the same as the PLANS list in src/routes/_authenticated/pricing.tsx.
// The price is always decided here on the server, never by the browser.
export const PRICE_RUPEES: Record<Tier, Record<Cycle, number>> = {
  basic: { monthly: 499, yearly: 4999 },
  pro: { monthly: 999, yearly: 9999 },
  premium: { monthly: 1999, yearly: 19999 },
};

const TIERS: Tier[] = ['basic', 'pro', 'premium'];
const CYCLES: Cycle[] = ['monthly', 'yearly'];

/** An error whose message is safe to show to the customer. */
export class UserError extends Error {}

export function friendlyMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  console.error('[razorpay]', e);
  return 'Something went wrong. Please try again, or contact support.';
}

function need(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`[razorpay] missing server setting ${name}`);
    throw new UserError('Online payment is not set up yet. Please contact support.');
  }
  return v.trim();
}

function isNewKey(v: string): boolean {
  return v.startsWith('sb_publishable_') || v.startsWith('sb_secret_');
}

function keyAwareFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, k) => headers.set(k, value));
    }
    if (isNewKey(key) && headers.get('Authorization') === `Bearer ${key}`) {
      headers.delete('Authorization');
    }
    headers.set('apikey', key);
    return fetch(input, { ...init, headers });
  };
}

/** Admin client for the CLOUD project. Bypasses RLS, so it must stay on the server. */
export function cloudAdmin(): any {
  const url = (process.env['CLOUD_SUPABASE_URL'] || CLOUD_URL).trim();
  const key = need('CLOUD_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    global: { fetch: keyAwareFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

// ---------- dates ----------

/** Today's date in India as YYYY-MM-DD. */
export function istToday(now: number = Date.now()): string {
  return new Date(now + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/** Adds whole months to a YYYY-MM-DD date. Jan 31 + 1 month = Feb 28 (or 29). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, last);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

// ---------- signatures ----------

function sameText(a: string, b: string): boolean {
  const A = Buffer.from(a, 'utf8');
  const B = Buffer.from(b, 'utf8');
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

/** Checks the signature Razorpay Checkout gives the browser after a payment. */
export function checkoutSignatureOk(orderId: string, paymentId: string, signature: string): boolean {
  const secret = need('RAZORPAY_KEY_SECRET');
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return sameText(expected, String(signature ?? ''));
}

/** Checks the X-Razorpay-Signature header of a webhook call against the raw request body. */
export function webhookSignatureOk(rawBody: string, signature: string): boolean {
  const secret = need('RAZORPAY_WEBHOOK_SECRET');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return sameText(expected, String(signature ?? ''));
}

// ---------- Razorpay API ----------

function rzpAuthHeader(): string {
  return 'Basic ' + btoa(`${need('RAZORPAY_KEY_ID')}:${need('RAZORPAY_KEY_SECRET')}`);
}

async function rzpCreateOrder(body: Record<string, unknown>): Promise<any> {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: rzpAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.id) {
    console.error('[razorpay] order create failed', res.status, JSON.stringify(json)?.slice(0, 300));
    throw new UserError('Could not start the payment. Please try again.');
  }
  return json;
}

async function rzpGetPayment(paymentId: string): Promise<any> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: rzpAuthHeader() },
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.id) {
    console.error('[razorpay] payment fetch failed', res.status, JSON.stringify(json)?.slice(0, 300));
    throw new UserError('Could not confirm the payment right now. If money was deducted, the plan will activate shortly.');
  }
  return json;
}

// ---------- database (cloud project) ----------

async function userIdFromToken(db: any, token: string): Promise<string> {
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) throw new UserError('Please sign in to your account again.');
  return String(data.user.id);
}

async function findBusinessByUser(db: any, userId: string): Promise<any | null> {
  const { data, error } = await db
    .from('businesses')
    .select('id, business_name, paid_until, active')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? [])[0] ?? null;
}

async function findBusinessById(db: any, id: string): Promise<any | null> {
  const { data, error } = await db
    .from('businesses')
    .select('id, business_name, paid_until, active')
    .eq('id', id)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? [])[0] ?? null;
}

async function loadOrder(db: any, orderId: string): Promise<any | null> {
  const { data, error } = await db
    .from('razorpay_orders')
    .select('order_id, business_id, user_id, plan_tier, cycle, amount_paise, currency, status')
    .eq('order_id', orderId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? [])[0] ?? null;
}

// ---------- 1) start a payment ----------

export async function createOrderForToken(cloudToken: string, tier: Tier, cycle: Cycle) {
  if (!TIERS.includes(tier) || !CYCLES.includes(cycle)) {
    throw new UserError('Please choose a valid plan.');
  }
  if (typeof cloudToken !== 'string' || cloudToken.split('.').length !== 3) {
    throw new UserError('Please sign in to your account first.');
  }
  const db = cloudAdmin();
  const userId = await userIdFromToken(db, cloudToken);
  const biz = await findBusinessByUser(db, userId);
  if (!biz) throw new UserError('No business account found for this login. Please contact support.');
  if (biz.active === false) throw new UserError('This account is switched off. Please contact support.');

  const amountRupees = PRICE_RUPEES[tier][cycle];
  const amountPaise = amountRupees * 100;
  const receipt = `pt${Date.now().toString(36)}${String(biz.id).replace(/-/g, '').slice(0, 10)}`;

  const order = await rzpCreateOrder({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes: { business_id: String(biz.id), tier, cycle },
  });

  const { error } = await db.from('razorpay_orders').insert({
    order_id: String(order.id),
    business_id: String(biz.id),
    user_id: userId,
    plan_tier: tier,
    cycle,
    amount_paise: amountPaise,
    currency: 'INR',
    status: 'created',
  });
  if (error) throw new Error(error.message);

  return {
    orderId: String(order.id),
    amountPaise,
    currency: 'INR',
    keyId: need('RAZORPAY_KEY_ID'),
    businessName: String(biz.business_name ?? ''),
  };
}

// ---------- 2) apply a paid order (shared by the browser check and the webhook) ----------

async function applyPaidOrder(
  db: any,
  order: any,
  paymentId: string,
): Promise<{ paidUntil: string | null; already: boolean }> {
  // Claim the order first. Only one caller can move it from 'created' to 'paid',
  // so a payment can never extend the plan twice.
  const { data: claimed, error: claimError } = await db
    .from('razorpay_orders')
    .update({ status: 'paid', payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq('order_id', order.order_id)
    .eq('status', 'created')
    .select('order_id')
    .limit(1);
  if (claimError) throw new Error(claimError.message);

  if (!claimed || claimed.length === 0) {
    const biz = await findBusinessById(db, String(order.business_id));
    return { paidUntil: biz?.paid_until ? String(biz.paid_until).slice(0, 10) : null, already: true };
  }

  try {
    const biz = await findBusinessById(db, String(order.business_id));
    if (!biz) throw new Error('business not found for paid order ' + order.order_id);

    const today = istToday();
    const current = biz.paid_until ? String(biz.paid_until).slice(0, 10) : '';
    const base = current && current > today ? current : today;
    const paidUntil = addMonthsIso(base, order.cycle === 'yearly' ? 12 : 1);
    const amountRupees = Math.round(Number(order.amount_paise)) / 100;

    const { error: upError } = await db
      .from('businesses')
      .update({ paid_until: paidUntil, plan: order.cycle, plan_tier: order.plan_tier, price: amountRupees })
      .eq('id', order.business_id);
    if (upError) throw new Error(upError.message);

    // Payment history for the admin panel. Best effort: the plan is already extended.
    for (const method of ['Razorpay', 'UPI']) {
      const { error: payError } = await db.from('business_payments').insert({
        business_id: order.business_id,
        amount: amountRupees,
        paid_on: today,
        method,
        reference: paymentId,
        note: `Razorpay online payment (${order.plan_tier}, ${order.cycle})`,
      });
      if (!payError) break;
      console.error('[razorpay] could not log payment history with method', method, payError.message);
    }
    return { paidUntil, already: false };
  } catch (e) {
    // Put the order back so the webhook (or a retry) can finish the job.
    await db.from('razorpay_orders').update({ status: 'created' }).eq('order_id', order.order_id);
    throw e;
  }
}

// ---------- 3) the browser says "payment done" ----------

export async function verifyPaymentForToken(
  cloudToken: string,
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<{ state: 'active' | 'pending'; paidUntil: string | null }> {
  if (!orderId || !paymentId || !signature) throw new UserError('Payment details are incomplete.');
  const db = cloudAdmin();
  const userId = await userIdFromToken(db, String(cloudToken));
  const order = await loadOrder(db, String(orderId));
  if (!order || String(order.user_id) !== userId) throw new UserError('This payment does not belong to your account.');
  if (!checkoutSignatureOk(String(orderId), String(paymentId), String(signature))) {
    throw new UserError('Payment could not be verified.');
  }

  const pay = await rzpGetPayment(String(paymentId));
  if (
    String(pay.order_id) !== String(orderId) ||
    Number(pay.amount) !== Number(order.amount_paise) ||
    String(pay.currency) !== 'INR'
  ) {
    console.error('[razorpay] payment does not match order', orderId, paymentId);
    throw new UserError('Payment could not be verified.');
  }
  if (pay.status !== 'captured') {
    // Not captured yet. The webhook will activate the plan as soon as it is captured.
    return { state: 'pending', paidUntil: null };
  }

  const r = await applyPaidOrder(db, order, String(paymentId));
  return { state: 'active', paidUntil: r.paidUntil };
}

// ---------- 4) Razorpay calls our webhook ----------

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export async function handleWebhook(request: Request): Promise<Response> {
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  let valid = false;
  try {
    valid = webhookSignatureOk(raw, signature);
  } catch (e) {
    console.error('[razorpay] webhook setup problem', e);
    return jsonResponse({ ok: false, error: 'server configuration' }, 500);
  }
  if (!valid) return jsonResponse({ ok: false, error: 'invalid signature' }, 400);

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ ok: false, error: 'bad body' }, 400);
  }

  const event = String(body?.event ?? '');
  if (event !== 'payment.captured' && event !== 'order.paid') return jsonResponse({ ok: true, ignored: event });

  const pay = body?.payload?.payment?.entity;
  if (!pay?.id || !pay?.order_id) return jsonResponse({ ok: true, ignored: 'no payment' });
  if (pay.status !== 'captured') return jsonResponse({ ok: true, ignored: 'not captured' });

  try {
    const db = cloudAdmin();
    const order = await loadOrder(db, String(pay.order_id));
    if (!order) return jsonResponse({ ok: true, ignored: 'unknown order' });
    if (Number(pay.amount) !== Number(order.amount_paise) || String(pay.currency) !== 'INR') {
      console.error('[razorpay] webhook amount mismatch for order', order.order_id);
      return jsonResponse({ ok: true, ignored: 'amount mismatch' });
    }
    await applyPaidOrder(db, order, String(pay.id));
    return jsonResponse({ ok: true });
  } catch (e) {
    console.error('[razorpay] webhook failed, Razorpay will retry', e);
    return jsonResponse({ ok: false, error: 'temporary error' }, 500);
  }
}
