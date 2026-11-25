import { buildSecurityHeaders } from '../config.mjs';
import { createRequestId, logStructured } from '../logger.mjs';
import { checkRateLimit } from '../redis.mjs';
import { assertStrictKeys } from '../validators.mjs';

export async function handleAccountExport({
  auth,
  ip = 'unknown',
  origin = null,
  db,
  redis,
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  if (!auth?.userId) {
    return { status: 401, headers, body: { error: 'Authentication required', code: 'UNAUTHORIZED' } };
  }

  const rl = await checkRateLimit(redis, `acct:export:${auth.userId}:${ip}`, { limit: 10, windowSec: 300 });
  if (!rl.allowed) {
    return { status: 429, headers, body: { error: 'Too many export requests', code: 'RATE_LIMITED' } };
  }

  const data = await db.exportFullAccountData(auth.userId);
  // Guarantee purchase tokens are NEVER included in export
  const sanitizedPlayPurchases = (data.playPurchases || []).map((p) => ({
    id: p.id,
    productId: p.productId || p.product_id,
    orderId: p.orderId || p.order_id || null,
    state: p.state,
    expiryTime: p.expiryTime || p.expiry_time || null,
    autoRenewing: Boolean(p.autoRenewing ?? p.auto_renewing),
    createdAt: p.createdAt || p.created_at
  }));

  logStructured({ level: 'info', requestId, route: '/api/account', method: 'GET', status: 200, latencyMs: Date.now() - start, sink: logSink });

  return {
    status: 200,
    headers,
    body: {
      exportedAt: new Date().toISOString(),
      schemaVersion: '4.0',
      user: { id: auth.userId, email: auth.email || null },
      profile: data.profile || null,
      preferences: data.preferences || {},
      sessions: data.sessions || [],
      examPrep: {
        plans: data.plans || [],
        topics: data.topics || [],
        revisions: data.revisions || [],
        mocks: data.mocks || [],
        questionAttempts: data.questionAttempts || []
      },
      purchasesSummary: {
        razorpayPayments: data.payments || [],
        googlePlayPurchases: sanitizedPlayPurchases
      },
      consents: data.consents || []
    }
  };
}

export async function handleAccountDelete({
  auth,
  body,
  ip = 'unknown',
  origin = null,
  db,
  redis,
  razorpayClient = null,
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  const respond = (status, payload, code = null) => {
    logStructured({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      requestId,
      route: '/api/account',
      method: 'DELETE',
      status,
      latencyMs: Date.now() - start,
      code,
      sink: logSink
    });
    return { status, headers, body: payload };
  };

  if (!auth?.userId) {
    return respond(401, { error: 'Authentication required', code: 'UNAUTHORIZED' }, 'UNAUTHORIZED');
  }

  const rl = await checkRateLimit(redis, `acct:del:${auth.userId}:${ip}`, { limit: 5, windowSec: 300 });
  if (!rl.allowed) {
    return respond(429, { error: 'Too many account deletion attempts', code: 'RATE_LIMITED' }, 'RATE_LIMITED');
  }

  const keyErr = assertStrictKeys(body, new Set(['confirmation']), 'delete account');
  if (keyErr || body.confirmation !== 'DELETE') {
    return respond(400, { error: 'Type confirmation: "DELETE" to permanently delete your account', code: 'CONFIRMATION_REQUIRED' }, 'CONFIRMATION_REQUIRED');
  }

  // Refuse while the user owns an institute
  const ownedInstitutes = await db.countOwnedInstitutes(auth.userId);
  if (ownedInstitutes > 0) {
    return respond(
      409,
      {
        error: 'Transfer or delete your owned institute(s) before deleting your account.',
        code: 'INSTITUTE_OWNER_MUST_TRANSFER',
        ownedInstitutes
      },
      'INSTITUTE_OWNER_MUST_TRANSFER'
    );
  }

  // Cancel active Razorpay subscriptions server-side
  const entitlement = await db.getActiveEntitlement(auth.userId);
  let razorpayCanceled = false;
  // Only a Razorpay subscription (sub_…) can be cancelled; one-time payments have nothing to cancel.
  if (entitlement?.source === 'razorpay' && String(entitlement?.sourceRef || '').startsWith('sub_') && razorpayClient) {
    try {
      await razorpayClient.cancelSubscription(entitlement.sourceRef, { cancelAtCycleEnd: false });
      razorpayCanceled = true;
    } catch {
      return respond(502, { error: 'Failed to cancel active Razorpay subscription; account not deleted yet.', code: 'RAZORPAY_CANCEL_FAILED' }, 'RAZORPAY_CANCEL_FAILED');
    }
  }

  // Google Play subscriptions cannot be cancelled by backend without user action in Play Store
  const hasActivePlaySub = entitlement?.source === 'play' && ['active', 'grace_period', 'account_hold'].includes(entitlement.status);
  const playCancelNotice = hasActivePlaySub
    ? 'Your Google Play subscription must also be cancelled directly in Google Play Store -> Payments & subscriptions to stop renewal.'
    : null;

  await db.deleteUserAccountCascade(auth.userId);

  return respond(200, {
    deleted: true,
    razorpaySubscriptionCanceled: razorpayCanceled,
    playCancelNotice
  });
}
