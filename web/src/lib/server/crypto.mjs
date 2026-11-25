import crypto from 'node:crypto';

/**
 * Constant-time HMAC-SHA256 verification for Razorpay payments & webhooks.
 */
export function computeHmacSha256Hex(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export function verifyHmacSha256ConstantTime(payload, providedSignatureHex, secret) {
  if (!secret || !providedSignatureHex || typeof providedSignatureHex !== 'string') {
    return false;
  }
  const expected = computeHmacSha256Hex(payload, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedSignatureHex.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * SHA-256 hash of a Google Play purchase token (for unique indexing without exposing raw token).
 */
export function hashPurchaseToken(purchaseToken) {
  return crypto.createHash('sha256').update(String(purchaseToken), 'utf8').digest('hex');
}

/**
 * AES-256-GCM encryption/decryption for storing Google Play purchase tokens for re-verification.
 * Key must be 32 bytes base64-encoded in PLAY_TOKEN_ENCRYPTION_KEY.
 */
export function encryptPurchaseToken(purchaseToken, base64Key) {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error('PLAY_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(purchaseToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptPurchaseToken(encodedBlob, base64Key) {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error('PLAY_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  const combined = Buffer.from(encodedBlob, 'base64');
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

/**
 * Signs a Google Service Account RS256 OAuth 2.0 JWT assertion for Android Publisher & Play Integrity APIs.
 */
export function signGoogleServiceAccountJwt({
  clientEmail,
  privateKeyPem,
  scope,
  tokenUri = 'https://oauth2.googleapis.com/token',
  nowSec = Math.floor(Date.now() / 1000),
  lifetimeSec = 3600
}) {
  if (!clientEmail || !privateKeyPem || !scope) {
    throw new Error('Missing clientEmail, privateKeyPem, or scope for Google service-account JWT');
  }
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: tokenUri,
      iat: nowSec,
      exp: nowSec + lifetimeSec
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKeyPem);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Verifies a Google-signed OIDC JWT (used by Pub/Sub push for Google Play RTDN).
 * Strictly checks RS256 cryptographic signature, issuer, audience, service account email, and expiry.
 */
export function verifyGoogleOidcJwt(jwtToken, {
  expectedAudience,
  expectedEmail,
  publicKeysByKid,
  nowSec = Math.floor(Date.now() / 1000)
}) {
  if (!jwtToken || typeof jwtToken !== 'string') {
    return { valid: false, reason: 'MISSING_OIDC_TOKEN' };
  }
  const parts = jwtToken.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'MALFORMED_OIDC_JWT' };
  }

  let header;
  let claims;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
    claims = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  } catch {
    return { valid: false, reason: 'INVALID_OIDC_JSON' };
  }

  if (header.alg !== 'RS256') {
    return { valid: false, reason: 'UNSUPPORTED_OIDC_ALG' };
  }

  const keyMaterial = (header.kid && publicKeysByKid?.[header.kid]) || publicKeysByKid?.default;
  if (!keyMaterial) {
    return { valid: false, reason: 'UNKNOWN_OIDC_KID' };
  }

  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
  const signature = base64UrlDecode(parts[2]);

  let signatureValid = false;
  try {
    signatureValid = crypto.verify('RSA-SHA256', signingInput, keyMaterial, signature);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return { valid: false, reason: 'INVALID_OIDC_SIGNATURE' };
  }

  const allowedIssuers = new Set(['https://accounts.google.com', 'accounts.google.com']);
  if (!allowedIssuers.has(claims.iss)) {
    return { valid: false, reason: 'INVALID_OIDC_ISSUER' };
  }
  if (expectedAudience && claims.aud !== expectedAudience) {
    return { valid: false, reason: 'INVALID_OIDC_AUDIENCE' };
  }
  if (expectedEmail && claims.email !== expectedEmail) {
    return { valid: false, reason: 'INVALID_OIDC_EMAIL' };
  }
  if (claims.email_verified !== true) {
    return { valid: false, reason: 'UNVERIFIED_OIDC_EMAIL' };
  }
  if (typeof claims.exp !== 'number' || nowSec >= claims.exp) {
    return { valid: false, reason: 'OIDC_TOKEN_EXPIRED' };
  }
  if (typeof claims.nbf === 'number' && nowSec < claims.nbf - 60) {
    return { valid: false, reason: 'OIDC_TOKEN_NOT_YET_VALID' };
  }

  return { valid: true, claims };
}

/**
 * Redacts PII (emails, Indian/international phone numbers) and secrets (API keys, passwords, bearer tokens)
 * before study reflection notes ever leave the server.
 */
const REDACTION_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{30,45}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /rzp_(?:live|test)_[a-zA-Z0-9]{10,}/g,
  /(?:password|passwd|api[_-]?key|secret|bearer)[\s=:]+[^\s,;]+/gi,
  /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g,
  /(?:\+?91[\s-]?)?[6-9]\d{9}\b/g,
  /\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g
];

export function redactSensitiveText(input) {
  if (!input || typeof input !== 'string') return '';
  let out = input;
  for (const re of REDACTION_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
  }
  return out.trim();
}
