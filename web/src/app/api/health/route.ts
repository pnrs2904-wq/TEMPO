import { NextRequest } from 'next/server';
import { handleHealth } from '@/lib/server/handlers/meAndFlagsHandler.mjs';
import { createSupabaseDbAdapter, toNextResponse } from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const result = await handleHealth({
    origin: req.headers.get('origin'),
    db: createSupabaseDbAdapter(null)
  });
  return toNextResponse(result);
}
