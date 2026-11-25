import { buildSecurityHeaders, SERVER_PRICES } from '../config.mjs';
import { verifyHmacSha256ConstantTime } from '../crypto.mjs';
import { createRequestId, logStructured } from '../logger.mjs';
import { checkRateLimit } from '../redis.mjs';
import { assertStrictKeys } from '../validators.mjs';

function addPeriodMs(plan, nowMs) {
  if (plan === 'pro_monthly') return new Date(nowMs + 31 * 86400_000).toISOString();
  if (plan === 'pro_annual') return new Date(nowMs + 366 * 86400_000).toISOString();
  return null; // lifetime
}

/** A pass bought before the current one ends starts when the current one ends, so no paid days are lost. */
function periodStartMs(current, nowMs) {
  if (current?.isPro && current.currentPeriodEnd) {
    const end = Date.parse(current.currentPeriodEnd);
    if (Number.isFinite(end) && end > nowMs) return end;
  }
  return nowMs;
}

export async function handleRazorpayCheckout({
  auth,
  body,
  ip = 'unknown',
  origin = null,
  db,
  redis,
  razorpayClient,
  razorpayKeyId,
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  if (!auth?.userId) {
    return { status: 401, headers, body: { error: 'Authentication required', code: 'UNAUTHORIZED' } };
  }

  const rl = await checkRateLimit(redis, `rzp:checkout:${auth.userId}:${ip}`, { limit: 15, windowSec: 300 });
  if (!rl.allowed) {
    return { status: 429, headers, body: { error: 'Too many checkout requests', code: 'RATE_LIMITED' } };
  }

  const keyErr = assertStrictKeys(body, new Set(['plan']), 'razorpay checkout');
  if (keyErr || !SERVER_PRICES[body?.plan]) {
    return { status: 400, headers, body: { error: keyErr || 'Unknown plan', code: 'INVALID_PLAN' } };
  }

  const planDef = SERVER_PRICES[body.plan];
  const current = await db.getActiveEntitlement(auth.userId);
  if (current?.isPro && current.plan === 'lifetime') {
    return { status: 409, headers, body: { error: 'You already have lifetime Pro', code: 'ALREADY_LIFETIME' } };
  }
  const order = await razorpayClient.createOrder({
    amountPaise: planDef.amountPaise,
    currency: planDef.currency,
    receipt: `tempo_${auth.userId.slice(0, 8)}_${Date.now()}`,
    notes: { userId: auth.userId, plan: planDef.productId }
  });

  await db.recordPayment({
    userId: auth.userId,
    provider: 'razorpay',
    providerOrderId: order.id,
    plan: planDef.productId,
    amountPaise: planDef.amountPaise,
    currency: planDef.currency,
    status: 'created'
  });

  logStructured({ level: 'info', requestId, route: '/api/billing/checkout', method: 'POST', status: 200, latencyMs: Date.now() - start, sink: logSink });

  return {
    status: 200,
    headers,
    body: {
      keyId: razorpayKeyId || '',
      orderId: order.id,
      amountPaise: planDef.amountPaise,
      currency: planDef.currency,
      plan: planDef.productId
    }
  };
}

export async function handleRazorpayVerify({
  auth,
  body,
  ip = 'unknown',
  origin = null,
  db,
  redis,
  razorpayKeySecret,
  nowMs = Date.now(),
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  if (!auth?.userId) {
    return { status: 401, headers, body: { error: 'Authentication required', code: 'UNAUTHORIZED' } };
  }

  const rl = await checkRateLimit(redis, `rzp:verify:${auth.userId}:${ip}`, { limit: 20, windowSec: 300 });
  if (!rl.allowed) {
    return { status: 429, headers, body: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' } };
  }

  const allowed = new Set(['razorpay_order_id', 'razorpay_subscription_id', 'razorpay_payment_id', 'razorpay_signature', 'plan']);
  const keyErr = assertStrictKeys(body, allowed, 'razorpay verify');
  // Checkout only creates one-time orders, so an order id is required. The plan is taken from the
  // order this server created for this user, never from the request: the Razorpay signature covers
  // only order_id|payment_id, so a client-supplied plan could otherwise be upgraded after paying less.
  if (keyErr || !body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
    return { status: 400, headers, body: { error: keyErr || 'Missing payment verification fields', code: 'INVALID_BODY' } };
  }

  const signingPayload = `${body.razorpay_order_id}|${body.razorpay_payment_id}`;

  const signatureOk = verifyHmacSha256ConstantTime(signingPayload, body.razorpay_signature, razorpayKeySecret);
  if (!signatureOk) {
    logStructured({ level: 'warn', requestId, route: '/api/billing/verify', method: 'POST', status: 400, latencyMs: Date.now() - start, code: 'INVALID_SIGNATURE', sink: logSink });
    return { status: 400, headers, body: { error: 'Invalid payment signature', code: 'INVALID_SIGNATURE' } };
  }

  // Idempotent by provider_payment_id
  const existingPayment = await db.getPaymentByProviderPaymentId(body.razorpay_payment_id);
  if (existingPayment) {
    if (existingPayment.userId !== auth.userId) {
      return { status: 409, headers, body: { error: 'Payment belongs to another account', code: 'PAYMENT_OWNERSHIP_CONFLICT' } };
    }
    const entitlement = await db.getActiveEntitlement(auth.userId);
    return { status: 200, headers, body: { verified: true, idempotentReplay: true, entitlement } };
  }

  const order = await db.getPaymentByProviderOrderId(body.razorpay_order_id);
  if (!order || order.userId !== auth.userId || !SERVER_PRICES[order.plan]) {
    return { status: 400, headers, body: { error: 'Unknown order for this account', code: 'ORDER_NOT_FOUND' } };
  }
  if (body.plan && body.plan !== order.plan) {
    return { status: 400, headers, body: { error: 'Plan does not match the order', code: 'PLAN_MISMATCH' } };
  }
  const planDef = SERVER_PRICES[order.plan];
  const current = await db.getActiveEntitlement(auth.userId);
  await db.recordPayment({
    userId: auth.userId,
    provider: 'razorpay',
    providerPaymentId: body.razorpay_payment_id,
    providerOrderId: body.razorpay_order_id || null,
    providerSubscriptionId: body.razorpay_subscription_id || null,
    plan: planDef.productId,
    amountPaise: planDef.amountPaise,
    currency: planDef.currency,
    status: 'captured'
  });

  const entitlement = await db.upsertEntitlement(auth.userId, {
    plan: planDef.productId,
    status: 'active',
    source: 'razorpay',
    sourceRef: body.razorpay_payment_id,
    includesAi: planDef.includesAi,
    currentPeriodEnd: addPeriodMs(planDef.productId, periodStartMs(current, nowMs))
  });

  logStructured({ level: 'info', requestId, route: '/api/billing/verify', method: 'POST', status: 200, latencyMs: Date.now() - start, sink: logSink });
  return { status: 200, headers, body: { verified: true, entitlement } };
}

export async function handleRazorpayWebhook({
  rawBody,
  signatureHeader,
  eventIdHeader = null,
  origin = null,
  db,
  webhookSecret,
  nowMs = Date.now(),
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  if (!verifyHmacSha256ConstantTime(rawBody, signatureHeader, webhookSecret)) {
    logStructured({ level: 'warn', requestId, route: '/api/billing/webhook', method: 'POST', status: 401, latencyMs: Date.now() - start, code: 'INVALID_WEBHOOK_SIGNATURE', sink: logSink });
    return { status: 401, headers, body: { error: 'Invalid webhook signature', code: 'INVALID_WEBHOOK_SIGNATURE' } };
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, headers, body: { error: 'Invalid JSON payload', code: 'INVALID_JSON' } };
  }

  const eventId = eventIdHeader || event.id || `${event.event}:${event.created_at}`;
  const isNew = await db.recordWebhookEventIfNew('razorpay', eventId);
  if (!isNew) {
    return { status: 200, headers, body: { ok: true, replayed: true } };
  }

  const type = event.event;
  const paymentEntity = event.payload?.payment?.entity;
  const subEntity = event.payload?.subscription?.entity;
  const userId = paymentEntity?.notes?.userId || subEntity?.notes?.userId || null;
  const plan = paymentEntity?.notes?.plan || subEntity?.notes?.plan || 'pro_monthly';

  if (userId) {
    if (type === 'payment.captured' || type === 'subscription.charged') {
      const periodEnd = subEntity?.current_end
        ? new Date(subEntity.current_end * 1000).toISOString()
        : addPeriodMs(plan, nowMs);
      await db.upsertEntitlement(userId, {
        plan,
        status: 'active',
        source: 'razorpay',
        sourceRef: subEntity?.id || paymentEntity?.id || eventId,
        includesAi: true,
        currentPeriodEnd: periodEnd
      });
    } else if (type === 'subscription.cancelled') {
      // Keep Pro through current_period_end, mark status canceled
      const current = await db.getActiveEntitlement(userId);
      const periodEnd = subEntity?.current_end
        ? new Date(subEntity.current_end * 1000).toISOString()
        : (current?.currentPeriodEnd || new Date(nowMs).toISOString());
      await db.upsertEntitlement(userId, {
        plan: current?.plan || plan,
        status: 'canceled',
        source: 'razorpay',
        sourceRef: subEntity?.id || current?.sourceRef || eventId,
        includesAi: false,
        currentPeriodEnd: periodEnd
      });
    } else if (type === 'payment.refunded' || type === 'refund.processed') {
      // Refund immediately revokes Pro
      await db.upsertEntitlement(userId, {
        plan: 'free',
        status: 'revoked',
        source: 'razorpay',
        sourceRef: paymentEntity?.id || eventId,
        includesAi: false,
        currentPeriodEnd: new Date(nowMs).toISOString()
      });
    }
  }

  logStructured({ level: 'info', requestId, route: '/api/billing/webhook', method: 'POST', status: 200, latencyMs: Date.now() - start, sink: logSink });
  return { status: 200, headers, body: { ok: true, processedEvent: type } };
}

export async function handleRazorpayCancel({
  auth,
  origin = null,
  db,
  razorpayClient,
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  if (!auth?.userId) {
    return { status: 401, headers, body: { error: 'Authentication required', code: 'UNAUTHORIZED' } };
  }

  const ent = await db.getActiveEntitlement(auth.userId);
  if (!ent || ent.source !== 'razorpay' || !ent.sourceRef) {
    return { status: 404, headers, body: { error: 'No active Razorpay subscription found', code: 'NO_ACTIVE_RAZORPAY_SUB' } };
  }

  // Checkout sells one-time orders (source_ref = payment id): nothing renews, so there is nothing
  // to cancel at Razorpay. Only a real subscription id (sub_…) is cancelled there.
  if (String(ent.sourceRef).startsWith('sub_')) {
    await razorpayClient.cancelSubscription(ent.sourceRef, { cancelAtCycleEnd: true });
  }
  const updated = await db.upsertEntitlement(auth.userId, {
    ...ent,
    status: 'canceled'
  });

  logStructured({ level: 'info', requestId, route: '/api/billing/cancel', method: 'POST', status: 200, latencyMs: Date.now() - start, sink: logSink });
  return { status: 200, headers, body: { canceledAtPeriodEnd: true, entitlement: updated } };
}
