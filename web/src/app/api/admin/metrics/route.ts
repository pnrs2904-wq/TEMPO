import { NextRequest } from 'next/server';
import { handleAdminMetrics } from '@/lib/server/handlers/adminHandler.mjs';
import { authenticateRequest, createSupabaseDbAdapter, toNextResponse } from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const days = req.nextUrl.searchParams.get('days') || '30';
  const result = await handleAdminMetrics({
    auth,
    days: Number(days),
    origin: req.headers.get('origin'),
    db: createSupabaseDbAdapter(auth)
  });
  return toNextResponse(result);
}
