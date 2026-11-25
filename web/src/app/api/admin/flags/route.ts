import { NextRequest } from 'next/server';
import { handleAdminSetFlag } from '@/lib/server/handlers/adminHandler.mjs';
import { authenticateRequest, createSupabaseDbAdapter, readBoundedJson, toNextResponse } from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    const body = await readBoundedJson(req, 4 * 1024);
    const result = await handleAdminSetFlag({
      auth,
      body,
      origin: req.headers.get('origin'),
      db: createSupabaseDbAdapter(auth)
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
