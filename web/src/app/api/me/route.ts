import { NextRequest } from 'next/server';
import { handleMe } from '@/lib/server/handlers/meAndFlagsHandler.mjs';
import { authenticateRequest, createSupabaseDbAdapter, toNextResponse } from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const platform = req.headers.get('x-client-platform') || req.nextUrl.searchParams.get('platform') || 'web';
  const result = await handleMe({
    auth,
    platform,
    origin: req.headers.get('origin'),
    db: createSupabaseDbAdapter(auth)
  });
  return toNextResponse(result);
}
