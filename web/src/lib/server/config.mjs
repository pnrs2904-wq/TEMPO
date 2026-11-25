/**
 * Server-only configuration, authoritative pricing, CORS policy, and security headers.
 * Server secrets NEVER use the NEXT_PUBLIC_ prefix.
 */

export const ANDROID_PACKAGE_NAME = 'com.tempo.focus';

/**
 * Authoritative server-side pricing table (in INR paise).
 * Clients NEVER supply amounts to payment providers.
 */
export const SERVER_PRICES = Object.freeze({
  pro_monthly: Object.freeze({
    productId: 'pro_monthly',
    label: 'Tempo Pro Monthly',
    currency: 'INR',
    amountPaise: 19900,
    displayInr: '₹199/month',
    interval: 'monthly',
    includesAi: true
  }),
  pro_annual: Object.freeze({
    productId: 'pro_annual',
    label: 'Tempo Pro Annual',
    currency: 'INR',
    amountPaise: 149900,
    displayInr: '₹1,499/year',
    interval: 'annual',
    includesAi: true
  }),
  lifetime: Object.freeze({
    productId: 'lifetime',
    label: 'Tempo Pro Lifetime',
    currency: 'INR',
    amountPaise: 399900,
    displayInr: '₹3,999 once',
    interval: 'lifetime',
    includesAi: true
  })
});

export const SAFE_DEFAULT_FLAGS = Object.freeze({
  exam_prep: true,
  ai_reflections: false,
  institutes: false
});

export function getAllowedSiteOrigin(env = process.env) {
  return (env.SITE_ORIGIN || env.NEXT_PUBLIC_SITE_URL || 'https://tempo.example.com').replace(/\/+$/, '');
}

export function buildSecurityHeaders({
  origin = null,
  allowedOrigin = getAllowedSiteOrigin(),
  cspNonce = null,
  cacheControl = 'no-store, no-cache, must-revalidate'
} = {}) {
  const scriptSrc = cspNonce
    ? `'self' 'nonce-${cspNonce}' https://checkout.razorpay.com https://accounts.google.com/gsi/client`
    : `'self' https://checkout.razorpay.com https://accounts.google.com/gsi/client`;

  const headers = {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")',
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.supabase.co https://api.razorpay.com https://accounts.google.com",
      "frame-src https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
    'Cache-Control': cacheControl
  };

  if (origin && origin.replace(/\/+$/, '') === allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Client-Platform, X-App-Version';
    headers['Vary'] = 'Origin';
  }

  return headers;
}

export function getPaymentMethodsForPlatform(platform) {
  const norm = String(platform || 'web').toLowerCase();
  if (norm === 'android') {
    return ['google_play'];
  }
  return ['razorpay'];
}
