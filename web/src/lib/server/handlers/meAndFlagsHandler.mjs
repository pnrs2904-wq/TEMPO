import {
  activeFreeAccessUntil,
  buildSecurityHeaders,
  freeAccessEntitlement,
  getPaymentMethodsForPlatform,
  SAFE_DEFAULT_FLAGS,
  SERVER_PRICES
} from '../config.mjs';
import { createRequestId, logStructured } from '../logger.mjs';

/** ISO end of the launch offer while it is open, else null. Never throws. */
export async function readFreeAccessUntil(db, nowMs = Date.now()) {
  try {
    return activeFreeAccessUntil(await db.getFreeAccessUntil?.(), nowMs);
  } catch {
    return null;
  }
}

export async function handleMe({
  auth,
  platform = 'web',
  origin = null,
  db,
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  if (!auth?.userId) {
    logStructured({ level: 'warn', requestId, route: '/api/me', method: 'GET', status: 401, latencyMs: Date.now() - start, code: 'UNAUTHORIZED', sink: logSink });
    return { status: 401, headers, body: { error: 'Authentication required', code: 'UNAUTHORIZED' } };
  }

  const profile = await db.getProfile(auth.userId);
  const paid = await db.getActiveEntitlement(auth.userId);
  const freeAccessUntil = await readFreeAccessUntil(db);
  // A paid plan always wins; otherwise the launch offer (if open) grants Pro.
  const entitlement = paid?.isPro || !freeAccessUntil ? paid : freeAccessEntitlement(freeAccessUntil);
  const isAdmin = profile?.role === 'admin';
  const paymentMethods = getPaymentMethodsForPlatform(platform);

  logStructured({ level: 'info', requestId, route: '/api/me', method: 'GET', status: 200, latencyMs: Date.now() - start, sink: logSink });

  return {
    status: 200,
    headers,
    body: {
      user: {
        id: auth.userId,
        email: auth.email || null
      },
      profile: {
        role: profile?.role || 'user',
        displayName: profile?.display_name || null,
        aiOptIn: Boolean(profile?.ai_opt_in),
        aiNotesOptIn: Boolean(profile?.ai_notes_opt_in)
      },
      entitlement: {
        isPro: Boolean(entitlement?.isPro),
        plan: entitlement?.plan || 'free',
        status: entitlement?.status || 'none',
        source: entitlement?.source || 'none',
        sourceRef: entitlement?.sourceRef || null,
        includesAi: Boolean(entitlement?.includesAi),
        currentPeriodEnd: entitlement?.currentPeriodEnd || null,
        // Names the Android client reads (PlayBillingManager.fetchEntitlement).
        productId: entitlement?.plan && entitlement.plan !== 'free' ? entitlement.plan : null,
        expiresAt: entitlement?.currentPeriodEnd || null
      },
      isAdmin,
      freeAccessUntil,
      prices: SERVER_PRICES,
      paymentMethods
    }
  };
}

export async function handleFlags({ origin = null, db, logSink = null }) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = {
    ...buildSecurityHeaders({
      origin,
      cacheControl: 'public, max-age=300, stale-while-revalidate=60'
    }),
    'X-Request-Id': requestId
  };

  let flags = { ...SAFE_DEFAULT_FLAGS };
  try {
    const rows = await db.getFeatureFlags();
    if (rows && typeof rows === 'object') {
      flags = { ...SAFE_DEFAULT_FLAGS, ...rows };
    }
  } catch {
    // Fallback to safe defaults without exposing errors
  }

  const freeAccessUntil = await readFreeAccessUntil(db);

  logStructured({ level: 'info', requestId, route: '/api/flags', method: 'GET', status: 200, latencyMs: Date.now() - start, sink: logSink });
  return { status: 200, headers, body: { flags, freeAccessUntil } };
}

export async function handleHealth({ origin = null, db, logSink = null }) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  let dbReachable = false;
  try {
    dbReachable = Boolean(await db.ping());
  } catch {
    dbReachable = false;
  }

  const status = dbReachable ? 200 : 503;
  logStructured({
    level: dbReachable ? 'info' : 'error',
    requestId,
    route: '/api/health',
    method: 'GET',
    status,
    latencyMs: Date.now() - start,
    code: dbReachable ? null : 'DB_UNREACHABLE',
    sink: logSink
  });

  // Never leak Postgres, Node.js, or Next.js versions
  return {
    status,
    headers,
    body: {
      status: dbReachable ? 'ok' : 'degraded',
      database: dbReachable ? 'reachable' : 'unreachable',
      timestamp: new Date().toISOString()
    }
  };
}
