import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { handlePlayRtdn } from '@/lib/server/handlers/playBillingHandler.mjs';
import {
  createGooglePlayApiClient,
  createSupabaseDbAdapter,
  readBoundedJson,
  toNextResponse
} from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

let jwksCache: { keys: Record<string, crypto.KeyObject>; expiresAt: number } | null = null;

async function fetchGooglePublicKeys(): Promise<Record<string, crypto.KeyObject>> {
  if (jwksCache && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error(`Google JWKS HTTP ${res.status}`);
  const data: any = await res.json();
  const keys: Record<string, crypto.KeyObject> = {};
  for (const jwk of data.keys || []) {
    if (jwk.kid) {
      keys[jwk.kid] = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    }
  }
  jwksCache = { keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return keys;
}

export async function POST(req: NextRequest) {
  try {
    const body = await readBoundedJson(req, 32 * 1024);
    const publicKeysByKid = await fetchGooglePublicKeys();
    const result = await handlePlayRtdn({
      authorizationHeader: req.headers.get('authorization') || '',
      body,
      origin: req.headers.get('origin'),
      db: createSupabaseDbAdapter(null),
      playApi: createGooglePlayApiClient(),
      oidcConfig: {
        expectedAudience: process.env.PLAY_RTDN_AUDIENCE || '',
        expectedEmail: process.env.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL || '',
        publicKeysByKid
      }
    });
    return toNextResponse(result);
  } catch (err: any) {
    return toNextResponse({
      status: err?.status || 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err?.message || 'Internal error', code: err?.code || 'INTERNAL_ERROR' }
    });
  }
}
