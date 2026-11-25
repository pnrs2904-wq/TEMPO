import { buildSecurityHeaders } from '../config.mjs';
import { createRequestId, logStructured } from '../logger.mjs';
import { assertStrictKeys } from '../validators.mjs';

function checkAdminMfa(auth, profile) {
  if (!auth?.userId) return { ok: false, status: 401, code: 'UNAUTHORIZED', error: 'Authentication required' };
  if (profile?.role !== 'admin') return { ok: false, status: 403, code: 'ADMIN_REQUIRED', error: 'Admin role required' };
  if (auth.aal !== 'aal2') return { ok: false, status: 403, code: 'MFA_REQUIRED', error: 'Admin MFA (aal2) is required' };
  return { ok: true };
}

export async function handleAdminMetrics({ auth, days = 30, origin = null, db, logSink = null }) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  const profile = auth?.userId ? await db.getProfile(auth.userId) : null;
  const gate = checkAdminMfa(auth, profile);
  if (!gate.ok) {
    logStructured({ level: 'warn', requestId, route: '/api/admin/metrics', method: 'GET', status: gate.status, latencyMs: Date.now() - start, code: gate.code, sink: logSink });
    return { status: gate.status, headers, body: { error: gate.error, code: gate.code } };
  }

  const clampedDays = Math.max(1, Math.min(365, Number.parseInt(String(days), 10) || 30));
  const metrics = await db.rpcAdminMetrics(auth.userId, auth.aal, clampedDays);
  logStructured({ level: 'info', requestId, route: '/api/admin/metrics', method: 'GET', status: 200, latencyMs: Date.now() - start, sink: logSink });
  return { status: 200, headers, body: { metrics } };
}

export async function handleAdminSetFlag({ auth, body, origin = null, db, logSink = null }) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  const profile = auth?.userId ? await db.getProfile(auth.userId) : null;
  const gate = checkAdminMfa(auth, profile);
  if (!gate.ok) {
    logStructured({ level: 'warn', requestId, route: '/api/admin/flags', method: 'POST', status: gate.status, latencyMs: Date.now() - start, code: gate.code, sink: logSink });
    return { status: gate.status, headers, body: { error: gate.error, code: gate.code } };
  }

  const keyErr = assertStrictKeys(body, new Set(['key', 'enabled', 'reason']), 'set feature flag');
  if (keyErr || typeof body.key !== 'string' || typeof body.enabled !== 'boolean') {
    return { status: 400, headers, body: { error: keyErr || 'Invalid flag payload', code: 'INVALID_BODY' } };
  }

  const updated = await db.rpcSetFeatureFlag(auth.userId, auth.aal, body.key, body.enabled, String(body.reason || '').slice(0, 200));
  logStructured({ level: 'info', requestId, route: '/api/admin/flags', method: 'POST', status: 200, latencyMs: Date.now() - start, sink: logSink });
  return { status: 200, headers, body: { flag: updated } };
}

export async function handleAdminAuditLogs({ auth, limit = 50, origin = null, db, logSink = null }) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  const profile = auth?.userId ? await db.getProfile(auth.userId) : null;
  const gate = checkAdminMfa(auth, profile);
  if (!gate.ok) {
    logStructured({ level: 'warn', requestId, route: '/api/admin/audit', method: 'GET', status: gate.status, latencyMs: Date.now() - start, code: gate.code, sink: logSink });
    return { status: gate.status, headers, body: { error: gate.error, code: gate.code } };
  }

  const logs = await db.listAdminAuditLogs(auth.userId, auth.aal, Math.max(1, Math.min(200, Number(limit) || 50)));
  logStructured({ level: 'info', requestId, route: '/api/admin/audit', method: 'GET', status: 200, latencyMs: Date.now() - start, sink: logSink });
  return { status: 200, headers, body: { logs } };
}
