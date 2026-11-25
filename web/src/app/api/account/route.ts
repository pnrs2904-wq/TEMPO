import { NextRequest } from 'next/server';
import { handleAccountDelete, handleAccountExport } from '@/lib/server/handlers/accountHandler.mjs';
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

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const result = await handleAccountExport({
    auth,
    ip: getClientIp(req),
    origin: req.headers.get('origin'),
    db: createSupabaseDbAdapter(auth),
    redis: getSharedRedis()
  });
  return toNextResponse(result);
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    const body = await readBoundedJson(req, 4 * 1024);
    const result = await handleAccountDelete({
      auth,
      body,
      ip: getClientIp(req),
      origin: req.headers.get('origin'),
      db: createSupabaseDbAdapter(auth),
      redis: getSharedRedis(),
      razorpayClient: process.env.RAZORPAY_KEY_ID ? createRazorpayClient() : null
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
