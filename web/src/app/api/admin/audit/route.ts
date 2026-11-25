import { NextRequest } from 'next/server';
import { handleAdminAuditLogs } from '@/lib/server/handlers/adminHandler.mjs';
import { authenticateRequest, createSupabaseDbAdapter, toNextResponse } from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
  const result = await handleAdminAuditLogs({
    auth,
    limit,
    origin: req.headers.get('origin'),
    db: createSupabaseDbAdapter(auth)
  });
  return toNextResponse(result);
}
