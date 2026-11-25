import { NextRequest } from 'next/server';
import { handleRazorpayCheckout } from '@/lib/server/handlers/razorpayHandler.mjs';
import {
  authenticateRequest,
  createRazorpayClient,
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
    const body = await readBoundedJson(req, 4 * 1024);
    const result = await handleRazorpayCheckout({
      auth,
      body,
      ip: getClientIp(req),
      origin: req.headers.get('origin'),
      db: createSupabaseDbAdapter(auth),
      redis: getSharedRedis(),
      razorpayClient: createRazorpayClient(),
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || ''
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
