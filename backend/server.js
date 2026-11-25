/**
 * Tempo 4.0 Signed-Out Android Reflection Service (Cloud Run, min-instances=0)
 *
 * Zero-dependency Node.js (>=20) HTTPS proxy for signed-out Android reflections.
 * - Architecture: Tempo Android -> HTTPS (Cloud Run) -> Gemini API (x-goog-api-key header)
 * - Distributed abuse controls via Upstash Redis REST (with in-memory fallback for dev/tests):
 *   - Sliding-window rate limiting per installation ID and per client IP
 *   - Single-use X-Request-Nonce replay cache (5-minute TTL)
 *   - Global daily/hourly AI spend circuit breaker
 * - Google Play Integrity API server-side verification:
 *   - Service-account RS256 OAuth2 JWT assertion + cached access token
 *   - Package name match (com.tempo.focus)
 *   - Nonce binding check
 *   - Token timestampMillis freshness check (within +/- 5 minutes)
 *   - Configurable device policy (PLAY_INTEGRITY_DEVICE_POLICY = basic | device | strong; default device)
 *   - Optional licensing check (PLAY_INTEGRITY_REQUIRE_LICENSED=true -> LICENSED)
 * - Strict security headers, 16KB body cap, strict JSON validation, PII redaction,
 *   and structured JSON logs with requestId (never logs notes, emails, tokens, or keys).
 */

'use strict';

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 8080;
const EXPECTED_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.tempo.focus';
const MAX_BODY_BYTES = 16 * 1024; // 16 KB
const RATE_LIMIT_WINDOW_SEC = 10 * 60; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 10;
const REPLAY_TTL_SEC = 5 * 60; // 5 minutes
const TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // +/- 5 minutes

function getGeminiApiKey() {
  return (process.env.GEMINI_API_KEY || '').trim();
}

function getGeminiModel() {
  return (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
}

function getDevicePolicy() {
  const raw = (process.env.PLAY_INTEGRITY_DEVICE_POLICY || 'device').trim().toLowerCase();
  if (raw === 'basic' || raw === 'device' || raw === 'strong') return raw;
  return 'device';
}

function getGlobalBudgetLimit() {
  if (process.env.GLOBAL_MAX_REQUESTS_PER_HOUR) {
    const n = Number(process.env.GLOBAL_MAX_REQUESTS_PER_HOUR);
    if (Number.isFinite(n) && n > 0) return { limit: n, windowSec: 3600, label: 'hour' };
  }
  const daily = Number(process.env.GLOBAL_AI_DAILY_LIMIT || process.env.GLOBAL_MAX_REQUESTS_PER_DAY) || 5000;
  return { limit: daily, windowSec: 86400, label: 'day' };
}

// ---------------------------------------------------------
// Structured JSON Logger (PII & secret safe)
// ---------------------------------------------------------
const LOG_SILENT = process.env.TEMPO_SILENT_LOGS === 'true';

function logJson(level, event, fields = {}) {
  if (LOG_SILENT) return;
  const safe = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields
  };
  const line = JSON.stringify(safe);
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

// ---------------------------------------------------------
// Distributed Store Adapter (Upstash Redis REST + In-Memory)
// ---------------------------------------------------------
class MemoryStore {
  constructor() {
    this.counters = new Map(); // key -> { count, expiresAt }
    this.nonces = new Map(); // key -> expiresAt
  }

  async incrWithTtl(key, ttlSec) {
    const now = Date.now();
    const existing = this.counters.get(key);
    if (!existing || existing.expiresAt <= now) {
      const next = { count: 1, expiresAt: now + ttlSec * 1000 };
      this.counters.set(key, next);
      this._prune(now);
      return { count: 1, ttlSec };
    }
    existing.count += 1;
    return { count: existing.count, ttlSec: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)) };
  }

  async setNxEx(key, ttlSec) {
    const now = Date.now();
    const expiresAt = this.nonces.get(key);
    if (expiresAt && expiresAt > now) {
      return false;
    }
    this.nonces.set(key, now + ttlSec * 1000);
    if (this.nonces.size > 5000) {
      for (const [k, exp] of this.nonces.entries()) {
        if (exp <= now) this.nonces.delete(k);
      }
    }
    return true;
  }

  reset() {
    this.counters.clear();
    this.nonces.clear();
  }

  _prune(now) {
    if (this.counters.size > 10000) {
      for (const [k, v] of this.counters.entries()) {
        if (v.expiresAt <= now) this.counters.delete(k);
      }
    }
  }
}

class UpstashRedisStore {
  constructor(url, token) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
  }

  async _cmd(args) {
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    });
    if (!res.ok) {
      throw new Error(`Upstash Redis HTTP ${res.status}`);
    }
    return res.json();
  }

  async incrWithTtl(key, ttlSec) {
    const out = await this._cmd([
      ['INCR', key],
      ['EXPIRE', key, String(ttlSec), 'NX'],
      ['TTL', key]
    ]);
    const count = Number(out?.[0]?.result ?? 1);
    const remaining = Number(out?.[2]?.result ?? ttlSec);
    return { count, ttlSec: remaining > 0 ? remaining : ttlSec };
  }

  async setNxEx(key, ttlSec) {
    const out = await this._cmd([
      ['SET', key, '1', 'EX', String(ttlSec), 'NX']
    ]);
    return out?.[0]?.result === 'OK';
  }
}

const defaultMemoryStore = new MemoryStore();
let activeStoreOverride = null;

function getStore() {
  if (activeStoreOverride) return activeStoreOverride;
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (url && token) {
    return new UpstashRedisStore(url, token);
  }
  return defaultMemoryStore;
}

function setStoreForTesting(store) {
  activeStoreOverride = store;
}

function resetRateLimits() {
  defaultMemoryStore.counters.clear();
}

function resetReplayCache() {
  defaultMemoryStore.nonces.clear();
}

async function isRateLimited(key) {
  const { count } = await getStore().incrWithTtl(`rl:${key}`, RATE_LIMIT_WINDOW_SEC);
  return count > MAX_REQUESTS_PER_WINDOW;
}

async function isGlobalBudgetExceeded() {
  const { limit, windowSec, label } = getGlobalBudgetLimit();
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const { count } = await getStore().incrWithTtl(`budget:${label}:${bucket}`, windowSec);
  return count > limit;
}

async function checkAndRecordNonce(nonce) {
  if (!nonce || typeof nonce !== 'string') {
    return { valid: false, code: 'MISSING_NONCE', error: 'Missing X-Request-Nonce header' };
  }
  const cleanNonce = nonce.trim();
  if (cleanNonce.length < 8 || cleanNonce.length > 128) {
    return { valid: false, code: 'INVALID_NONCE', error: 'Nonce must be between 8 and 128 characters' };
  }
  const inserted = await getStore().setNxEx(`nonce:${cleanNonce}`, REPLAY_TTL_SEC);
  if (!inserted) {
    return { valid: false, code: 'REPLAY_DETECTED', error: 'Duplicate request nonce detected (replay protection)' };
  }
  return { valid: true };
}

// ---------------------------------------------------------
// Google Service Account RS256 OAuth2 Token Helper
// ---------------------------------------------------------
let cachedOAuthToken = null; // { accessToken, expiresAt }

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createServiceAccountJwt(serviceAccount, scope, nowSec = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'RS256', typ: 'JWT' };
  if (serviceAccount.private_key_id) {
    header.kid = serviceAccount.private_key_id;
  }
  const claimSet = {
    iss: serviceAccount.client_email,
    scope,
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getGooglePlayAccessToken(scope = 'https://www.googleapis.com/auth/playintegrity') {
  const staticToken = (process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN || '').trim();
  if (staticToken) {
    return staticToken;
  }

  const rawJson = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!rawJson) {
    return null;
  }

  const now = Date.now();
  if (cachedOAuthToken && cachedOAuthToken.expiresAt > now + 60_000) {
    return cachedOAuthToken.accessToken;
  }

  let sa;
  try {
    sa = JSON.parse(rawJson);
  } catch {
    throw new Error('INVALID_SERVICE_ACCOUNT_JSON');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('INCOMPLETE_SERVICE_ACCOUNT_JSON');
  }

  const assertion = createServiceAccountJwt(sa, scope);
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const formBody = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  }).toString();

  const res = await makeHttpsPostRequest(
    tokenUri,
    formBody,
    { 'Content-Type': 'application/x-www-form-urlencoded' },
    5000
  );
  if (res.status !== 200) {
    throw new Error(`OAUTH_TOKEN_HTTP_${res.status}`);
  }
  const parsed = JSON.parse(res.body);
  if (!parsed.access_token) {
    throw new Error('OAUTH_MISSING_ACCESS_TOKEN');
  }
  cachedOAuthToken = {
    accessToken: parsed.access_token,
    expiresAt: now + (Number(parsed.expires_in) || 3600) * 1000
  };
  return cachedOAuthToken.accessToken;
}

// ---------------------------------------------------------
// Google Play Integrity API Verification
// ---------------------------------------------------------
let customPlayIntegrityVerifier = null;

function setPlayIntegrityVerifierForTesting(verifierFn) {
  customPlayIntegrityVerifier = verifierFn;
}

/**
 * Evaluates a decoded Play Integrity tokenPayloadExternal against Tempo 4.0 security policy:
 *  1. requestDetails.requestPackageName === expectedPackageName
 *  2. requestDetails.nonce (or requestHash) matches expectedNonce when provided
 *  3. requestDetails.timestampMillis is within +/- 5 minutes of nowMs
 *  4. appIntegrity.appRecognitionVerdict === 'PLAY_RECOGNIZED'
 *  5. deviceIntegrity.deviceRecognitionVerdict satisfies policy ('basic' | 'device' | 'strong')
 *  6. Optional: if requireLicensed === true, accountDetails.appLicensingVerdict === 'LICENSED'
 */
function evaluateIntegrityPayload(payload, expectedPackageName, expectedNonce, options = {}) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'MALFORMED_PAYLOAD' };
  }

  const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now();
  const devicePolicy = (options.devicePolicy || getDevicePolicy()).toLowerCase();
  const requireLicensed = options.requireLicensed !== undefined
    ? Boolean(options.requireLicensed)
    : process.env.PLAY_INTEGRITY_REQUIRE_LICENSED === 'true';

  const details = payload.requestDetails || {};
  if (details.requestPackageName !== expectedPackageName) {
    return {
      valid: false,
      reason: `PACKAGE_MISMATCH: expected ${expectedPackageName}, got ${details.requestPackageName || 'unknown'}`
    };
  }

  // Nonce / requestHash binding
  const tokenNonce = details.nonce || details.requestHash;
  if (expectedNonce) {
    if (!tokenNonce || tokenNonce !== expectedNonce) {
      return { valid: false, reason: 'NONCE_MISMATCH' };
    }
  }

  // Freshness check: timestampMillis within +/- 5 minutes
  const tsRaw = details.timestampMillis;
  const tsMs = typeof tsRaw === 'number' ? tsRaw : Number(tsRaw);
  if (!Number.isFinite(tsMs) || tsMs <= 0) {
    return { valid: false, reason: 'MISSING_OR_INVALID_TOKEN_TIMESTAMP' };
  }
  if (Math.abs(nowMs - tsMs) > TIMESTAMP_DRIFT_MS) {
    return { valid: false, reason: 'STALE_INTEGRITY_TOKEN' };
  }

  const appVerdict = payload.appIntegrity?.appRecognitionVerdict;
  if (appVerdict !== 'PLAY_RECOGNIZED') {
    return {
      valid: false,
      reason: `UNRECOGNIZED_APP: verdict is ${appVerdict || 'UNKNOWN'}`
    };
  }

  const deviceVerdicts = Array.isArray(payload.deviceIntegrity?.deviceRecognitionVerdict)
    ? payload.deviceIntegrity.deviceRecognitionVerdict
    : [];

  let meetsDevicePolicy = false;
  if (devicePolicy === 'strong') {
    meetsDevicePolicy = deviceVerdicts.includes('MEETS_STRONG_INTEGRITY');
  } else if (devicePolicy === 'basic') {
    meetsDevicePolicy =
      deviceVerdicts.includes('MEETS_BASIC_INTEGRITY') ||
      deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY') ||
      deviceVerdicts.includes('MEETS_STRONG_INTEGRITY');
  } else {
    // Default 'device': requires MEETS_DEVICE_INTEGRITY or MEETS_STRONG_INTEGRITY
    meetsDevicePolicy =
      deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY') ||
      deviceVerdicts.includes('MEETS_STRONG_INTEGRITY');
  }

  if (!meetsDevicePolicy) {
    return {
      valid: false,
      reason: `DEVICE_INTEGRITY_FAILED: policy=${devicePolicy} verdicts=${JSON.stringify(deviceVerdicts)}`
    };
  }

  if (requireLicensed) {
    const licensing = payload.accountDetails?.appLicensingVerdict;
    if (licensing !== 'LICENSED') {
      return {
        valid: false,
        reason: `APP_NOT_LICENSED: verdict is ${licensing || 'UNKNOWN'}`
      };
    }
  }

  return { valid: true };
}

async function verifyPlayIntegrity(token, expectedNonce, reqId) {
  if (process.env.PLAY_INTEGRITY_ENABLED !== 'true') {
    return { valid: true };
  }

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    logJson('warn', 'integrity_missing_token', { requestId: reqId });
    return { valid: false, reason: 'MISSING_PLAY_INTEGRITY_TOKEN' };
  }

  const cleanToken = token.trim();
  if (customPlayIntegrityVerifier) {
    return customPlayIntegrityVerifier(cleanToken, expectedNonce, reqId);
  }

  let accessToken;
  try {
    accessToken = await getGooglePlayAccessToken();
  } catch (err) {
    logJson('error', 'integrity_oauth_error', { requestId: reqId, code: err.message });
    return { valid: false, reason: 'INTEGRITY_OAUTH_FAILED' };
  }

  if (!accessToken) {
    logJson('error', 'integrity_unconfigured', { requestId: reqId });
    return { valid: false, reason: 'INTEGRITY_SERVICE_UNCONFIGURED' };
  }

  try {
    const decodeUrl = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(EXPECTED_PACKAGE_NAME)}:decodeIntegrityToken`;
    const decodePayload = JSON.stringify({ integrityToken: cleanToken });

    const decodeRes = await makeHttpsPostRequest(
      decodeUrl,
      decodePayload,
      {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      5000
    );

    if (decodeRes.status !== 200) {
      logJson('warn', 'integrity_decode_failed', { requestId: reqId, status: decodeRes.status });
      return { valid: false, reason: `DECODE_HTTP_${decodeRes.status}` };
    }

    const json = JSON.parse(decodeRes.body);
    const payload = json.tokenPayloadExternal || json;
    return evaluateIntegrityPayload(payload, EXPECTED_PACKAGE_NAME, expectedNonce);
  } catch (err) {
    logJson('error', 'integrity_network_error', { requestId: reqId, message: err.message });
    return { valid: false, reason: 'DECODE_NETWORK_ERROR' };
  }
}

// ---------------------------------------------------------
// HTTPS Helper & Gemini Client (x-goog-api-key header only)
// ---------------------------------------------------------
function makeHttpsPostRequest(urlStr, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: timeoutMs
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

let customGeminiCaller = null;

function setGeminiCallerForTesting(fn) {
  customGeminiCaller = fn;
}

async function callGeminiWithTimeout(model, apiKey, payload, timeoutMs) {
  // CRITICAL: API key MUST travel in the x-goog-api-key header, NEVER in the query string.
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  };

  if (customGeminiCaller) {
    return customGeminiCaller({ url: geminiUrl, headers, payload, timeoutMs });
  }

  const res = await makeHttpsPostRequest(geminiUrl, payload, headers, timeoutMs);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Gemini API returned HTTP ${res.status}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new Error('Malformed response JSON from Gemini');
  }
  const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (text && text.length >= 5 && text.length <= 500) {
    return text;
  }
  if (text) {
    return text.slice(0, 300);
  }
  throw new Error('Empty response from Gemini');
}

// ---------------------------------------------------------
// Sensitive Content Redaction (Data Minimization)
// ---------------------------------------------------------
const SENSITIVE_PATTERN_STR =
  '(AIza[0-9A-Za-z-_]{30,45}|sk-[a-zA-Z0-9]{20,}|password[\\s=:]+[^\\s]+|api[_-]?key[\\s=:]+[^\\s]+|bearer[\\s=:]+[^\\s]+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+|(?:\\+?91[\\s-]?)?[6-9]\\d{9})';

function sanitizeText(text) {
  if (!text) return '';
  const regex = new RegExp(SENSITIVE_PATTERN_STR, 'gi');
  return String(text).replace(regex, '[REDACTED]');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERAL_UUID_REGEX = /^[0-9a-fA-F-]{32,36}$/;

// ---------------------------------------------------------
// HTTP Utilities & Security Headers
// ---------------------------------------------------------
function applySecurityHeaders(res, requestId) {
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
}

function sendJson(res, status, body, meta = {}) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
  if (meta.requestId && meta.route) {
    logJson(status >= 500 ? 'error' : 'info', 'http_response', {
      requestId: meta.requestId,
      route: meta.route,
      status,
      latencyMs: meta.startTime ? Date.now() - meta.startTime : 0
    });
  }
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        settled = true;
        reject({ status: 413, code: 'PAYLOAD_TOO_LARGE', error: 'Payload exceeds 16KB limit' });
        req.resume();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        return reject({ status: 400, code: 'INVALID_JSON', error: 'Malformed JSON payload' });
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject({ status: 400, code: 'INVALID_JSON', error: 'Malformed JSON payload' });
      }
    });

    req.on('error', () => {
      if (settled) return;
      settled = true;
      reject({ status: 400, code: 'INVALID_JSON', error: 'Unable to read request body' });
    });
  });
}

function getClientIp(req) {
  // Single trusted reverse proxy (Google Cloud Run) appends the real client IP
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim().length > 0) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

// ---------------------------------------------------------
// Request Handler (compatible with http.createServer(app))
// ---------------------------------------------------------
async function app(req, res) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  applySecurityHeaders(res, requestId);

  const method = (req.method || 'GET').toUpperCase();
  const urlObj = new URL(req.url || '/', 'http://localhost');
  const pathname = urlObj.pathname;
  const meta = { requestId, route: `${method} ${pathname}`, startTime };

  if (method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() }, meta);
  }

  if (method === 'POST' && pathname === '/api/v1/reflections') {
    return handleReflections(req, res, requestId, meta);
  }

  return sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' }, meta);
}

async function handleReflections(req, res, requestId, meta) {
  // 1. Content-Type verification
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return sendJson(res, 400, {
      error: 'Content-Type must be application/json',
      code: 'INVALID_CONTENT_TYPE'
    }, meta);
  }

  // 2. Parse JSON body with 16KB cap early so oversized/malformed bodies fail fast
  let body;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (err) {
    return sendJson(res, err.status || 400, {
      error: err.error || 'Malformed JSON payload',
      code: err.code || 'INVALID_JSON'
    }, meta);
  }

  // 3. Anonymous Installation Identifier verification
  const rawInstallationId = req.headers['x-installation-id'];
  if (!rawInstallationId || typeof rawInstallationId !== 'string') {
    return sendJson(res, 400, {
      error: 'Missing X-Installation-Id header',
      code: 'MISSING_INSTALLATION_ID'
    }, meta);
  }

  const trimmedInstallationId = rawInstallationId.trim();
  if (!UUID_REGEX.test(trimmedInstallationId) && !GENERAL_UUID_REGEX.test(trimmedInstallationId)) {
    return sendJson(res, 400, {
      error: 'Invalid anonymous installation identifier format',
      code: 'INVALID_INSTALLATION_ID'
    }, meta);
  }

  // 4. Request Timestamp freshness verification (within +/- 5 minutes)
  const rawTimestamp = req.headers['x-request-timestamp'];
  if (!rawTimestamp || typeof rawTimestamp !== 'string') {
    return sendJson(res, 400, {
      error: 'Missing X-Request-Timestamp header',
      code: 'MISSING_TIMESTAMP'
    }, meta);
  }

  const requestTimestamp = Number(rawTimestamp);
  if (!Number.isFinite(requestTimestamp) || requestTimestamp <= 0) {
    return sendJson(res, 400, {
      error: 'Invalid numeric request timestamp',
      code: 'INVALID_TIMESTAMP'
    }, meta);
  }

  if (Math.abs(Date.now() - requestTimestamp) > TIMESTAMP_DRIFT_MS) {
    return sendJson(res, 400, {
      error: 'Request timestamp is outside the allowable ±5 minute window',
      code: 'TIMESTAMP_OUT_OF_BOUNDS'
    }, meta);
  }

  // 5. Replay Protection: Single-use nonce check
  const rawNonce = req.headers['x-request-nonce'];
  const nonceCheck = await checkAndRecordNonce(rawNonce);
  if (!nonceCheck.valid) {
    const statusCode = nonceCheck.code === 'REPLAY_DETECTED' ? 409 : 400;
    return sendJson(res, statusCode, {
      error: nonceCheck.error,
      code: nonceCheck.code
    }, meta);
  }

  // 6. Abuse Protection: Multi-layer distributed rate limiting
  const clientIp = getClientIp(req);
  const installKey = `install:${trimmedInstallationId.toLowerCase()}`;
  const ipKey = `ip:${clientIp}`;

  const [installLimited, ipLimited] = await Promise.all([
    isRateLimited(installKey),
    isRateLimited(ipKey)
  ]);

  if (installLimited || ipLimited) {
    logJson('warn', 'rate_limited', { requestId });
    return sendJson(res, 429, {
      error: 'AI reflections are temporarily limited',
      code: 'RATE_LIMITED'
    }, meta);
  }

  // 7. Global AI spend budget / circuit breaker
  if (await isGlobalBudgetExceeded()) {
    logJson('warn', 'global_budget_exceeded', { requestId });
    return sendJson(res, 503, {
      error: 'Global AI reflection capacity reached. Please try again later or use local insights.',
      code: 'GLOBAL_QUOTA_EXCEEDED'
    }, meta);
  }

  // 8. Google Play Integrity verification (when enabled)
  if (process.env.PLAY_INTEGRITY_ENABLED === 'true') {
    const playIntegrityToken = req.headers['x-play-integrity-token'];
    const integrityResult = await verifyPlayIntegrity(playIntegrityToken, rawNonce, requestId);
    if (!integrityResult.valid) {
      return sendJson(res, 403, {
        error: `Play Integrity verification failed: ${integrityResult.reason}`,
        code: 'INTEGRITY_FAILED',
        reason: integrityResult.reason
      }, meta);
    }
  }

  // 9. Strict Input Validation
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return sendJson(res, 400, {
      error: 'Request body must be a valid JSON object',
      code: 'INVALID_PAYLOAD'
    }, meta);
  }

  const { sessions, includeNotes = false } = body;
  if (!Array.isArray(sessions) || sessions.length === 0 || sessions.length > 5) {
    return sendJson(res, 400, {
      error: 'Sessions must be an array with 1 to 5 items',
      code: 'INVALID_SESSIONS'
    }, meta);
  }

  const validatedSessions = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      return sendJson(res, 400, {
        error: `Session at index ${i} must be a valid JSON object`,
        code: 'INVALID_SESSION'
      }, meta);
    }

    if (typeof s.subject !== 'string' || s.subject.trim().length === 0 || s.subject.length > 60) {
      return sendJson(res, 400, {
        error: `Session at index ${i} requires subject string between 1 and 60 characters`,
        code: 'INVALID_SUBJECT'
      }, meta);
    }
    const cleanSubject = sanitizeText(s.subject.trim());

    const cleanSessionType =
      typeof s.sessionType === 'string' && s.sessionType.trim().length > 0
        ? sanitizeText(s.sessionType.trim().slice(0, 30))
        : 'Study';

    if (typeof s.energy !== 'number' || !Number.isInteger(s.energy) || s.energy < 1 || s.energy > 5) {
      return sendJson(res, 400, {
        error: `Session at index ${i} requires integer energy between 1 and 5`,
        code: 'INVALID_ENERGY'
      }, meta);
    }

    if (
      typeof s.plannedMinutes !== 'number' ||
      !Number.isInteger(s.plannedMinutes) ||
      s.plannedMinutes < 5 ||
      s.plannedMinutes > 120
    ) {
      return sendJson(res, 400, {
        error: `Session at index ${i} requires integer plannedMinutes between 5 and 120`,
        code: 'INVALID_PLANNED_MINUTES'
      }, meta);
    }

    let cleanNote = '';
    if (s.note !== undefined && s.note !== null) {
      if (typeof s.note !== 'string') {
        return sendJson(res, 400, {
          error: `Session at index ${i} note must be a string`,
          code: 'INVALID_NOTE'
        }, meta);
      }
      if (s.note.length > 300) {
        return sendJson(res, 400, {
          error: `Session at index ${i} note exceeds 300 characters`,
          code: 'NOTE_TOO_LONG'
        }, meta);
      }
      cleanNote = includeNotes ? sanitizeText(s.note.trim()) : '';
    }

    validatedSessions.push({
      subject: cleanSubject,
      sessionType: cleanSessionType,
      energy: s.energy,
      plannedMinutes: s.plannedMinutes,
      note: cleanNote
    });
  }

  // 10. Server-Side Gemini API Key Check
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    logJson('error', 'gemini_key_missing', { requestId });
    return sendJson(res, 503, {
      error: 'AI service temporarily unavailable',
      code: 'AI_UNAVAILABLE'
    }, meta);
  }

  // 11. Construct Prompt with Play Policy Guardrails
  const sessionDescriptions = validatedSessions
    .map((s, idx) => {
      const notePart = s.note ? `, Note="${s.note}"` : '';
      return `Session ${idx + 1}: Subject="${s.subject}", Type="${s.sessionType}", Energy=${s.energy}/5, Planned=${s.plannedMinutes}m${notePart}`;
    })
    .join('\n');

  const promptText = `You are an honest, supportive focus reflection coach for a student study app called Tempo.
Analyze these recent study sessions and provide exactly 1 or 2 concise, honest sentences observing study patterns and energy correlations.

Strict Guardrails (Play Store Policy Compliance):
- Only provide observations about the supplied focus/study sessions.
- Distinguish factual observations from gentle suggestions.
- Do NOT provide medical advice, psychological diagnosis, mental-health diagnosis, medication advice, clinical efficacy claims, or dangerous instructions.
- Do NOT provide financial advice.
- Do NOT infer sensitive personal characteristics (e.g. race, religion, health conditions).
- If insufficient session information exists, simply state that more focus sessions are needed.
- Maximum 40 words. Grounded and honest tone.

Sessions:
${sessionDescriptions}`;

  const geminiPayload = JSON.stringify({
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 120
    }
  });

  // 12. Call Gemini API with 10-Second Timeout via x-goog-api-key header
  try {
    const insight = await callGeminiWithTimeout(getGeminiModel(), apiKey, geminiPayload, 10000);
    return sendJson(res, 200, { insight }, meta);
  } catch (err) {
    logJson('error', 'gemini_call_failed', { requestId, reason: err.message });

    if (err.message.includes('timed out')) {
      return sendJson(res, 504, {
        error: 'AI service timed out',
        code: 'AI_TIMEOUT'
      }, meta);
    }

    if (
      err.message.includes('HTTP 4') ||
      err.message.includes('HTTP 5') ||
      err.message.includes('Malformed') ||
      err.message.includes('Empty')
    ) {
      return sendJson(res, 502, {
        error: 'Invalid response from AI provider',
        code: 'AI_BAD_GATEWAY'
      }, meta);
    }

    return sendJson(res, 503, {
      error: 'AI service temporarily unavailable',
      code: 'AI_UNAVAILABLE'
    }, meta);
  }
}

let serverInstance = null;
if (require.main === module) {
  serverInstance = http.createServer(app);
  serverInstance.listen(PORT, () => {
    logJson('info', 'server_started', { port: PORT, packageName: EXPECTED_PACKAGE_NAME });
  });
}

module.exports = {
  app,
  server: serverInstance,
  MemoryStore,
  UpstashRedisStore,
  setStoreForTesting,
  isRateLimited,
  isGlobalBudgetExceeded,
  resetRateLimits,
  checkAndRecordNonce,
  resetReplayCache,
  verifyPlayIntegrity,
  evaluateIntegrityPayload,
  setPlayIntegrityVerifierForTesting,
  createServiceAccountJwt,
  setGeminiCallerForTesting,
  sanitizeText,
  UUID_REGEX
};
