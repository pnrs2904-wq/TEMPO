import { buildSecurityHeaders } from '../config.mjs';
import { redactSensitiveText } from '../crypto.mjs';
import { createRequestId, logStructured } from '../logger.mjs';
import { checkRateLimit, consumeDailyAiBudget } from '../redis.mjs';
import { validateReflectionBody } from '../validators.mjs';

const DEFAULT_MONTHLY_QUOTA = 60;
const DEFAULT_BURST_LIMIT = 5; // 5 requests per 10 minutes per user
const DEFAULT_GLOBAL_DAILY_CAP = 2000;

/**
 * POST /api/reflections — Signed-in web & Android reflection endpoint.
 *
 * Strict 8-step gate order:
 *  1. Signed in (Supabase JWT)
 *  2. Plan includes AI
 *  3. User opted in (profile.ai_opt_in)
 *  4. Feature flag `ai_reflections` enabled
 *  5. GEMINI_API_KEY configured
 *  6. Per-user burst rate limit (Redis)
 *  7. Monthly per-user quota (ai_usage)
 *  8. Global daily spend cap (Redis)
 *
 * Notes are included ONLY when separately allowed (profile.ai_notes_opt_in && body.includeNotes)
 * and redacted for emails, phone numbers, and keys before leaving the server.
 * Gemini key is passed strictly via the `x-goog-api-key` header.
 */
export async function handleSignedInReflections({
  auth,
  body,
  ip = 'unknown',
  origin = null,
  db,
  redis,
  geminiApiKey,
  geminiModel = 'gemini-2.5-flash',
  monthlyQuota = DEFAULT_MONTHLY_QUOTA,
  burstLimit = DEFAULT_BURST_LIMIT,
  globalDailyCap = DEFAULT_GLOBAL_DAILY_CAP,
  callGemini,
  nowDate = new Date(),
  logSink = null
}) {
  const start = Date.now();
  const requestId = createRequestId();
  const headers = { ...buildSecurityHeaders({ origin }), 'X-Request-Id': requestId };

  const respond = (status, payload, code = null) => {
    logStructured({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      requestId,
      route: '/api/reflections',
      method: 'POST',
      status,
      latencyMs: Date.now() - start,
      code,
      sink: logSink
    });
    return { status, headers, body: payload };
  };

  // Gate 1: Signed in
  if (!auth?.userId) {
    return respond(401, { error: 'Authentication required', code: 'UNAUTHORIZED' }, 'UNAUTHORIZED');
  }

  // Gate 2: Plan includes AI
  const entitlement = await db.getActiveEntitlement(auth.userId);
  if (!entitlement?.isPro || !entitlement?.includesAi) {
    return respond(403, { error: 'Your current plan does not include AI reflections', code: 'PLAN_NO_AI' }, 'PLAN_NO_AI');
  }

  // Gate 3: User opted in
  const profile = await db.getProfile(auth.userId);
  if (!profile?.ai_opt_in) {
    return respond(403, { error: 'Enable AI reflections in Settings before requesting reflections', code: 'AI_OPT_IN_REQUIRED' }, 'AI_OPT_IN_REQUIRED');
  }

  // Gate 4: Feature flag enabled
  const flags = await db.getFeatureFlags();
  if (!flags?.ai_reflections) {
    return respond(503, { error: 'AI reflections are currently disabled', code: 'FEATURE_DISABLED' }, 'FEATURE_DISABLED');
  }

  // Gate 5: Gemini key configured
  if (!geminiApiKey) {
    return respond(503, { error: 'AI service unavailable', code: 'AI_UNAVAILABLE' }, 'AI_UNAVAILABLE');
  }

  // Validate payload before burning quotas
  const validated = validateReflectionBody(body);
  if (!validated.ok) {
    return respond(400, { error: validated.error, code: 'INVALID_BODY' }, 'INVALID_BODY');
  }

  // Gate 6: Per-user burst rate limit (and per-IP abuse cap) in Redis
  const userBurst = await checkRateLimit(redis, `ai:burst:u:${auth.userId}`, { limit: burstLimit, windowSec: 600 });
  const ipBurst = await checkRateLimit(redis, `ai:burst:ip:${ip}`, { limit: burstLimit * 4, windowSec: 600 });
  if (!userBurst.allowed || !ipBurst.allowed) {
    return respond(429, { error: 'Too many reflection requests; try again in a few minutes', code: 'RATE_LIMITED' }, 'RATE_LIMITED');
  }

  // Gate 7: Monthly quota
  const monthKey = nowDate.toISOString().slice(0, 7); // YYYY-MM
  const usedThisMonth = await db.getMonthlyAiUsage(auth.userId, monthKey);
  if (usedThisMonth >= monthlyQuota) {
    return respond(429, { error: 'Monthly AI reflection quota reached', code: 'MONTHLY_QUOTA_EXCEEDED' }, 'MONTHLY_QUOTA_EXCEEDED');
  }

  // Gate 8: Global daily spend cap in Redis
  const globalCap = await consumeDailyAiBudget(redis, globalDailyCap, nowDate);
  if (!globalCap.allowed) {
    return respond(503, { error: 'Global daily AI capacity reached', code: 'GLOBAL_BUDGET_EXCEEDED' }, 'GLOBAL_BUDGET_EXCEEDED');
  }

  // Notes included ONLY if separately consented in profile AND requested in body, always redacted
  const allowNotes = Boolean(profile.ai_notes_opt_in) && validated.value.includeNotes;
  const sanitizedSessions = validated.value.sessions.map((s) => ({
    subject: redactSensitiveText(s.subject),
    sessionType: redactSensitiveText(s.sessionType || 'Study'),
    energy: s.energy,
    plannedMinutes: s.plannedMinutes,
    note: allowNotes && s.note ? redactSensitiveText(s.note) : ''
  }));

  const prompt = [
    'You are Tempo, an honest study-habit reflection coach.',
    'Observe focus duration, energy, and study patterns in 1-2 grounded sentences (<= 45 words).',
    'Never give medical, psychological, or financial advice.',
    ...sanitizedSessions.map((s, i) =>
      `Session ${i + 1}: Subject="${s.subject}", Type="${s.sessionType}", Energy=${s.energy}/5, Planned=${s.plannedMinutes}m` +
      (s.note ? `, Note="${s.note}"` : '')
    )
  ].join('\n');

  try {
    const insight = await callGemini({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey
      },
      prompt
    });

    await db.incrementMonthlyAiUsage(auth.userId, monthKey);
    return respond(200, { insight, notesIncluded: allowNotes });
  } catch {
    return respond(502, { error: 'AI provider request failed', code: 'AI_BAD_GATEWAY' }, 'AI_BAD_GATEWAY');
  }
}
