import { buildSecurityHeaders } from '../config.mjs';
import { createRequestId, logStructured } from '../logger.mjs';
import { checkRateLimit } from '../redis.mjs';
import { parseTimestampMs, validatePrepEnvelope, validateSessionRecord, validateSyncBody } from '../validators.mjs';

const PAGE_LIMIT = 500;
const FULL_REPULL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // Weekly full re-pull closes PG sequence commit-order gap

/**
 * Pure conflict rule matching Android & Web clients:
 * - Later updatedAt wins.
 * - On equal updatedAt, tombstone (deletedAt != null) wins.
 * - Identical updatedAt & deletedAt -> NO_OP (idempotent replay changes nothing).
 */
export function resolveSyncWrite(existing, incomingUpdatedMs, incomingDeletedMs) {
  if (!existing) return 'APPLY';
  const existingUpdatedMs = parseTimestampMs(existing.updatedAt ?? existing.updated_at) || 0;
  const existingDeletedMs = existing.deletedAt ?? existing.deleted_at ? parseTimestampMs(existing.deletedAt ?? existing.deleted_at) : null;

  if (incomingUpdatedMs < existingUpdatedMs) return 'IGNORE_STALE';
  if (incomingUpdatedMs === existingUpdatedMs) {
    const incomingTombstone = incomingDeletedMs !== null;
    const existingTombstone = existingDeletedMs !== null;
    if (incomingTombstone && !existingTombstone) return 'APPLY';
    return 'NO_OP';
  }
  return 'APPLY';
}

export async function handleSync({
  auth,
  body,
  ip = 'unknown',
  origin = null,
  db,
  redis,
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
      route: '/api/sync',
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

  // Per-user and per-IP rate limits in Redis
  const userRl = await checkRateLimit(redis, `sync:u:${auth.userId}`, { limit: 60, windowSec: 60 });
  const ipRl = await checkRateLimit(redis, `sync:ip:${ip}`, { limit: 120, windowSec: 60 });
  if (!userRl.allowed || !ipRl.allowed) {
    return respond(429, { error: 'Sync rate limit exceeded', code: 'RATE_LIMITED' }, 'RATE_LIMITED');
  }

  const parsed = validateSyncBody(body);
  if (!parsed.ok) {
    return respond(400, { error: parsed.error, code: 'INVALID_BODY' }, 'INVALID_BODY');
  }
  const req = parsed.value;

  const hasWrites = req.sessions.length > 0 || req.prep.length > 0 || req.preferences !== null;
  const hasPro = await db.hasPro(auth.userId);
  if (hasWrites && !hasPro) {
    return respond(403, { error: 'Tempo Pro is required to sync writes to the cloud', code: 'PRO_REQUIRED' }, 'PRO_REQUIRED');
  }

  const acceptedSessions = [];
  const rejectedSessions = [];
  const acceptedPrep = [];
  const rejectedPrep = [];

  // 1. Push sessions (per-record validation & constraint handling; idempotent on replay)
  for (const row of req.sessions) {
    const v = validateSessionRecord(row, nowMs);
    if (!v.ok) {
      rejectedSessions.push({ id: row?.id || null, table: 'sessions', code: v.code, reason: v.reason });
      continue;
    }
    const delMs = row.deletedAt ? parseTimestampMs(row.deletedAt) : null;
    try {
      const existing = await db.getUserRecord(auth.userId, 'sessions', row.id);
      const decision = resolveSyncWrite(existing, v.updatedMs, delMs);
      if (decision === 'APPLY') {
        await db.upsertUserRecord(auth.userId, 'sessions', {
          ...row,
          user_id: auth.userId,
          startedAt: new Date(v.startedMs).toISOString(),
          updatedAt: new Date(v.updatedMs).toISOString(),
          deletedAt: delMs ? new Date(delMs).toISOString() : null
        });
      }
      acceptedSessions.push({ id: row.id, table: 'sessions', updatedAt: v.updatedMs, status: decision });
    } catch (err) {
      rejectedSessions.push({
        id: row.id,
        table: 'sessions',
        code: err.code || 'CONSTRAINT_ERROR',
        reason: err.message || 'Database constraint rejected session row'
      });
    }
  }

  // 2. Push preferences (optional)
  if (req.preferences !== null && typeof req.preferences === 'object') {
    const prefUpdated = parseTimestampMs(req.preferences.updatedAt) || nowMs;
    if (prefUpdated > nowMs + 5 * 60 * 1000) {
      rejectedPrep.push({ id: auth.userId, table: 'user_state', code: 'FUTURE_TIMESTAMP', reason: 'preferences updatedAt exceeds +5 min' });
    } else {
      // Last write wins, as for every other record: a stale device must not overwrite newer settings.
      const stored = await db.getUserState(auth.userId);
      const storedMs = parseTimestampMs(stored?.updated_at ?? stored?.updatedAt) || 0;
      if (prefUpdated > storedMs) await db.upsertUserState(auth.userId, req.preferences, prefUpdated);
    }
  }

  // 3. Push prep envelopes ({ table, row }) with per-record retry/rejection on constraint errors
  for (const env of req.prep) {
    const v = validatePrepEnvelope(env, nowMs);
    if (!v.ok) {
      rejectedPrep.push({ id: env?.row?.id || null, table: env?.table || 'unknown', code: v.code, reason: v.reason });
      continue;
    }
    const row = env.row;
    const delMs = row.deletedAt ? parseTimestampMs(row.deletedAt) : null;
    try {
      const existing = await db.getUserRecord(auth.userId, env.table, row.id);
      const decision = resolveSyncWrite(existing, v.updatedMs, delMs);
      if (decision === 'APPLY') {
        await db.upsertUserRecord(auth.userId, env.table, {
          ...row,
          user_id: auth.userId,
          updatedAt: new Date(v.updatedMs).toISOString(),
          deletedAt: delMs ? new Date(delMs).toISOString() : null
        });
      }
      acceptedPrep.push({ id: row.id, table: env.table, updatedAt: v.updatedMs, status: decision });
    } catch (err) {
      rejectedPrep.push({
        id: row.id,
        table: env.table,
        code: err.code || 'CONSTRAINT_ERROR',
        reason: err.message || 'Constraint violation on prep row'
      });
    }
  }

  // 4. Record device sync diagnostics & check whether periodic full re-pull is recommended
  let suggestResetCursor = false;
  if (req.deviceId) {
    const prevDevice = await db.getSyncDevice(auth.userId, req.deviceId);
    if (prevDevice && !req.resetCursor && req.cursor > 0 && nowMs - prevDevice.lastFullPullAt > FULL_REPULL_INTERVAL_MS) {
      suggestResetCursor = true;
    }
    await db.upsertSyncDevice(auth.userId, {
      deviceId: req.deviceId,
      platform: req.clientPlatform,
      appVersion: req.appVersion,
      lastSyncAt: nowMs,
      lastFullPullAt: req.resetCursor || req.cursor === 0 ? nowMs : (prevDevice?.lastFullPullAt || nowMs)
    });
  }

  // 5. Pull sessions & prep pages (max 500 per page with `more` flag)
  const effectiveCursor = req.resetCursor ? 0 : req.cursor;
  const effectivePrepCursor = req.resetCursor ? 0 : req.prepCursor;

  const pulledSessions = await db.pullSessions(auth.userId, effectiveCursor, PAGE_LIMIT + 1);
  const sessionsMore = pulledSessions.length > PAGE_LIMIT;
  const sessionPage = sessionsMore ? pulledSessions.slice(0, PAGE_LIMIT) : pulledSessions;
  const nextCursor = sessionPage.length > 0
    ? Math.max(effectiveCursor, ...sessionPage.map(r => Number(r.rev || 0)))
    : effectiveCursor;

  const pulledPrep = await db.pullPrepEnvelopes(auth.userId, effectivePrepCursor, PAGE_LIMIT + 1);
  const prepMore = pulledPrep.length > PAGE_LIMIT;
  const prepPage = prepMore ? pulledPrep.slice(0, PAGE_LIMIT) : pulledPrep;
  const nextPrepCursor = prepPage.length > 0
    ? Math.max(effectivePrepCursor, ...prepPage.map(e => Number(e.row?.rev || 0)))
    : effectivePrepCursor;

  const userState = await db.getUserState(auth.userId);

  return respond(200, {
    cursor: nextCursor,
    sessionsCursor: String(nextCursor), // Android reads this name
    prepCursor: nextPrepCursor,
    more: sessionsMore || prepMore,
    resetCursor: suggestResetCursor,
    sessions: sessionPage,
    preferences: userState?.preferences || null,
    prep: prepPage,
    accepted: [...acceptedSessions, ...acceptedPrep],
    rejected: [...rejectedSessions, ...rejectedPrep],
    rejectedSessions,
    rejectedPrep
  });
}
