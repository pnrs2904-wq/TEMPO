import { NextRequest } from 'next/server';
import { handleFlags } from '@/lib/server/handlers/meAndFlagsHandler.mjs';
import { createSupabaseDbAdapter, toNextResponse } from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const result = await handleFlags({
    origin: req.headers.get('origin'),
    db: createSupabaseDbAdapter(null)
  });
  return toNextResponse(result);
}
