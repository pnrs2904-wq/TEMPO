import crypto from 'node:crypto';

const FORBIDDEN_LOG_KEYS = new Set([
  'note', 'notes', 'email', 'password', 'token', 'access_token', 'refresh_token',
  'authorization', 'purchasetoken', 'purchase_token', 'apikey', 'api_key',
  'x-goog-api-key', 'secret', 'key', 'private_key', 'signature', 'razorpay_signature'
]);

export function createRequestId() {
  return crypto.randomUUID();
}

export function scrubForLogging(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrubForLogging);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_LOG_KEYS.has(k.toLowerCase())) {
      out[k] = '[SCRUBBED]';
    } else if (v && typeof v === 'object') {
      out[k] = scrubForLogging(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function logStructured({
  level = 'info',
  requestId,
  route,
  method = 'POST',
  status,
  latencyMs,
  code = null,
  meta = null,
  sink = null
}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    requestId: requestId || 'unknown',
    route,
    method,
    status,
    latencyMs
  };
  if (code) entry.code = code;
  if (meta) entry.meta = scrubForLogging(meta);

  const line = JSON.stringify(entry);
  if (typeof sink === 'function') {
    sink(line, entry);
  } else if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
  return entry;
}
