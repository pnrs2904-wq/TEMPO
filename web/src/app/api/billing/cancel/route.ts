import { NextRequest } from 'next/server';
import { handleRazorpayCancel } from '@/lib/server/handlers/razorpayHandler.mjs';
import {
  authenticateRequest,
  createRazorpayClient,
  createSupabaseDbAdapter,
  toNextResponse
} from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const result = await handleRazorpayCancel({
    auth,
    origin: req.headers.get('origin'),
    db: createSupabaseDbAdapter(auth),
    razorpayClient: createRazorpayClient()
  });
  return toNextResponse(result);
}
