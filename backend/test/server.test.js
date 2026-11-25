'use strict';

process.env.TEMPO_SILENT_LOGS = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const {
  app,
  MemoryStore,
  setStoreForTesting,
  resetRateLimits,
  resetReplayCache,
  evaluateIntegrityPayload,
  setPlayIntegrityVerifierForTesting,
  createServiceAccountJwt,
  setGeminiCallerForTesting,
  sanitizeText
} = require('../server');

let server;
let baseUrl;
const originalKey = process.env.GEMINI_API_KEY;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (originalKey !== undefined) {
    process.env.GEMINI_API_KEY = originalKey;
  } else {
    delete process.env.GEMINI_API_KEY;
  }
});

test.beforeEach(() => {
  setStoreForTesting(null);
  resetRateLimits();
  resetReplayCache();
  setPlayIntegrityVerifierForTesting(null);
  setGeminiCallerForTesting(null);
  delete process.env.PLAY_INTEGRITY_ENABLED;
  delete process.env.PLAY_INTEGRITY_DEVICE_POLICY;
  delete process.env.PLAY_INTEGRITY_REQUIRE_LICENSED;
  delete process.env.GLOBAL_MAX_REQUESTS_PER_HOUR;
});

function makeHeaders(custom = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Installation-Id': crypto.randomUUID(),
    'X-Request-Timestamp': Date.now().toString(),
    'X-Request-Nonce': crypto.randomUUID(),
    ...custom
  };
}

// 1. Health check & security headers
test('GET /health returns HTTP 200 with status ok, X-Request-Id, and full security headers', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.version, undefined);
  assert.ok(res.headers.get('x-request-id'));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.ok(res.headers.get('strict-transport-security')?.includes('max-age=31536000'));
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(res.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
  assert.ok(res.headers.get('permissions-policy'));
});

// 2. Content-Type verification
test('POST /api/v1/reflections requires Content-Type application/json', async () => {
  const res = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'X-Installation-Id': crypto.randomUUID(),
      'X-Request-Timestamp': Date.now().toString(),
      'X-Request-Nonce': crypto.randomUUID()
    },
    body: 'hello'
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'INVALID_CONTENT_TYPE');
});

// 3. Installation Identifier checks
test('POST /api/v1/reflections rejects missing X-Installation-Id', async () => {
  const res = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Timestamp': Date.now().toString(),
      'X-Request-Nonce': crypto.randomUUID()
    },
    body: JSON.stringify({ sessions: [] })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'MISSING_INSTALLATION_ID');
});

test('POST /api/v1/reflections rejects invalid format X-Installation-Id', async () => {
  const res = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Installation-Id': 'not-a-valid-uuid-1234',
      'X-Request-Timestamp': Date.now().toString(),
      'X-Request-Nonce': crypto.randomUUID()
    },
    body: JSON.stringify({ sessions: [] })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'INVALID_INSTALLATION_ID');
});

// 4. Timestamp freshness checks
test('POST /api/v1/reflections rejects missing X-Request-Timestamp', async () => {
  const res = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Installation-Id': crypto.randomUUID(),
      'X-Request-Nonce': crypto.randomUUID()
    },
    body: JSON.stringify({ sessions: [] })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'MISSING_TIMESTAMP');
});

test('POST /api/v1/reflections rejects non-numeric X-Request-Timestamp', async () => {
  const res = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Installation-Id': crypto.randomUUID(),
      'X-Request-Timestamp': 'abc-not-a-timestamp',
      'X-Request-Nonce': crypto.randomUUID()
    },
    body: JSON.stringify({ sessions: [] })
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'INVALID_TIMESTAMP');
});

test('POST /api/v1/reflections rejects stale and future timestamps (> 5 minutes drift)', async () => {
  const staleRes = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders({ 'X-Request-Timestamp': String(Date.now() - 6 * 60 * 1000) }),
    body: JSON.stringify({ sessions: [] })
  });
  assert.equal(staleRes.status, 400);
  assert.equal((await staleRes.json()).code, 'TIMESTAMP_OUT_OF_BOUNDS');

  const futureRes = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders({ 'X-Request-Timestamp': String(Date.now() + 6 * 60 * 1000) }),
    body: JSON.stringify({ sessions: [] })
  });
  assert.equal(futureRes.status, 400);
  assert.equal((await futureRes.json()).code, 'TIMESTAMP_OUT_OF_BOUNDS');
});

// 5. Replay protection & Nonce checks
test('POST /api/v1/reflections rejects missing, short, and replayed nonces', async () => {
  const headersNoNonce = makeHeaders();
  delete headersNoNonce['X-Request-Nonce'];
  const resMissing = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: headersNoNonce,
    body: JSON.stringify({ sessions: [{ subject: 'Math', energy: 3, plannedMinutes: 25 }] })
  });
  assert.equal(resMissing.status, 400);
  assert.equal((await resMissing.json()).code, 'MISSING_NONCE');

  const resShort = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders({ 'X-Request-Nonce': 'short' }),
    body: JSON.stringify({ sessions: [{ subject: 'Math', energy: 3, plannedMinutes: 25 }] })
  });
  assert.equal(resShort.status, 400);
  assert.equal((await resShort.json()).code, 'INVALID_NONCE');

  delete process.env.GEMINI_API_KEY;
  const fixedNonce = 'nonce-test-replay-uuid-998877';
  const headers = makeHeaders({ 'X-Request-Nonce': fixedNonce });
  const payload = JSON.stringify({ sessions: [{ subject: 'Math', energy: 4, plannedMinutes: 30 }] });

  const res1 = await fetch(`${baseUrl}/api/v1/reflections`, { method: 'POST', headers, body: payload });
  assert.equal(res1.status, 503);

  const res2 = await fetch(`${baseUrl}/api/v1/reflections`, { method: 'POST', headers, body: payload });
  assert.equal(res2.status, 409);
  assert.equal((await res2.json()).code, 'REPLAY_DETECTED');
});

// 6. Play Integrity unit tests (package, nonce, freshness, device policy, licensing)
test('evaluateIntegrityPayload enforces package name, nonce, and app verdict', () => {
  const now = Date.now();
  const base = {
    requestDetails: { requestPackageName: 'com.tempo.focus', nonce: 'testnonce123', timestampMillis: String(now) },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
    accountDetails: { appLicensingVerdict: 'LICENSED' }
  };

  assert.equal(evaluateIntegrityPayload(base, 'com.tempo.focus', 'testnonce123', { nowMs: now }).valid, true);

  const wrongPkg = { ...base, requestDetails: { ...base.requestDetails, requestPackageName: 'com.attacker.app' } };
  assert.ok(evaluateIntegrityPayload(wrongPkg, 'com.tempo.focus', 'testnonce123', { nowMs: now }).reason.includes('PACKAGE_MISMATCH'));

  const wrongNonce = { ...base, requestDetails: { ...base.requestDetails, nonce: 'other-nonce' } };
  assert.equal(evaluateIntegrityPayload(wrongNonce, 'com.tempo.focus', 'testnonce123', { nowMs: now }).reason, 'NONCE_MISMATCH');

  const unrecApp = { ...base, appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } };
  assert.ok(evaluateIntegrityPayload(unrecApp, 'com.tempo.focus', 'testnonce123', { nowMs: now }).reason.includes('UNRECOGNIZED_APP'));
});

test('evaluateIntegrityPayload enforces +/- 5 minute token freshness', () => {
  const now = Date.now();
  const makePayload = (timestampMillis) => ({
    requestDetails: { requestPackageName: 'com.tempo.focus', nonce: 'nonce12345', timestampMillis },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] }
  });

  assert.equal(evaluateIntegrityPayload(makePayload(now - 6 * 60 * 1000), 'com.tempo.focus', 'nonce12345', { nowMs: now }).reason, 'STALE_INTEGRITY_TOKEN');
  assert.equal(evaluateIntegrityPayload(makePayload(now + 6 * 60 * 1000), 'com.tempo.focus', 'nonce12345', { nowMs: now }).reason, 'STALE_INTEGRITY_TOKEN');
  assert.equal(evaluateIntegrityPayload(makePayload(undefined), 'com.tempo.focus', 'nonce12345', { nowMs: now }).reason, 'MISSING_OR_INVALID_TOKEN_TIMESTAMP');
  assert.equal(evaluateIntegrityPayload(makePayload(now - 2 * 60 * 1000), 'com.tempo.focus', 'nonce12345', { nowMs: now }).valid, true);
});

test('evaluateIntegrityPayload enforces configurable device policy (basic | device | strong)', () => {
  const now = Date.now();
  const makePayload = (verdicts) => ({
    requestDetails: { requestPackageName: 'com.tempo.focus', nonce: 'nonce12345', timestampMillis: now },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
    deviceIntegrity: { deviceRecognitionVerdict: verdicts }
  });

  // Default policy 'device' rejects MEETS_BASIC_INTEGRITY only
  assert.equal(evaluateIntegrityPayload(makePayload(['MEETS_BASIC_INTEGRITY']), 'com.tempo.focus', 'nonce12345', { nowMs: now }).valid, false);
  assert.equal(evaluateIntegrityPayload(makePayload(['MEETS_DEVICE_INTEGRITY']), 'com.tempo.focus', 'nonce12345', { nowMs: now }).valid, true);

  // Policy 'basic' accepts MEETS_BASIC_INTEGRITY
  assert.equal(evaluateIntegrityPayload(makePayload(['MEETS_BASIC_INTEGRITY']), 'com.tempo.focus', 'nonce12345', { nowMs: now, devicePolicy: 'basic' }).valid, true);

  // Policy 'strong' requires MEETS_STRONG_INTEGRITY
  assert.equal(evaluateIntegrityPayload(makePayload(['MEETS_DEVICE_INTEGRITY']), 'com.tempo.focus', 'nonce12345', { nowMs: now, devicePolicy: 'strong' }).valid, false);
  assert.equal(evaluateIntegrityPayload(makePayload(['MEETS_STRONG_INTEGRITY']), 'com.tempo.focus', 'nonce12345', { nowMs: now, devicePolicy: 'strong' }).valid, true);
});

test('evaluateIntegrityPayload enforces optional app licensing check when enabled', () => {
  const now = Date.now();
  const unlicensed = {
    requestDetails: { requestPackageName: 'com.tempo.focus', nonce: 'nonce12345', timestampMillis: now },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
    accountDetails: { appLicensingVerdict: 'UNLICENSED' }
  };

  assert.equal(evaluateIntegrityPayload(unlicensed, 'com.tempo.focus', 'nonce12345', { nowMs: now, requireLicensed: false }).valid, true);
  const res = evaluateIntegrityPayload(unlicensed, 'com.tempo.focus', 'nonce12345', { nowMs: now, requireLicensed: true });
  assert.equal(res.valid, false);
  assert.ok(res.reason.includes('APP_NOT_LICENSED'));

  const licensed = { ...unlicensed, accountDetails: { appLicensingVerdict: 'LICENSED' } };
  assert.equal(evaluateIntegrityPayload(licensed, 'com.tempo.focus', 'nonce12345', { nowMs: now, requireLicensed: true }).valid, true);
});

test('createServiceAccountJwt produces a valid RS256 signed JWT assertion', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = {
    client_email: 'play-verifier@tempo-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    private_key_id: 'kid-123',
    token_uri: 'https://oauth2.googleapis.com/token'
  };
  const jwt = createServiceAccountJwt(sa, 'https://www.googleapis.com/auth/playintegrity', 1700000000);
  const [h, p, s] = jwt.split('.');
  assert.ok(h && p && s);

  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  assert.equal(header.alg, 'RS256');
  assert.equal(header.kid, 'kid-123');
  assert.equal(claims.iss, sa.client_email);
  assert.equal(claims.exp, 1700003600);

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${h}.${p}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, Buffer.from(s, 'base64url')), true);
});

test('POST /api/v1/reflections enforces Play Integrity when enabled', async () => {
  process.env.PLAY_INTEGRITY_ENABLED = 'true';

  const resMissing = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({ sessions: [{ subject: 'Physics', energy: 3, plannedMinutes: 25 }] })
  });
  assert.equal(resMissing.status, 403);
  assert.equal((await resMissing.json()).code, 'INTEGRITY_FAILED');

  setPlayIntegrityVerifierForTesting(() => ({ valid: false, reason: 'STALE_INTEGRITY_TOKEN' }));
  const resFail = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders({ 'X-Play-Integrity-Token': 'stale-token' }),
    body: JSON.stringify({ sessions: [{ subject: 'Physics', energy: 3, plannedMinutes: 25 }] })
  });
  assert.equal(resFail.status, 403);
  assert.equal((await resFail.json()).code, 'INTEGRITY_FAILED');

  setPlayIntegrityVerifierForTesting(() => ({ valid: true }));
  delete process.env.GEMINI_API_KEY;
  const resPass = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders({ 'X-Play-Integrity-Token': 'valid-attested-token' }),
    body: JSON.stringify({ sessions: [{ subject: 'Physics', energy: 3, plannedMinutes: 25 }] })
  });
  assert.equal(resPass.status, 503);
  assert.equal((await resPass.json()).code, 'AI_UNAVAILABLE');
});

// 7. Gemini API key must be sent in x-goog-api-key header (NEVER query string), and notes opt-in + redaction enforced
test('POST /api/v1/reflections sends Gemini key via x-goog-api-key header only and strips notes unless opted in', async () => {
  process.env.GEMINI_API_KEY = 'test-fake-gemini-secret-value';
  const calls = [];
  setGeminiCallerForTesting(async (reqInfo) => {
    calls.push(reqInfo);
    return 'Your energy is strongest during 30-minute Physics blocks.';
  });

  // Default includeNotes=false: note MUST NOT reach Gemini prompt
  const res1 = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({
      sessions: [{ subject: 'Physics', energy: 4, plannedMinutes: 30, note: 'Private note with student@example.com' }]
    })
  });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.ok(data1.insight.includes('Physics'));
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].url.includes('key='), 'Gemini API key must never appear in query string');
  assert.equal(calls[0].headers['x-goog-api-key'], 'test-fake-gemini-secret-value');
  assert.ok(!calls[0].payload.includes('Private note'), 'Notes must not be sent unless includeNotes is true');

  // With includeNotes=true: note is included, but PII is redacted
  const res2 = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({
      includeNotes: true,
      sessions: [{ subject: 'Physics', energy: 4, plannedMinutes: 30, note: 'Email student@example.com phone 9876543210 solved optics' }]
    })
  });
  assert.equal(res2.status, 200);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].payload.includes('solved optics'));
  assert.ok(!calls[1].payload.includes('student@example.com'));
  assert.ok(!calls[1].payload.includes('9876543210'));
  assert.ok(calls[1].payload.includes('[REDACTED]'));
});

// 8. Strict JSON & payload validation
test('POST /api/v1/reflections validates malformed JSON, bounds, and 16KB limit', async () => {
  const resBadJson = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: '{"sessions": [unclosed'
  });
  assert.equal(resBadJson.status, 400);
  assert.equal((await resBadJson.json()).code, 'INVALID_JSON');

  const resHuge = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: 'A'.repeat(17 * 1024)
  });
  assert.equal(resHuge.status, 413);
  assert.equal((await resHuge.json()).code, 'PAYLOAD_TOO_LARGE');

  const resEmpty = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({ sessions: [] })
  });
  assert.equal(resEmpty.status, 400);
  assert.equal((await resEmpty.json()).code, 'INVALID_SESSIONS');

  const resSix = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({ sessions: Array(6).fill({ subject: 'Math', energy: 3, plannedMinutes: 25 }) })
  });
  assert.equal(resSix.status, 400);
  assert.equal((await resSix.json()).code, 'INVALID_SESSIONS');

  const resBadEnergy = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({ sessions: [{ subject: 'Math', energy: 3.5, plannedMinutes: 25 }] })
  });
  assert.equal(resBadEnergy.status, 400);
  assert.equal((await resBadEnergy.json()).code, 'INVALID_ENERGY');

  const resBadMins = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({ sessions: [{ subject: 'Math', energy: 3, plannedMinutes: 121 }] })
  });
  assert.equal(resBadMins.status, 400);
  assert.equal((await resBadMins.json()).code, 'INVALID_PLANNED_MINUTES');

  const resLongNote = await fetch(`${baseUrl}/api/v1/reflections`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({ sessions: [{ subject: 'Math', energy: 3, plannedMinutes: 25, note: 'X'.repeat(301) }] })
  });
  assert.equal(resLongNote.status, 400);
  assert.equal((await resLongNote.json()).code, 'NOTE_TOO_LONG');
});

// 9. Rate limiting & Global budget via distributed store interface
test('POST /api/v1/reflections enforces rate limit (10 req / 10 min) via injected Redis-compatible store', async () => {
  delete process.env.GEMINI_API_KEY;
  const customStore = new MemoryStore();
  setStoreForTesting(customStore);

  const installId = crypto.randomUUID();
  const makeCall = () =>
    fetch(`${baseUrl}/api/v1/reflections`, {
      method: 'POST',
      headers: makeHeaders({ 'X-Installation-Id': installId }),
      body: JSON.stringify({ sessions: [{ subject: 'Chemistry', energy: 3, plannedMinutes: 30 }] })
    });

  for (let i = 0; i < 10; i++) {
    const res = await makeCall();
    assert.equal(res.status, 503);
  }
  const blocked = await makeCall();
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).code, 'RATE_LIMITED');
});

test('POST /api/v1/reflections trips global budget circuit breaker', async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.GLOBAL_MAX_REQUESTS_PER_HOUR = '2';

  const makeCall = () =>
    fetch(`${baseUrl}/api/v1/reflections`, {
      method: 'POST',
      headers: makeHeaders(),
      body: JSON.stringify({ sessions: [{ subject: 'History', energy: 3, plannedMinutes: 25 }] })
    });

  assert.equal((await makeCall()).status, 503);
  assert.equal((await makeCall()).status, 503);
  const tripped = await makeCall();
  assert.equal(tripped.status, 503);
  assert.equal((await tripped.json()).code, 'GLOBAL_QUOTA_EXCEEDED');
});

// 10. PII redaction
test('sanitizeText scrubs emails, Indian phone numbers, passwords, and API keys', () => {
  const raw = 'Call +91 9876543210 or email student@university.edu password: mysecret123 AIzaSyD9876543210123456789012345678901';
  const redacted = sanitizeText(raw);
  assert.ok(!redacted.includes('9876543210'));
  assert.ok(!redacted.includes('student@university.edu'));
  assert.ok(!redacted.includes('mysecret123'));
  assert.ok(!redacted.includes('AIzaSyD'));
  assert.ok(redacted.includes('[REDACTED]'));
});
