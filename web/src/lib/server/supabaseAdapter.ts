import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { signGoogleServiceAccountJwt } from '@/lib/server/crypto.mjs';
import { createRedisStore } from '@/lib/server/redis.mjs';
import { dbToWire, wireToDb } from '@/lib/server/wire.mjs';

export interface CallerAuth {
  userId: string;
  email: string | null;
  aal: string;
  jwt: string;
}

const MAX_DEFAULT_BODY_BYTES = 512 * 1024; // 512 KB for sync; smaller for other routes

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function readBoundedJson(req: NextRequest, maxBytes = MAX_DEFAULT_BODY_BYTES) {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw Object.assign(new Error('Payload too large'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  try {
    return raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400, code: 'INVALID_JSON' });
  }
}

export function toNextResponse(result: { status: number; headers: Record<string, string>; body: unknown }) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers
  });
}

function createJwtClient(jwt: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
}

/**
 * Service-role client — strictly limited to operations where RLS cannot express the rule:
 * payments, entitlements, play_purchases, webhook_events idempotency, AI usage ledger, and account cascade delete.
 * Every use is documented in docs/SECURITY_REVIEW.md.
 */
function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function authenticateRequest(req: NextRequest): Promise<CallerAuth | null> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return null;

  const client = createJwtClient(jwt);
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;

  // Decode JWT payload (already verified by Supabase getUser) strictly to inspect `aal` claim
  let aal = 'aal1';
  try {
    const payloadJson = Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    aal = JSON.parse(payloadJson)?.aal || 'aal1';
  } catch {
    aal = 'aal1';
  }

  return {
    userId: data.user.id,
    email: data.user.email || null,
    aal,
    jwt
  };
}

let cachedRedis: ReturnType<typeof createRedisStore> | null = null;
export function getSharedRedis() {
  if (!cachedRedis) cachedRedis = createRedisStore(process.env);
  return cachedRedis;
}

/**
 * Creates a request-scoped database adapter:
 * - User data reads/writes ALWAYS use `userClient` (caller's JWT -> Postgres RLS enforced).
 * - Billing/entitlements/webhooks/delete cascade use `serviceClient` only where required.
 */
export function createSupabaseDbAdapter(auth: CallerAuth | null) {
  const userClient = auth ? createJwtClient(auth.jwt) : null;
  const getService = () => createServiceRoleClient();

  return {
    async ping() {
      const client = userClient || createJwtClient('');
      const { error } = await client.from('feature_flags').select('key').limit(1);
      return !error;
    },

    async getProfile(userId: string) {
      const client = userClient!;
      const { data } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
      return data;
    },

    async getActiveEntitlement(userId: string) {
      const client = userClient || getService();
      const { data } = await client
        .from('entitlements')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(5);
      const now = Date.now();
      const active = (data || []).find(
        (e: any) =>
          ['active', 'grace_period', 'canceled'].includes(e.status) &&
          e.plan !== 'free' &&
          (!e.current_period_end || Date.parse(e.current_period_end) > now)
      ) || (data || [])[0];
      if (!active) {
        return { isPro: false, plan: 'free', status: 'none', source: 'none', sourceRef: null, includesAi: false, currentPeriodEnd: null };
      }
      const isPro = ['active', 'grace_period', 'canceled'].includes(active.status) &&
        active.plan !== 'free' &&
        (!active.current_period_end || Date.parse(active.current_period_end) > now);
      return {
        isPro,
        plan: active.plan,
        status: active.status,
        source: active.source || 'grant',
        sourceRef: active.source_ref || null,
        includesAi: Boolean(active.includes_ai) && isPro,
        currentPeriodEnd: active.current_period_end || null
      };
    },

    async hasPro(userId: string) {
      const ent = await this.getActiveEntitlement(userId);
      return ent.isPro;
    },

    async getFeatureFlags() {
      const client = userClient || createJwtClient('');
      const { data } = await client.from('feature_flags').select('key, enabled');
      const map: Record<string, boolean> = {};
      for (const row of data || []) map[row.key] = Boolean(row.enabled);
      return map;
    },

    async getUserRecord(userId: string, table: string, id: string) {
      const { data } = await userClient!.from(table).select('*').eq('id', id).eq('user_id', userId).maybeSingle();
      return data;
    },

    async upsertUserRecord(userId: string, table: string, row: Record<string, unknown>) {
      // Wire (camelCase, epoch ms) -> columns; only listed fields are written, user_id from the token.
      const payload = wireToDb(table, row, userId);
      const { error } = await userClient!.from(table).upsert(payload, { onConflict: 'id' });
      if (error) throw Object.assign(new Error(error.message), { code: error.code || 'CONSTRAINT_ERROR' });
    },

    async getUserState(userId: string) {
      const { data } = await userClient!.from('user_state').select('*').eq('user_id', userId).maybeSingle();
      return data;
    },

    async upsertUserState(userId: string, preferences: Record<string, unknown>, updatedAtMs: number) {
      const { error } = await userClient!.from('user_state').upsert(
        { user_id: userId, preferences, updated_at: new Date(updatedAtMs).toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) throw new Error(error.message);
    },

    async getSyncDevice(userId: string, deviceId: string) {
      const { data } = await userClient!
        .from('sync_devices')
        .select('*')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .maybeSingle();
      return data ? { lastFullPullAt: Date.parse(data.last_sync_at) } : null;
    },

    async upsertSyncDevice(userId: string, dev: { deviceId: string; platform: string; appVersion: string; lastSyncAt: number }) {
      await userClient!.from('sync_devices').upsert(
        {
          user_id: userId,
          device_id: dev.deviceId,
          platform: dev.platform,
          app_version: dev.appVersion,
          last_sync_at: new Date(dev.lastSyncAt).toISOString()
        },
        { onConflict: 'user_id,device_id' }
      );
    },

    async pullSessions(userId: string, cursor: number, limit: number) {
      const { data } = await userClient!
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .gt('rev', cursor)
        .order('rev', { ascending: true })
        .limit(limit);
      return (data || []).map((r: any) => dbToWire('sessions', r));
    },

    async pullPrepEnvelopes(userId: string, prepCursor: number, limit: number) {
      const tables = ['user_exam_plans', 'user_topic_progress', 'revision_events', 'mock_tests', 'question_attempts'];
      const results: Array<{ table: string; row: any }> = [];
      for (const table of tables) {
        const { data } = await userClient!
          .from(table)
          .select('*')
          .eq('user_id', userId)
          .gt('rev', prepCursor)
          .order('rev', { ascending: true })
          .limit(limit);
        for (const row of data || []) results.push({ table, row: dbToWire(table, row) });
      }
      results.sort((a, b) => Number(a.row.rev) - Number(b.row.rev));
      return results.slice(0, limit);
    },

    // Service-role billing & webhook operations
    async recordWebhookEventIfNew(provider: string, eventId: string) {
      const { error } = await getService().from('webhook_events').insert({ provider, event_id: eventId });
      return !error;
    },

    async getPaymentByProviderPaymentId(providerPaymentId: string) {
      const { data } = await getService().from('payments').select('*').eq('provider_payment_id', providerPaymentId).maybeSingle();
      return data ? { ...data, userId: data.user_id } : null;
    },

    async getPaymentByProviderOrderId(providerOrderId: string) {
      const { data } = await getService().from('payments').select('*').eq('provider_order_id', providerOrderId)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data ? { ...data, userId: data.user_id } : null;
    },

    async recordPayment(p: any) {
      await getService().from('payments').insert({
        user_id: p.userId,
        provider: p.provider,
        provider_payment_id: p.providerPaymentId || null,
        provider_order_id: p.providerOrderId || null,
        provider_subscription_id: p.providerSubscriptionId || null,
        plan: p.plan,
        amount_paise: p.amountPaise,
        currency: p.currency,
        status: p.status
      });
    },

    async getPlayPurchaseByTokenHash(tokenHash: string) {
      const { data } = await getService().from('play_purchases').select('*').eq('purchase_token_hash', tokenHash).maybeSingle();
      return data
        ? {
            id: data.id,
            userId: data.user_id,
            productId: data.product_id,
            acknowledged: data.acknowledged,
            rawLatestNotificationType: data.raw_latest_notification_type
          }
        : null;
    },

    async upsertPlayPurchase(p: any) {
      await getService().from('play_purchases').upsert(
        {
          user_id: p.userId,
          product_id: p.productId,
          purchase_token_hash: p.purchaseTokenHash,
          purchase_token_enc: p.purchaseTokenEnc,
          order_id: p.orderId || null,
          state: p.state,
          expiry_time: p.expiryTime || null,
          auto_renewing: Boolean(p.autoRenewing),
          acknowledged: Boolean(p.acknowledged),
          linked_purchase_token_hash: p.linkedPurchaseTokenHash || null,
          raw_latest_notification_type: p.rawLatestNotificationType || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'purchase_token_hash' }
      );
    },

    async upsertEntitlement(userId: string, ent: any) {
      const svc = getService();
      // Deactivate any previous active entitlement from another source to maintain 1 active Pro per user
      if (['active', 'grace_period'].includes(ent.status)) {
        // Retire every currently active row first (a Play renewal reuses the same token), so the
        // one-active-Pro-per-user index cannot reject the new row.
        const { error: retireError } = await svc
          .from('entitlements')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .in('status', ['active', 'grace_period']);
        if (retireError) throw new Error(retireError.message);
      }
      const { error: insertError } = await svc.from('entitlements').insert({
        user_id: userId,
        plan: ent.plan,
        status: ent.status,
        source: ent.source,
        source_ref: ent.sourceRef || null,
        includes_ai: Boolean(ent.includesAi),
        current_period_end: ent.currentPeriodEnd || null,
        updated_at: new Date().toISOString()
      });
      if (insertError) throw new Error(insertError.message);
      return this.getActiveEntitlement(userId);
    },

    async getMonthlyAiUsage(userId: string, monthKey: string) {
      const { data } = await getService()
        .from('ai_usage')
        .select('request_count')
        .eq('user_id', userId)
        .eq('month_key', monthKey)
        .maybeSingle();
      return Number(data?.request_count || 0);
    },

    async incrementMonthlyAiUsage(userId: string, monthKey: string) {
      const current = await this.getMonthlyAiUsage(userId, monthKey);
      await getService().from('ai_usage').upsert(
        { user_id: userId, month_key: monthKey, request_count: current + 1, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,month_key' }
      );
    },

    async exportFullAccountData(userId: string) {
      const c = userClient!;
      const [profile, state, sessions, plans, topics, revisions, mocks, attempts, payments, playPurchases, consents] =
        await Promise.all([
          c.from('profiles').select('*').eq('id', userId).maybeSingle(),
          c.from('user_state').select('*').eq('user_id', userId).maybeSingle(),
          c.from('sessions').select('*').eq('user_id', userId),
          c.from('user_exam_plans').select('*').eq('user_id', userId),
          c.from('user_topic_progress').select('*').eq('user_id', userId),
          c.from('revision_events').select('*').eq('user_id', userId),
          c.from('mock_tests').select('*').eq('user_id', userId),
          c.from('question_attempts').select('*').eq('user_id', userId),
          c.from('payments').select('*').eq('user_id', userId),
          c.rpc('my_play_purchases'),
          c.from('user_consents').select('*').eq('user_id', userId)
        ]);
      return {
        profile: profile.data,
        preferences: state.data?.preferences || {},
        sessions: sessions.data || [],
        plans: plans.data || [],
        topics: topics.data || [],
        revisions: revisions.data || [],
        mocks: mocks.data || [],
        questionAttempts: attempts.data || [],
        payments: payments.data || [],
        playPurchases: playPurchases.data || [],
        consents: consents.data || []
      };
    },

    async countOwnedInstitutes(userId: string) {
      const { count } = await userClient!
        .from('institutes')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', userId);
      return Number(count || 0);
    },

    async deleteUserAccountCascade(userId: string) {
      const { error } = await getService().auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    },

    async rpcAdminMetrics(_userId: string, _aal: string, days: number) {
      const { data, error } = await userClient!.rpc('admin_metrics', { p_days: days });
      if (error) throw new Error(error.message);
      return data;
    },

    async rpcSetFeatureFlag(_userId: string, _aal: string, key: string, enabled: boolean, reason: string) {
      const { data, error } = await userClient!.rpc('set_feature_flag', { p_key: key, p_enabled: enabled, p_reason: reason });
      if (error) throw new Error(error.message);
      return data;
    },

    async listAdminAuditLogs(_userId: string, _aal: string, limit: number) {
      const { data, error } = await userClient!
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data || [];
    }
  };
}

export function createGooglePlayApiClient() {
  async function getAccessToken(): Promise<string> {
    const rawJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '';
    const parsed = rawJson ? JSON.parse(rawJson) : null;
    const clientEmail = parsed?.client_email || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyPem = parsed?.private_key || (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    const assertion = signGoogleServiceAccountJwt({
      clientEmail,
      privateKeyPem,
      scope: 'https://www.googleapis.com/auth/androidpublisher'
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    });
    if (!tokenRes.ok) throw new Error(`Google OAuth token error HTTP ${tokenRes.status}`);
    const data: any = await tokenRes.json();
    return data.access_token;
  }

  return {
    async getSubscriptionV2(packageName: string, token: string) {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error(`Play subscriptionsv2 HTTP ${res.status}`);
      return res.json();
    },

    async getProductPurchase(packageName: string, productId: string, token: string) {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error(`Play products.get HTTP ${res.status}`);
      return res.json();
    },

    async acknowledgePurchase(packageName: string, productId: string, token: string) {
      const accessToken = await getAccessToken();
      const path = productId === 'lifetime'
        ? `purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`
        : `purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`;
      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/${path}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }
      );
      if (!res.ok) throw new Error(`Play acknowledge HTTP ${res.status}`);
    }
  };
}

export function createRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  return {
    async createOrder({ amountPaise, currency, receipt, notes }: any) {
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountPaise, currency, receipt, notes })
      });
      if (!res.ok) throw new Error(`Razorpay createOrder HTTP ${res.status}`);
      return res.json();
    },

    async cancelSubscription(subscriptionId: string, { cancelAtCycleEnd = true } = {}) {
      const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 })
      });
      if (!res.ok) throw new Error(`Razorpay cancel HTTP ${res.status}`);
      return res.json();
    }
  };
}

export async function callGeminiApi({ url, headers, prompt }: { url: string; headers: Record<string, string>; prompt: string }) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 120 }
    })
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const parsed: any = await res.json();
  const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty Gemini response');
  return text.slice(0, 400);
}
