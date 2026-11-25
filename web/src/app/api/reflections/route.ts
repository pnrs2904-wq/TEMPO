import { NextRequest } from 'next/server';
import { handleSignedInReflections } from '@/lib/server/handlers/reflectionsHandler.mjs';
import {
  authenticateRequest,
  callGeminiApi,
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
    const body = await readBoundedJson(req, 16 * 1024);
    const result = await handleSignedInReflections({
      auth,
      body,
      ip: getClientIp(req),
      origin: req.headers.get('origin'),
      db: createSupabaseDbAdapter(auth),
      redis: getSharedRedis(),
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      monthlyQuota: Number(process.env.AI_MONTHLY_QUOTA) || 60,
      globalDailyCap: Number(process.env.AI_GLOBAL_DAILY_CAP) || 2000,
      callGemini: callGeminiApi
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
