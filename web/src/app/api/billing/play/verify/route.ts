import { NextRequest } from 'next/server';
import { handlePlayVerify } from '@/lib/server/handlers/playBillingHandler.mjs';
import {
  authenticateRequest,
  createGooglePlayApiClient,
  createSupabaseDbAdapter,
  getClientIp,
  getSharedRedis,
  readBoundedJson,
  toNextResponse
} from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    const body = await readBoundedJson(req, 8 * 1024);
    const result = await handlePlayVerify({
      auth,
      body,
      ip: getClientIp(req),
      origin: req.headers.get('origin'),
      db: createSupabaseDbAdapter(auth),
      redis: getSharedRedis(),
      playApi: createGooglePlayApiClient(),
      tokenEncryptionKey: process.env.PLAY_TOKEN_ENCRYPTION_KEY || ''
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
