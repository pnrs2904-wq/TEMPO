import { ANDROID_PACKAGE_NAME, buildSecurityHeaders } from '../config.mjs';
import {
  encryptPurchaseToken,
  hashPurchaseToken,
  verifyGoogleOidcJwt
} from '../crypto.mjs';
import { createRequestId, logStructured } from '../logger.mjs';
import { checkRateLimit } from '../redis.mjs';
import { validatePlayVerifyBody } from '../validators.mjs';

/**
 * Maps Google Play SubscriptionsV2 / One-Time Product API response into Tempo entitlement state.
 */
export function mapPlayStateToEntitlement(playData, productId, nowMs = Date.now()) {
  if (productId === 'lifetime') {
    // purchases.products.get: purchaseState 0 = Purchased, 1 = Canceled, 2 = Pending
    if (playData.purchaseState === 2) {
      return { state: 'pending', isPro: false, status: 'pending', expiryTime: null, autoRenewing: false };
    }
    if (playData.purchaseState === 1 || playData.voided === true) {
      return { state: 'voided', isPro: false, status: 'revoked', expiryTime: new Date(nowMs).toISOString(), autoRenewing: false };
    }
    if (playData.purchaseState === 0) {
      return { state: 'active', isPro: true, status: 'active', expiryTime: null, autoRenewing: false };
    }
    return { state: 'revoked', isPro: false, status: 'revoked', expiryTime: new Date(nowMs).toISOString(), autoRenewing: false };
  }

  // purchases.subscriptionsv2.get
  const subState = playData.subscriptionState;
  const lineItem = playData.lineItems?.[0] || {};
  const expiryTime = lineItem.expiryTime || playData.expiryTime || null;
  const autoRenewing = Boolean(lineItem.autoRenewingPlan?.autoRenewEnabled ?? playData.autoRenewing);
  const notExpired = !expiryTime || Date.parse(expiryTime) > nowMs;

  switch (subState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return { state: 'active', isPro: notExpired, status: notExpired ? 'active' : 'expired', expiryTime, autoRenewing };
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return { state: 'grace_period', isPro: notExpired, status: 'grace_period', expiryTime, autoRenewing };
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return { state: 'account_hold', isPro: false, status: 'account_hold', expiryTime, autoRenewing };
    case 'SUBSCRIPTION_STATE_PAUSED':
      return { state: 'paused', isPro: false, status: 'account_hold', expiryTime, autoRenewing };
    case 'SUBSCRIPTION_STATE_PENDING':
      return { state: 'pending', isPro: false, status: 'pending', expiryTime, autoRenewing };
    case 'SUBSCRIPTION_STATE_CANCELED':
      // Canceled subscriptions retain Pro strictly until expiryTime
      return { state: 'canceled', isPro: notExpired, status: notExpired ? 'canceled' : 'expired', expiryTime, autoRenewing: false };
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return { state: 'expired', isPro: false, status: 'expired', expiryTime, autoRenewing: false };
    case 'SUBSCRIPTION_STATE_REVOKED':
    default:
      return { state: 'revoked', isPro: false, status: 'revoked', expiryTime: new Date(nowMs).toISOString(), autoRenewing: false };
  }
}

export async function handlePlayVerify({
  auth,
  body,
  ip = 'unknown',
  origin = null,
  db,
  redis,
  playApi,
  tokenEncryptionKey,
  nowMs = Date.now(),
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  const respond = (status, payload, code = null) => {
    logStructured({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      requestId,
      route: '/api/billing/play/verify',
      method: 'POST',
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

  const rl = await checkRateLimit(redis, `play:verify:${auth.userId}:${ip}`, { limit: 20, windowSec: 300 });
  if (!rl.allowed) {
    return respond(429, { error: 'Too many verification requests', code: 'RATE_LIMITED' }, 'RATE_LIMITED');
  }

  const validated = validatePlayVerifyBody(body);
  if (!validated.ok) {
    return respond(400, { error: validated.error, code: 'INVALID_BODY' }, 'INVALID_BODY');
  }
  const { productId, purchaseToken } = validated.value;
  const tokenHash = hashPurchaseToken(purchaseToken);

  // Check purchase token ownership: NEVER let another user hijack a token
  const existingPurchase = await db.getPlayPurchaseByTokenHash(tokenHash);
  if (existingPurchase && existingPurchase.userId !== auth.userId) {
    return respond(409, { error: 'Purchase token is already linked to another Tempo account', code: 'TOKEN_OWNED_BY_ANOTHER_USER' }, 'TOKEN_OWNED_BY_ANOTHER_USER');
  }

  // Verify authoritatively against Google Play Android Publisher API
  let playData;
  try {
    playData = productId === 'lifetime'
      ? await playApi.getProductPurchase(ANDROID_PACKAGE_NAME, productId, purchaseToken)
      : await playApi.getSubscriptionV2(ANDROID_PACKAGE_NAME, purchaseToken);
  } catch (err) {
    return respond(502, { error: 'Google Play verification failed', code: 'PLAY_API_ERROR' }, 'PLAY_API_ERROR');
  }

  // Strict packageName check
  if (playData.packageName && playData.packageName !== ANDROID_PACKAGE_NAME) {
    return respond(403, { error: 'Package name mismatch', code: 'PACKAGE_MISMATCH' }, 'PACKAGE_MISMATCH');
  }

  // Strict productId check
  const remoteProductId = playData.productId || playData.lineItems?.[0]?.productId;
  if (remoteProductId && remoteProductId !== productId) {
    return respond(400, { error: 'Product ID mismatch with Google Play record', code: 'PRODUCT_MISMATCH' }, 'PRODUCT_MISMATCH');
  }

  const mapped = mapPlayStateToEntitlement(playData, productId, nowMs);
  const encryptedToken = encryptPurchaseToken(purchaseToken, tokenEncryptionKey);

  // Acknowledge server-side ONLY when purchase is active/valid and not yet acknowledged
  let acknowledged = Boolean(playData.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' || playData.acknowledgementState === 1 || existingPurchase?.acknowledged);
  if (mapped.isPro && !acknowledged) {
    await playApi.acknowledgePurchase(ANDROID_PACKAGE_NAME, productId, purchaseToken);
    acknowledged = true;
  }

  await db.upsertPlayPurchase({
    userId: auth.userId,
    productId,
    purchaseTokenHash: tokenHash,
    purchaseTokenEnc: encryptedToken,
    orderId: playData.latestOrderId || playData.orderId || validated.value.orderId,
    state: mapped.state,
    expiryTime: mapped.expiryTime,
    autoRenewing: mapped.autoRenewing,
    acknowledged,
    linkedPurchaseTokenHash: playData.linkedPurchaseToken ? hashPurchaseToken(playData.linkedPurchaseToken) : null,
    rawLatestNotificationType: existingPurchase?.rawLatestNotificationType || 'VERIFY_API'
  });

  const entitlement = await db.upsertEntitlement(auth.userId, {
    plan: mapped.isPro ? productId : 'free',
    status: mapped.status,
    source: 'play',
    sourceRef: tokenHash,
    includesAi: mapped.isPro,
    currentPeriodEnd: mapped.expiryTime,
    isPro: mapped.isPro
  });

  return respond(200, {
    verified: mapped.isPro,
    state: mapped.state,
    acknowledged,
    entitlement
  });
}

/**
 * POST /api/billing/play/rtdn — Google Cloud Pub/Sub Push endpoint for Real-Time Developer Notifications.
 *
 * Security invariants:
 * 1. Verifies Google-signed OIDC Bearer JWT (RS256 signature, issuer, audience, service-account email, expiry).
 * 2. Idempotent on Pub/Sub messageId via webhook_events.
 * 3. NEVER trusts the notification body state — always re-fetches authoritative state from Android Publisher API.
 */
export async function handlePlayRtdn({
  authorizationHeader,
  body,
  origin = null,
  db,
  playApi,
  oidcConfig,
  nowMs = Date.now(),
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  const respond = (status, payload, code = null) => {
    logStructured({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      requestId,
      route: '/api/billing/play/rtdn',
      method: 'POST',
      status,
      latencyMs: Date.now() - start,
      code,
      sink: logSink
    });
    return { status, headers, body: payload };
  };

  const bearer = typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice(7).trim()
    : '';

  const oidcCheck = verifyGoogleOidcJwt(bearer, {
    expectedAudience: oidcConfig.expectedAudience,
    expectedEmail: oidcConfig.expectedEmail,
    publicKeysByKid: oidcConfig.publicKeysByKid,
    nowSec: Math.floor(nowMs / 1000)
  });

  if (!oidcCheck.valid) {
    return respond(401, { error: 'Invalid Google OIDC token', code: oidcCheck.reason }, oidcCheck.reason);
  }

  const message = body?.message;
  if (!message?.data || !message?.messageId) {
    return respond(400, { error: 'Malformed Pub/Sub push envelope', code: 'INVALID_PUBSUB_MESSAGE' }, 'INVALID_PUBSUB_MESSAGE');
  }

  const isNew = await db.recordWebhookEventIfNew('play_rtdn', String(message.messageId));
  if (!isNew) {
    return respond(200, { ok: true, replayed: true });
  }

  let notification;
  try {
    notification = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
  } catch {
    return respond(400, { error: 'Invalid base64 notification payload', code: 'INVALID_RTDN_DATA' }, 'INVALID_RTDN_DATA');
  }

  if (notification.packageName !== ANDROID_PACKAGE_NAME) {
    return respond(400, { error: 'Unexpected packageName in RTDN', code: 'PACKAGE_MISMATCH' }, 'PACKAGE_MISMATCH');
  }

  if (notification.testNotification) {
    return respond(200, { ok: true, testNotification: true });
  }

  const subNotif = notification.subscriptionNotification;
  const oneTimeNotif = notification.oneTimeProductNotification;
  const voidedNotif = notification.voidedPurchaseNotification;

  const purchaseToken = subNotif?.purchaseToken || oneTimeNotif?.purchaseToken || voidedNotif?.purchaseToken;
  if (!purchaseToken) {
    return respond(200, { ok: true, ignored: true });
  }

  const tokenHash = hashPurchaseToken(purchaseToken);
  const stored = await db.getPlayPurchaseByTokenHash(tokenHash);
  if (!stored) {
    // Unknown purchase token (not yet linked to any user via /verify)
    return respond(200, { ok: true, unlinkedToken: true });
  }

  const productId = subNotif?.subscriptionId || oneTimeNotif?.sku || stored.productId;
  const rawNotifType = voidedNotif
    ? 'VOIDED_PURCHASE'
    : subNotif
      ? `SUB_${subNotif.notificationType}`
      : `ONE_TIME_${oneTimeNotif?.notificationType}`;

  // Always re-fetch authoritative state from Android Publisher API (never trust RTDN body!)
  let playData;
  try {
    playData = productId === 'lifetime'
      ? await playApi.getProductPurchase(ANDROID_PACKAGE_NAME, productId, purchaseToken)
      : await playApi.getSubscriptionV2(ANDROID_PACKAGE_NAME, purchaseToken);
  } catch {
    return respond(502, { error: 'Failed to re-verify purchase with Google Play', code: 'PLAY_API_ERROR' }, 'PLAY_API_ERROR');
  }

  const mapped = voidedNotif
    ? { state: 'voided', isPro: false, status: 'revoked', expiryTime: new Date(nowMs).toISOString(), autoRenewing: false }
    : mapPlayStateToEntitlement(playData, productId, nowMs);

  await db.upsertPlayPurchase({
    ...stored,
    state: mapped.state,
    expiryTime: mapped.expiryTime,
    autoRenewing: mapped.autoRenewing,
    rawLatestNotificationType: rawNotifType
  });

  const entitlement = await db.upsertEntitlement(stored.userId, {
    plan: mapped.isPro ? productId : 'free',
    status: mapped.status,
    source: 'play',
    sourceRef: tokenHash,
    includesAi: mapped.isPro,
    currentPeriodEnd: mapped.expiryTime,
    isPro: mapped.isPro
  });

  return respond(200, {
    ok: true,
    notificationType: rawNotifType,
    state: mapped.state,
    entitlement
  });
}
