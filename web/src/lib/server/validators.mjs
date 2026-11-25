/**
 * Strict request body validators (zero external dependencies so Node 22 tests run natively,
 * matching Zod schemas in schemas.ts for Next.js production builds).
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000; // +5 minutes max clock skew

export const ALLOWED_PREP_TABLES = new Set([
  'user_exam_plans',
  'user_topic_progress',
  'revision_events',
  'mock_tests',
  'question_attempts'
]);

export function assertStrictKeys(obj, allowedKeys, label = 'body') {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return `${label} must be a JSON object`;
  }
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return `Unexpected field "${key}" in ${label}`;
    }
  }
  return null;
}

export function parseTimestampMs(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function isFutureTimestamp(tsMs, nowMs = Date.now()) {
  return tsMs > nowMs + FUTURE_TOLERANCE_MS;
}

const SYNC_TOP_KEYS = new Set([
  'cursor', 'sessionsCursor', 'prepCursor', 'sessions', 'preferences', 'prep',
  'clientPlatform', 'appVersion', 'deviceId', 'resetCursor'
]);

export function validateSyncBody(body) {
  const keyErr = assertStrictKeys(body, SYNC_TOP_KEYS, 'sync request');
  if (keyErr) return { ok: false, error: keyErr };

  // Android sends the sessions cursor as `sessionsCursor` (a string); the web sends `cursor`.
  const rawCursor = body.cursor ?? body.sessionsCursor;
  const cursor = rawCursor === undefined || rawCursor === null || rawCursor === '' ? 0 : Number(rawCursor);
  const prepCursor = body.prepCursor === undefined || body.prepCursor === null || body.prepCursor === '' ? 0 : Number(body.prepCursor);
  if (!Number.isInteger(cursor) || cursor < 0) return { ok: false, error: 'cursor must be a non-negative integer' };
  if (!Number.isInteger(prepCursor) || prepCursor < 0) return { ok: false, error: 'prepCursor must be a non-negative integer' };

  const sessions = body.sessions ?? [];
  if (!Array.isArray(sessions) || sessions.length > 500) {
    return { ok: false, error: 'sessions must be an array of at most 500 records' };
  }
  const prep = body.prep ?? [];
  if (!Array.isArray(prep) || prep.length > 500) {
    return { ok: false, error: 'prep must be an array of at most 500 envelopes' };
  }

  const clientPlatform = body.clientPlatform ?? 'web';
  if (!['android', 'web', 'ios', 'other'].includes(clientPlatform)) {
    return { ok: false, error: 'clientPlatform must be android, web, ios, or other' };
  }
  const appVersion = body.appVersion ?? '4.0.0';
  if (typeof appVersion !== 'string' || appVersion.length === 0 || appVersion.length > 32) {
    return { ok: false, error: 'appVersion must be 1..32 characters' };
  }

  return {
    ok: true,
    value: {
      cursor,
      prepCursor,
      sessions,
      preferences: body.preferences ?? null,
      prep,
      clientPlatform,
      appVersion,
      deviceId: typeof body.deviceId === 'string' ? body.deviceId.slice(0, 128) : null,
      resetCursor: Boolean(body.resetCursor)
    }
  };
}

export function validateSessionRecord(row, nowMs = Date.now()) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { ok: false, code: 'INVALID_ROW', reason: 'Session row must be an object' };
  }
  if (typeof row.id !== 'string' || !UUID_RE.test(row.id)) {
    return { ok: false, code: 'INVALID_ID', reason: 'Session id must be a valid UUID' };
  }
  const startedMs = parseTimestampMs(row.startedAt ?? row.timestamp);
  const updatedMs = parseTimestampMs(row.updatedAt);
  if (!startedMs || !updatedMs) {
    return { ok: false, code: 'INVALID_TIMESTAMP', reason: 'startedAt and updatedAt are required' };
  }
  if (isFutureTimestamp(startedMs, nowMs) || isFutureTimestamp(updatedMs, nowMs)) {
    return { ok: false, code: 'FUTURE_TIMESTAMP', reason: 'Timestamp exceeds +5 minute future clock skew limit' };
  }
  if (row.deletedAt !== undefined && row.deletedAt !== null) {
    const delMs = parseTimestampMs(row.deletedAt);
    if (!delMs || isFutureTimestamp(delMs, nowMs)) {
      return { ok: false, code: 'FUTURE_TIMESTAMP', reason: 'deletedAt is invalid or exceeds +5 minute skew' };
    }
  }
  if (!['focus', 'break'].includes(row.phase)) {
    return { ok: false, code: 'INVALID_PHASE', reason: 'phase must be focus or break' };
  }
  if (!Number.isInteger(row.energy) || row.energy < 1 || row.energy > 5) {
    return { ok: false, code: 'INVALID_ENERGY', reason: 'energy must be integer 1..5' };
  }
  if (typeof row.subject !== 'string' || row.subject.length > 60) {
    return { ok: false, code: 'INVALID_SUBJECT', reason: 'subject must be a string <= 60 chars' };
  }
  if (!Number.isInteger(row.plannedMinutes) || row.plannedMinutes < 1 || row.plannedMinutes > 360) {
    return { ok: false, code: 'INVALID_PLANNED_MINUTES', reason: 'plannedMinutes must be integer 1..360' };
  }
  if (!Number.isInteger(row.actualSeconds) || row.actualSeconds < 0 || row.actualSeconds > 86400) {
    return { ok: false, code: 'INVALID_ACTUAL_SECONDS', reason: 'actualSeconds must be integer 0..86400' };
  }
  if (row.notes !== undefined && row.notes !== null && (typeof row.notes !== 'string' || row.notes.length > 240)) {
    return { ok: false, code: 'INVALID_NOTES', reason: 'notes must be <= 240 chars' };
  }
  return { ok: true, updatedMs, startedMs };
}

export function validatePrepEnvelope(env, nowMs = Date.now()) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return { ok: false, code: 'INVALID_ENVELOPE', reason: 'Prep item must be { table, row }' };
  }
  if (!ALLOWED_PREP_TABLES.has(env.table)) {
    return { ok: false, code: 'INVALID_TABLE', reason: `Unsupported prep table "${env.table}"` };
  }
  const row = env.row;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { ok: false, code: 'INVALID_ROW', reason: 'Prep row must be an object' };
  }
  if (typeof row.id !== 'string' || !UUID_RE.test(row.id)) {
    return { ok: false, code: 'INVALID_ID', reason: 'Prep row id must be a valid UUID' };
  }
  const updatedMs = parseTimestampMs(row.updatedAt);
  if (!updatedMs) {
    return { ok: false, code: 'INVALID_TIMESTAMP', reason: 'Prep row updatedAt is required' };
  }
  if (isFutureTimestamp(updatedMs, nowMs)) {
    return { ok: false, code: 'FUTURE_TIMESTAMP', reason: 'Prep updatedAt exceeds +5 minute future clock skew limit' };
  }
  if (env.table === 'mock_tests') {
    const total = Number(row.totalQuestions ?? 0);
    const attempted = Number(row.attemptedQuestions ?? 0);
    const correct = Number(row.correctAnswers ?? 0);
    const incorrect = Number(row.incorrectAnswers ?? 0);
    const unanswered = Number(row.unansweredQuestions ?? 0);
    const score = Number(row.totalScore ?? 0);
    const maxMarks = Number(row.maxMarks ?? 0);
    if (maxMarks <= 0 || score > maxMarks) {
      return { ok: false, code: 'CONSTRAINT_ERROR', reason: 'totalScore must be <= maxMarks and maxMarks > 0' };
    }
    if (attempted !== correct + incorrect || attempted + unanswered !== total) {
      return { ok: false, code: 'CONSTRAINT_ERROR', reason: 'Mock test question counts do not add up' };
    }
  }
  return { ok: true, updatedMs };
}

export function validatePlayVerifyBody(body) {
  const err = assertStrictKeys(body, new Set(['productId', 'purchaseToken', 'orderId', 'packageName']), 'play verify');
  if (err) return { ok: false, error: err };
  if (!['pro_monthly', 'pro_annual', 'lifetime'].includes(body.productId)) {
    return { ok: false, error: 'Invalid productId' };
  }
  if (typeof body.purchaseToken !== 'string' || body.purchaseToken.trim().length < 8 || body.purchaseToken.length > 512) {
    return { ok: false, error: 'Invalid purchaseToken' };
  }
  return {
    ok: true,
    value: {
      productId: body.productId,
      purchaseToken: body.purchaseToken.trim(),
      orderId: typeof body.orderId === 'string' ? body.orderId.trim() : null
    }
  };
}

export function validateReflectionBody(body) {
  const err = assertStrictKeys(body, new Set(['sessions', 'includeNotes']), 'reflection request');
  if (err) return { ok: false, error: err };
  if (!Array.isArray(body.sessions) || body.sessions.length < 1 || body.sessions.length > 5) {
    return { ok: false, error: 'sessions must contain 1..5 items' };
  }
  for (let i = 0; i < body.sessions.length; i++) {
    const s = body.sessions[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return { ok: false, error: `Invalid session at ${i}` };
    if (typeof s.subject !== 'string' || s.subject.trim().length === 0 || s.subject.length > 60) {
      return { ok: false, error: `Invalid subject at ${i}` };
    }
    if (!Number.isInteger(s.energy) || s.energy < 1 || s.energy > 5) {
      return { ok: false, error: `Invalid energy at ${i}` };
    }
    if (!Number.isInteger(s.plannedMinutes) || s.plannedMinutes < 5 || s.plannedMinutes > 180) {
      return { ok: false, error: `Invalid plannedMinutes at ${i}` };
    }
    if (s.note !== undefined && s.note !== null && (typeof s.note !== 'string' || s.note.length > 300)) {
      return { ok: false, error: `Invalid note at ${i}` };
    }
  }
  return {
    ok: true,
    value: {
      sessions: body.sessions,
      includeNotes: Boolean(body.includeNotes)
    }
  };
}
