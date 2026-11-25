import { NextRequest } from 'next/server';
import { handleRazorpayWebhook } from '@/lib/server/handlers/razorpayHandler.mjs';
import { createSupabaseDbAdapter, toNextResponse } from '@/lib/server/supabaseAdapter';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 64 * 1024) {
    return toNextResponse({ status: 413, headers: {}, body: { error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' } });
  }
  const result = await handleRazorpayWebhook({
    rawBody,
    signatureHeader: req.headers.get('x-razorpay-signature') || '',
    eventIdHeader: req.headers.get('x-razorpay-event-id'),
    origin: req.headers.get('origin'),
    db: createSupabaseDbAdapter(null),
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ''
  });
  return toNextResponse(result);
}
