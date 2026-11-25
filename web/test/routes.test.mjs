import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { InMemoryRedisStore } from '../src/lib/server/redis.mjs';
import {
  computeHmacSha256Hex,
  decryptPurchaseToken,
  encryptPurchaseToken,
  hashPurchaseToken
} from '../src/lib/server/crypto.mjs';
import { handleSync, resolveSyncWrite } from '../src/lib/server/handlers/syncHandler.mjs';
import { handleFlags, handleHealth, handleMe } from '../src/lib/server/handlers/meAndFlagsHandler.mjs';
import { handleAccountDelete, handleAccountExport } from '../src/lib/server/handlers/accountHandler.mjs';
import {
  handleRazorpayCancel,
  handleRazorpayCheckout,
  handleRazorpayVerify,
  handleRazorpayWebhook
} from '../src/lib/server/handlers/razorpayHandler.mjs';
import { handlePlayRtdn, handlePlayVerify } from '../src/lib/server/handlers/playBillingHandler.mjs';
import { handleSignedInReflections } from '../src/lib/server/handlers/reflectionsHandler.mjs';
import {
  handleAdminAuditLogs,
  handleAdminMetrics,
  handleAdminSetFlag
} from '../src/lib/server/handlers/adminHandler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncFixtures = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../shared/sync-contract-fixtures.json'), 'utf8')
);

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN_U = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TEST_TOKEN_KEY = crypto.randomBytes(32).toString('base64');

/**
 * Deterministic in-memory mock DB mirroring Tempo 4.0 Supabase RLS & constraints.
 */
function createMockDb() {
  let coreSeq = 0;
  let prepSeq = 0;

  const profiles = new Map([
    [USER_A, { user_id: USER_A, role: 'user', display_name: 'Asha', ai_opt_in: true, ai_notes_opt_in: false }],
    [USER_B, { user_id: USER_B, role: 'user', display_name: 'Bala', ai_opt_in: false, ai_notes_opt_in: false }],
    [ADMIN_U, { user_id: ADMIN_U, role: 'admin', display_name: 'Admin', ai_opt_in: true, ai_notes_opt_in: true }]
  ]);

  const entitlements = new Map([
    [USER_A, { isPro: true, plan: 'pro_monthly', status: 'active', source: 'razorpay', sourceRef: 'sub_test_1', includesAi: true, currentPeriodEnd: '2026-12-25T00:00:00.000Z' }],
    [USER_B, { isPro: false, plan: 'free', status: 'none', source: 'none', sourceRef: null, includesAi: false, currentPeriodEnd: null }]
  ]);

  const sessions = new Map(); // id -> { ...row, user_id, rev }
  const prep = new Map(); // `${table}:${id}` -> { table, row: { ...row, user_id, rev } }
  const userStates = new Map();
  const syncDevices = new Map();
  const payments = new Map();
  const playPurchases = new Map(); // tokenHash -> row
  const webhookEvents = new Set();
  const aiUsage = new Map(); // `${userId}:${month}` -> count
  const ownedInstitutes = new Map();
  const consents = new Map();
  const auditLogs = [];
  const featureFlags = {
    ai_reflections: true,
    cloud_sync: true,
    razorpay_checkout: true,
    play_billing: true
  };

  let dbHealthy = true;

  return {
    _state: {
      profiles, entitlements, sessions, prep, userStates, syncDevices,
      payments, playPurchases, webhookEvents, aiUsage, ownedInstitutes, auditLogs, featureFlags
    },
    setHealthy(v) { dbHealthy = v; },
    async ping() { return dbHealthy; },
    async hasPro(userId) { return Boolean(entitlements.get(userId)?.isPro); },
    async getProfile(userId) { return profiles.get(userId) || null; },
    async getActiveEntitlement(userId) { return entitlements.get(userId) || null; },
    async getFeatureFlags() { return { ...featureFlags }; },

    async getUserRecord(userId, table, id) {
      if (table === 'sessions') {
        const rec = sessions.get(id);
        return rec && rec.user_id === userId ? rec : null;
      }
      const rec = prep.get(`${table}:${id}`);
      return rec && rec.row.user_id === userId ? rec.row : null;
    },

    async upsertUserRecord(userId, table, row) {
      if (table === 'sessions') {
        const existing = sessions.get(row.id);
        if (existing && existing.user_id !== userId) {
          const err = new Error('RLS violation: session belongs to another user');
          err.code = 'RLS_DENIED';
          throw err;
        }
        const saved = { ...row, user_id: userId, rev: ++coreSeq };
        sessions.set(row.id, saved);
        return saved;
      }
      const key = `${table}:${row.id}`;
      const existing = prep.get(key);
      if (existing && existing.row.user_id !== userId) {
        const err = new Error('RLS violation: prep row belongs to another user');
        err.code = 'RLS_DENIED';
        throw err;
      }
      const saved = { ...row, user_id: userId, rev: ++prepSeq };
      prep.set(key, { table, row: saved });
      return saved;
    },

    async pullSessions(userId, cursor, limit) {
      return [...sessions.values()]
        .filter((r) => r.user_id === userId && r.rev > cursor)
        .sort((a, b) => a.rev - b.rev)
        .slice(0, limit);
    },

    async pullPrepEnvelopes(userId, prepCursor, limit) {
      return [...prep.values()]
        .filter((e) => e.row.user_id === userId && e.row.rev > prepCursor)
        .sort((a, b) => a.row.rev - b.row.rev)
        .slice(0, limit);
    },

    async upsertUserState(userId, preferences, updatedAt) {
      userStates.set(userId, { preferences, updatedAt });
    },
    async getUserState(userId) { return userStates.get(userId) || null; },

    async getSyncDevice(userId, deviceId) {
      return syncDevices.get(`${userId}:${deviceId}`) || null;
    },
    async upsertSyncDevice(userId, dev) {
      syncDevices.set(`${userId}:${dev.deviceId}`, dev);
    },

    async recordPayment(p) {
      const id = p.providerPaymentId || p.providerOrderId || crypto.randomUUID();
      payments.set(id, p);
      return p;
    },
    async getPaymentByProviderPaymentId(paymentId) {
      return payments.get(paymentId) || null;
    },
    async getPaymentByProviderOrderId(orderId) {
      for (const p of payments.values()) if (p.providerOrderId === orderId) return p;
      return null;
    },

    async upsertEntitlement(userId, ent) {
      const isPro = ent.isPro !== undefined
        ? Boolean(ent.isPro)
        : (['active', 'grace_period', 'canceled'].includes(ent.status) && ent.plan !== 'free');
      const saved = { ...ent, isPro };
      entitlements.set(userId, saved);
      return saved;
    },

    async recordWebhookEventIfNew(provider, eventId) {
      const k = `${provider}:${eventId}`;
      if (webhookEvents.has(k)) return false;
      webhookEvents.add(k);
      return true;
    },

    async getPlayPurchaseByTokenHash(tokenHash) {
      return playPurchases.get(tokenHash) || null;
    },
    async upsertPlayPurchase(row) {
      const saved = { id: row.id || crypto.randomUUID(), createdAt: new Date().toISOString(), ...row };
      playPurchases.set(row.purchaseTokenHash, saved);
      return saved;
    },

    async getMonthlyAiUsage(userId, monthKey) {
      return aiUsage.get(`${userId}:${monthKey}`) || 0;
    },
    async incrementMonthlyAiUsage(userId, monthKey) {
      const k = `${userId}:${monthKey}`;
      aiUsage.set(k, (aiUsage.get(k) || 0) + 1);
    },

    async exportFullAccountData(userId) {
      return {
        profile: profiles.get(userId) || null,
        preferences: userStates.get(userId)?.preferences || {},
        sessions: [...sessions.values()].filter((s) => s.user_id === userId),
        plans: [...prep.values()].filter((p) => p.table === 'user_exam_plans' && p.row.user_id === userId).map((p) => p.row),
        topics: [...prep.values()].filter((p) => p.table === 'user_topic_progress' && p.row.user_id === userId).map((p) => p.row),
        revisions: [...prep.values()].filter((p) => p.table === 'revision_events' && p.row.user_id === userId).map((p) => p.row),
        mocks: [...prep.values()].filter((p) => p.table === 'mock_tests' && p.row.user_id === userId).map((p) => p.row),
        questionAttempts: [...prep.values()].filter((p) => p.table === 'question_attempts' && p.row.user_id === userId).map((p) => p.row),
        payments: [...payments.values()].filter((p) => p.userId === userId),
        playPurchases: [...playPurchases.values()].filter((p) => p.userId === userId),
        consents: consents.get(userId) || []
      };
    },

    async countOwnedInstitutes(userId) {
      return ownedInstitutes.get(userId) || 0;
    },
    async deleteUserAccountCascade(userId) {
      profiles.delete(userId);
      entitlements.delete(userId);
      userStates.delete(userId);
      for (const [id, s] of sessions.entries()) { if (s.user_id === userId) sessions.delete(id); }
      for (const [k, p] of prep.entries()) { if (p.row.user_id === userId) prep.delete(k); }
      for (const [k, p] of playPurchases.entries()) { if (p.userId === userId) playPurchases.delete(k); }
    },

    async rpcAdminMetrics(actorId, aal, days) {
      if (profiles.get(actorId)?.role !== 'admin' || aal !== 'aal2') throw new Error('MFA_REQUIRED');
      return { days, activeUsers: profiles.size, proUsers: 1, totalSessions: sessions.size };
    },
    async rpcSetFeatureFlag(actorId, aal, key, enabled, reason) {
      if (profiles.get(actorId)?.role !== 'admin' || aal !== 'aal2') throw new Error('MFA_REQUIRED');
      featureFlags[key] = enabled;
      auditLogs.push({ actorId, action: 'set_feature_flag', target: key, enabled, reason, createdAt: new Date().toISOString() });
      return { key, enabled };
    },
    async listAdminAuditLogs(actorId, aal, limit) {
      if (profiles.get(actorId)?.role !== 'admin' || aal !== 'aal2') throw new Error('MFA_REQUIRED');
      return auditLogs.slice(0, limit);
    }
  };
}

function makeGoogleOidcJwt({ privateKey, kid = 'google-kid-1', claims }) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  const header = b64({ alg: 'RS256', typ: 'JWT', kid });
  const payload = b64(claims);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`, 'utf8'), privateKey).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

// =========================================================================
// 1. SHARED SYNC CONTRACT FIXTURES, CONFLICTS, PAGING & CROSS-USER ISOLATION
// =========================================================================
test('POST /api/sync satisfies shared/sync-contract-fixtures.json and idempotent replay', async () => {
  const db = createMockDb();
  const redis = new InMemoryRedisStore();
  const logs = [];
  const fixture = syncFixtures.cases[0];
  const fixedNow = Date.parse('2026-11-24T10:41:00.000Z');

  // First push + pull
  const res1 = await handleSync({
    auth: { userId: USER_A },
    body: fixture.request,
    db,
    redis,
    nowMs: fixedNow,
    logSink: (l) => logs.push(l)
  });

  assert.equal(res1.status, 200);
  assert.deepEqual(res1.body.accepted.filter((a) => a.table === 'sessions').map((a) => a.id), fixture.expected.acceptedSessionIds);
  assert.deepEqual(res1.body.accepted.filter((a) => a.table !== 'sessions').map((a) => a.id), fixture.expected.acceptedPrepIds);
  assert.equal(res1.body.rejectedSessions.length, 0);
  assert.equal(res1.body.rejectedPrep.length, 0);
  assert.equal(res1.body.more, false);
  assert.ok(res1.body.cursor > 0);
  assert.ok(res1.body.prepCursor > 0);

  // Idempotent replay with same timestamps does not bump revisions
  const prevCursor = res1.body.cursor;
  const prevPrepCursor = res1.body.prepCursor;
  const res2 = await handleSync({
    auth: { userId: USER_A },
    body: { ...fixture.request, cursor: prevCursor, prepCursor: prevPrepCursor },
    db,
    redis,
    nowMs: fixedNow
  });
  assert.equal(res2.status, 200);
  assert.equal(res2.body.cursor, prevCursor);
  assert.equal(res2.body.prepCursor, prevPrepCursor);
  assert.equal(res2.body.sessions.length, 0);
  assert.equal(res2.body.prep.length, 0);
  assert.ok(res2.body.accepted.every((a) => a.status === 'NO_OP'));

  // Future timestamp > +5 min rejected
  const futureCase = syncFixtures.cases[1];
  const futureIso = new Date(fixedNow + futureCase.futureOffsetMinutes * 60_000).toISOString();
  const resFuture = await handleSync({
    auth: { userId: USER_A },
    body: {
      cursor: prevCursor,
      prepCursor: prevPrepCursor,
      sessions: [{ ...fixture.request.sessions[0], id: crypto.randomUUID(), updatedAt: futureIso }]
    },
    db,
    redis,
    nowMs: fixedNow
  });
  assert.equal(resFuture.status, 200);
  assert.equal(resFuture.body.rejectedSessions.length, 1);
  assert.equal(resFuture.body.rejectedSessions[0].code, futureCase.expectedRejectionCode);

  // Tie-break tombstone wins fixture
  const tieCase = syncFixtures.cases[2];
  assert.equal(resolveSyncWrite(tieCase.local, tieCase.remote.updatedAt, tieCase.remote.deletedAt), 'APPLY');

  // Newer timestamp wins fixture
  const newerCase = syncFixtures.cases[3];
  assert.equal(resolveSyncWrite(newerCase.local, newerCase.remote.updatedAt, newerCase.remote.deletedAt), 'APPLY');
  assert.equal(resolveSyncWrite(newerCase.remote, newerCase.local.updatedAt, newerCase.local.deletedAt), 'IGNORE_STALE');
});

test('POST /api/sync enforces Pro gate for writes, cross-user isolation, and 500-row paging with `more`', async () => {
  const db = createMockDb();
  const redis = new InMemoryRedisStore();
  const nowMs = Date.now();

  // Free user (USER_B) cannot push writes -> 403 PRO_REQUIRED
  const resFreeWrite = await handleSync({
    auth: { userId: USER_B },
    body: {
      cursor: 0,
      prepCursor: 0,
      sessions: [{
        id: crypto.randomUUID(),
        startedAt: new Date(nowMs - 10000).toISOString(),
        subject: 'Math',
        energy: 3,
        plannedMinutes: 25,
        updatedAt: new Date(nowMs).toISOString()
      }]
    },
    db,
    redis,
    nowMs
  });
  assert.equal(resFreeWrite.status, 403);
  assert.equal(resFreeWrite.body.code, 'PRO_REQUIRED');

  // Upgrade USER_B to Pro and attempt to overwrite USER_A's session ID -> rejected via RLS_DENIED
  const sharedId = crypto.randomUUID();
  await db.upsertUserRecord(USER_A, 'sessions', {
    id: sharedId,
    startedAt: new Date(nowMs - 60000).toISOString(),
    subject: 'User A Private',
    energy: 4,
    plannedMinutes: 30,
    updatedAt: new Date(nowMs - 5000).toISOString(),
    deletedAt: null
  });
  await db.upsertEntitlement(USER_B, { plan: 'pro_monthly', status: 'active', source: 'play', sourceRef: 'tok-b', includesAi: true });

  const resCollision = await handleSync({
    auth: { userId: USER_B },
    body: {
      cursor: 0,
      prepCursor: 0,
      sessions: [{
        id: sharedId,
        startedAt: new Date(nowMs - 10000).toISOString(),
        phase: 'focus',
        subject: 'Hijack Attempt',
        energy: 5,
        plannedMinutes: 45,
        actualSeconds: 2700,
        status: 'completed',
        updatedAt: new Date(nowMs).toISOString()
      }]
    },
    db,
    redis,
    nowMs
  });
  assert.equal(resCollision.status, 200);
  assert.equal(resCollision.body.rejectedSessions.length, 1);
  assert.equal(resCollision.body.rejectedSessions[0].code, 'RLS_DENIED');
  assert.equal(resCollision.body.sessions.length, 0, 'USER_B must never pull USER_A sessions');

  // Seed 520 sessions for USER_A -> first pull returns 500 with more=true; second pull returns remaining with more=false
  for (let i = 0; i < 520; i++) {
    await db.upsertUserRecord(USER_A, 'sessions', {
      id: crypto.randomUUID(),
      startedAt: new Date(nowMs - 60000).toISOString(),
      subject: `S${i}`,
      energy: 3,
      plannedMinutes: 25,
      updatedAt: new Date(nowMs).toISOString(),
      deletedAt: null
    });
  }

  const page1 = await handleSync({ auth: { userId: USER_A }, body: { cursor: 0, prepCursor: 0 }, db, redis, nowMs });
  assert.equal(page1.status, 200);
  assert.equal(page1.body.sessions.length, 500);
  assert.equal(page1.body.more, true);

  const page2 = await handleSync({ auth: { userId: USER_A }, body: { cursor: page1.body.cursor, prepCursor: 0 }, db, redis, nowMs });
  assert.equal(page2.status, 200);
  assert.equal(page2.body.sessions.length, 21); // 1 initial + 520 seeded - 500
  assert.equal(page2.body.more, false);
});

// =========================================================================
// 2. RAZORPAY CHECKOUT, VERIFY, WEBHOOK & CANCEL
// =========================================================================
test('Razorpay billing enforces server prices, HMAC-SHA256 verify, webhook idempotency, cancel & refund', async () => {
  const db = createMockDb();
  const redis = new InMemoryRedisStore();
  const keySecret = 'rzp_test_secret_12345';
  const webhookSecret = 'whsec_test_98765';
  const razorpayCalls = [];
  const razorpayClient = {
    async createOrder(args) {
      razorpayCalls.push(args);
      return { id: 'order_test_001' };
    },
    async cancelSubscription(subId, opts) {
      razorpayCalls.push({ cancel: subId, ...opts });
      return { status: 'cancelled' };
    }
  };

  // Checkout uses server price (cannot be overridden by client)
  const chk = await handleRazorpayCheckout({
    auth: { userId: USER_B },
    body: { plan: 'pro_annual' },
    db,
    redis,
    razorpayClient,
    razorpayKeyId: 'rzp_test_key'
  });
  assert.equal(chk.status, 200);
  assert.equal(chk.body.amountPaise, 149900);
  assert.equal(razorpayCalls[0].amountPaise, 149900);

  // Reject extra client amount field
  const badChk = await handleRazorpayCheckout({
    auth: { userId: USER_B },
    body: { plan: 'pro_annual', amountPaise: 100 },
    db,
    redis,
    razorpayClient
  });
  assert.equal(badChk.status, 400);

  // Verify with bad signature -> 400
  const badSig = await handleRazorpayVerify({
    auth: { userId: USER_B },
    body: {
      razorpay_order_id: 'order_test_001',
      razorpay_payment_id: 'pay_test_001',
      razorpay_signature: 'deadbeef',
      plan: 'pro_annual'
    },
    db,
    redis,
    razorpayKeySecret: keySecret
  });
  assert.equal(badSig.status, 400);
  assert.equal(badSig.body.code, 'INVALID_SIGNATURE');

  // A real, correctly signed payment cannot be upgraded to a dearer plan than the order.
  const monthly = await handleRazorpayCheckout({ auth: { userId: USER_A }, body: { plan: 'pro_monthly' }, db, redis,
    razorpayClient: { async createOrder() { return { id: 'order_cheap_001' }; } }, razorpayKeyId: 'rzp_test_key' });
  assert.equal(monthly.status, 200);
  const cheapSig = computeHmacSha256Hex('order_cheap_001|pay_cheap_001', keySecret);
  const upgrade = await handleRazorpayVerify({ auth: { userId: USER_A }, db, redis, razorpayKeySecret: keySecret,
    body: { razorpay_order_id: 'order_cheap_001', razorpay_payment_id: 'pay_cheap_001', razorpay_signature: cheapSig, plan: 'lifetime' } });
  assert.equal(upgrade.status, 400);
  assert.equal(upgrade.body.code, 'PLAN_MISMATCH');
  // Someone else's order cannot be verified onto your account.
  const foreign = await handleRazorpayVerify({ auth: { userId: USER_B }, db, redis, razorpayKeySecret: keySecret,
    body: { razorpay_order_id: 'order_cheap_001', razorpay_payment_id: 'pay_cheap_002', razorpay_signature: computeHmacSha256Hex('order_cheap_001|pay_cheap_002', keySecret) } });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.body.code, 'ORDER_NOT_FOUND');

  // Verify with valid HMAC-SHA256 signature -> 200 & grants Pro
  const validSig = computeHmacSha256Hex('order_test_001|pay_test_001', keySecret);
  const okVer = await handleRazorpayVerify({
    auth: { userId: USER_B },
    body: {
      razorpay_order_id: 'order_test_001',
      razorpay_payment_id: 'pay_test_001',
      razorpay_signature: validSig,
      plan: 'pro_annual'
    },
    db,
    redis,
    razorpayKeySecret: keySecret
  });
  assert.equal(okVer.status, 200);
  assert.equal(okVer.body.verified, true);
  assert.equal((await db.getActiveEntitlement(USER_B)).isPro, true);

  // Replay same payment by same user -> idempotentReplay: true
  const replayVer = await handleRazorpayVerify({
    auth: { userId: USER_B },
    body: {
      razorpay_order_id: 'order_test_001',
      razorpay_payment_id: 'pay_test_001',
      razorpay_signature: validSig,
      plan: 'pro_annual'
    },
    db,
    redis,
    razorpayKeySecret: keySecret
  });
  assert.equal(replayVer.status, 200);
  assert.equal(replayVer.body.idempotentReplay, true);

  // Buying again before the pass ends extends it instead of throwing away the remaining days.
  const firstEnd = Date.parse((await db.getActiveEntitlement(USER_B)).currentPeriodEnd);
  const again = await handleRazorpayCheckout({ auth: { userId: USER_B }, body: { plan: 'pro_annual' }, db, redis,
    razorpayClient: { async createOrder() { return { id: 'order_test_002' }; } }, razorpayKeyId: 'rzp_test_key' });
  assert.equal(again.status, 200);
  const renew = await handleRazorpayVerify({ auth: { userId: USER_B }, db, redis, razorpayKeySecret: keySecret,
    body: { razorpay_order_id: 'order_test_002', razorpay_payment_id: 'pay_test_002', razorpay_signature: computeHmacSha256Hex('order_test_002|pay_test_002', keySecret) } });
  assert.equal(renew.status, 200);
  const secondEnd = Date.parse((await db.getActiveEntitlement(USER_B)).currentPeriodEnd);
  assert.equal(secondEnd - firstEnd, 366 * 86400_000);

  // Replay same payment by DIFFERENT user -> 409 PAYMENT_OWNERSHIP_CONFLICT
  const hijackVer = await handleRazorpayVerify({
    auth: { userId: USER_A },
    body: {
      razorpay_order_id: 'order_test_001',
      razorpay_payment_id: 'pay_test_001',
      razorpay_signature: validSig,
      plan: 'pro_annual'
    },
    db,
    redis,
    razorpayKeySecret: keySecret
  });
  assert.equal(hijackVer.status, 409);

  // Webhook bad signature -> 401
  const rawRefund = JSON.stringify({
    id: 'evt_refund_1',
    event: 'payment.refunded',
    payload: { payment: { entity: { id: 'pay_test_001', notes: { userId: USER_B, plan: 'pro_annual' } } } }
  });
  const badWh = await handleRazorpayWebhook({ rawBody: rawRefund, signatureHeader: 'invalid', db, webhookSecret });
  assert.equal(badWh.status, 401);

  // Webhook valid refund -> revokes Pro immediately; duplicate webhook -> replayed: true
  const whSig = computeHmacSha256Hex(rawRefund, webhookSecret);
  const okWh = await handleRazorpayWebhook({ rawBody: rawRefund, signatureHeader: whSig, db, webhookSecret });
  assert.equal(okWh.status, 200);
  assert.equal((await db.getActiveEntitlement(USER_B)).isPro, false);

  const dupWh = await handleRazorpayWebhook({ rawBody: rawRefund, signatureHeader: whSig, db, webhookSecret });
  assert.equal(dupWh.status, 200);
  assert.equal(dupWh.body.replayed, true);

  // Cancel active Razorpay subscription for USER_A
  const cancelRes = await handleRazorpayCancel({ auth: { userId: USER_A }, db, razorpayClient });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.canceledAtPeriodEnd, true);
});

// =========================================================================
// 3. GOOGLE PLAY BILLING VERIFY & RTDN (OIDC RSA-2048 VERIFICATION)
// =========================================================================
test('Google Play verify enforces package/product checks, AES-256-GCM token encryption, ack, and anti-hijack 409', async () => {
  const db = createMockDb();
  const redis = new InMemoryRedisStore();
  const token = 'play-purchase-token-super-secret-0001';
  let ackCount = 0;

  const playApi = {
    async getSubscriptionV2() {
      return {
        packageName: 'com.tempo.focus',
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        latestOrderId: 'GPA.1234-5678',
        lineItems: [{ productId: 'pro_monthly', expiryTime: '2027-01-01T00:00:00.000Z', autoRenewingPlan: { autoRenewEnabled: true } }]
      };
    },
    async acknowledgePurchase() { ackCount += 1; }
  };

  // Valid verify acknowledges and grants Pro
  const res = await handlePlayVerify({
    auth: { userId: USER_B },
    body: { productId: 'pro_monthly', purchaseToken: token, orderId: 'GPA.1234-5678' },
    db,
    redis,
    playApi,
    tokenEncryptionKey: TEST_TOKEN_KEY
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.verified, true);
  assert.equal(res.body.acknowledged, true);
  assert.equal(ackCount, 1);

  // Verify token is stored encrypted and decrypts back accurately
  const stored = await db.getPlayPurchaseByTokenHash(hashPurchaseToken(token));
  assert.ok(stored);
  assert.notEqual(stored.purchaseTokenEnc, token);
  assert.equal(decryptPurchaseToken(stored.purchaseTokenEnc, TEST_TOKEN_KEY), token);

  // Replay by same user is idempotent and does NOT re-acknowledge
  const replay = await handlePlayVerify({
    auth: { userId: USER_B },
    body: { productId: 'pro_monthly', purchaseToken: token },
    db,
    redis,
    playApi,
    tokenEncryptionKey: TEST_TOKEN_KEY
  });
  assert.equal(replay.status, 200);
  assert.equal(ackCount, 1);

  // Another user attempting to reuse same purchaseToken -> 409 TOKEN_OWNED_BY_ANOTHER_USER
  const steal = await handlePlayVerify({
    auth: { userId: USER_A },
    body: { productId: 'pro_monthly', purchaseToken: token },
    db,
    redis,
    playApi,
    tokenEncryptionKey: TEST_TOKEN_KEY
  });
  assert.equal(steal.status, 409);
  assert.equal(steal.body.code, 'TOKEN_OWNED_BY_ANOTHER_USER');

  // Wrong packageName -> 403
  const wrongPkg = await handlePlayVerify({
    auth: { userId: USER_A },
    body: { productId: 'pro_monthly', purchaseToken: 'other-valid-token-99999' },
    db,
    redis,
    playApi: {
      async getSubscriptionV2() { return { packageName: 'com.fake.app', subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }; }
    },
    tokenEncryptionKey: TEST_TOKEN_KEY
  });
  assert.equal(wrongPkg.status, 403);
  assert.equal(wrongPkg.body.code, 'PACKAGE_MISMATCH');

  // Product mismatch -> 400
  const wrongProd = await handlePlayVerify({
    auth: { userId: USER_A },
    body: { productId: 'pro_annual', purchaseToken: 'other-valid-token-88888' },
    db,
    redis,
    playApi,
    tokenEncryptionKey: TEST_TOKEN_KEY
  });
  assert.equal(wrongProd.status, 400);
  assert.equal(wrongProd.body.code, 'PRODUCT_MISMATCH');

  // Pending lifetime purchase does NOT grant Pro or acknowledge
  const pendingLifetime = await handlePlayVerify({
    auth: { userId: USER_A },
    body: { productId: 'lifetime', purchaseToken: 'lifetime-pending-token-777' },
    db,
    redis,
    playApi: {
      async getProductPurchase() { return { packageName: 'com.tempo.focus', productId: 'lifetime', purchaseState: 2 }; },
      async acknowledgePurchase() { throw new Error('Should not acknowledge pending purchase'); }
    },
    tokenEncryptionKey: TEST_TOKEN_KEY
  });
  assert.equal(pendingLifetime.status, 200);
  assert.equal(pendingLifetime.body.verified, false);
  assert.equal(pendingLifetime.body.state, 'pending');
});

test('Google Play RTDN verifies RS256 OIDC JWT, re-fetches Play API, updates lifecycle states, and deduplicates replays', async () => {
  const db = createMockDb();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const nowSec = Math.floor(Date.now() / 1000);
  const oidcConfig = {
    expectedAudience: 'https://tempo.example.com/api/billing/play/rtdn',
    expectedEmail: 'pubsub-push@tempo-prod.iam.gserviceaccount.com',
    publicKeysByKid: { 'google-kid-1': publicKey }
  };

  const purchaseToken = 'rtdn-linked-purchase-token-12345';
  const tokenHash = hashPurchaseToken(purchaseToken);
  await db.upsertPlayPurchase({
    userId: USER_B,
    productId: 'pro_monthly',
    purchaseTokenHash: tokenHash,
    purchaseTokenEnc: encryptPurchaseToken(purchaseToken, TEST_TOKEN_KEY),
    state: 'active',
    acknowledged: true
  });

  const makePubSubBody = (messageId, payloadObj) => ({
    message: {
      messageId,
      data: Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64')
    }
  });

  const validClaims = {
    iss: 'https://accounts.google.com',
    aud: oidcConfig.expectedAudience,
    email: oidcConfig.expectedEmail,
    email_verified: true,
    iat: nowSec - 10,
    exp: nowSec + 300
  };

  // Bad OIDC audience -> 401
  const badAudJwt = makeGoogleOidcJwt({ privateKey, claims: { ...validClaims, aud: 'https://evil.example.com' } });
  const resBadAud = await handlePlayRtdn({
    authorizationHeader: `Bearer ${badAudJwt}`,
    body: makePubSubBody('msg-1', { packageName: 'com.tempo.focus', testNotification: {} }),
    db,
    playApi: {},
    oidcConfig
  });
  assert.equal(resBadAud.status, 401);
  assert.equal(resBadAud.body.code, 'INVALID_OIDC_AUDIENCE');

  // Expired OIDC JWT -> 401
  const expiredJwt = makeGoogleOidcJwt({ privateKey, claims: { ...validClaims, exp: nowSec - 10 } });
  const resExp = await handlePlayRtdn({
    authorizationHeader: `Bearer ${expiredJwt}`,
    body: makePubSubBody('msg-2', { packageName: 'com.tempo.focus', testNotification: {} }),
    db,
    playApi: {},
    oidcConfig
  });
  assert.equal(resExp.status, 401);
  assert.equal(resExp.body.code, 'OIDC_TOKEN_EXPIRED');

  // Valid OIDC JWT for SUBSCRIPTION_ON_HOLD -> re-fetches Play API & revokes Pro
  const validJwt = makeGoogleOidcJwt({ privateKey, claims: validClaims });
  let fetchedFromPlay = 0;
  const playApiHold = {
    async getSubscriptionV2() {
      fetchedFromPlay += 1;
      return {
        subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD',
        lineItems: [{ productId: 'pro_monthly', expiryTime: '2026-11-20T00:00:00.000Z' }]
      };
    }
  };

  const rtdnBody = makePubSubBody('msg-hold-001', {
    packageName: 'com.tempo.focus',
    subscriptionNotification: { notificationType: 5, purchaseToken, subscriptionId: 'pro_monthly' }
  });
  const resHold = await handlePlayRtdn({
    authorizationHeader: `Bearer ${validJwt}`,
    body: rtdnBody,
    db,
    playApi: playApiHold,
    oidcConfig
  });
  assert.equal(resHold.status, 200);
  assert.equal(fetchedFromPlay, 1, 'RTDN must re-fetch state from Google Play API');
  assert.equal(resHold.body.state, 'account_hold');
  assert.equal((await db.getActiveEntitlement(USER_B)).isPro, false);

  // Replaying exact Pub/Sub messageId is idempotent and does NOT call Play API again
  const resReplay = await handlePlayRtdn({
    authorizationHeader: `Bearer ${validJwt}`,
    body: rtdnBody,
    db,
    playApi: playApiHold,
    oidcConfig
  });
  assert.equal(resReplay.status, 200);
  assert.equal(resReplay.body.replayed, true);
  assert.equal(fetchedFromPlay, 1);

  // Recovered subscription restores Pro
  const resRecovered = await handlePlayRtdn({
    authorizationHeader: `Bearer ${validJwt}`,
    body: makePubSubBody('msg-recover-002', {
      packageName: 'com.tempo.focus',
      subscriptionNotification: { notificationType: 1, purchaseToken, subscriptionId: 'pro_monthly' }
    }),
    db,
    playApi: {
      async getSubscriptionV2() {
        return {
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems: [{ productId: 'pro_monthly', expiryTime: '2027-02-01T00:00:00.000Z' }]
        };
      }
    },
    oidcConfig
  });
  assert.equal(resRecovered.status, 200);
  assert.equal((await db.getActiveEntitlement(USER_B)).isPro, true);

  // Voided purchase immediately revokes Pro
  const resVoided = await handlePlayRtdn({
    authorizationHeader: `Bearer ${validJwt}`,
    body: makePubSubBody('msg-void-003', {
      packageName: 'com.tempo.focus',
      voidedPurchaseNotification: { purchaseToken, orderId: 'GPA.1234' }
    }),
    db,
    playApi: { async getSubscriptionV2() { return { subscriptionState: 'SUBSCRIPTION_STATE_REVOKED' }; } },
    oidcConfig
  });
  assert.equal(resVoided.status, 200);
  assert.equal(resVoided.body.state, 'voided');
  assert.equal((await db.getActiveEntitlement(USER_B)).isPro, false);
});

// =========================================================================
// 4. REFLECTIONS 8-STEP GATE ORDER, NOTES REDACTION & x-goog-api-key
// =========================================================================
test('POST /api/reflections enforces exact 8-step gate order, notes opt-in, PII redaction, and x-goog-api-key header', async () => {
  const db = createMockDb();
  const redis = new InMemoryRedisStore();
  const validBody = {
    includeNotes: true,
    sessions: [{ subject: 'Organic Chemistry', energy: 4, plannedMinutes: 35, note: 'Reach me at me@test.in or 9876543210; strong focus' }]
  };

  // Gate 1: Signed in
  assert.equal((await handleSignedInReflections({ auth: null, body: validBody, db, redis, geminiApiKey: 'k' })).status, 401);

  // Gate 2: Plan includes AI (USER_B is free)
  const g2 = await handleSignedInReflections({ auth: { userId: USER_B }, body: validBody, db, redis, geminiApiKey: 'k' });
  assert.equal(g2.status, 403);
  assert.equal(g2.body.code, 'PLAN_NO_AI');

  // Gate 3: User opted in
  db._state.profiles.get(USER_A).ai_opt_in = false;
  const g3 = await handleSignedInReflections({ auth: { userId: USER_A }, body: validBody, db, redis, geminiApiKey: 'k' });
  assert.equal(g3.status, 403);
  assert.equal(g3.body.code, 'AI_OPT_IN_REQUIRED');
  db._state.profiles.get(USER_A).ai_opt_in = true;

  // Gate 4: Feature flag enabled
  db._state.featureFlags.ai_reflections = false;
  const g4 = await handleSignedInReflections({ auth: { userId: USER_A }, body: validBody, db, redis, geminiApiKey: 'k' });
  assert.equal(g4.status, 503);
  assert.equal(g4.body.code, 'FEATURE_DISABLED');
  db._state.featureFlags.ai_reflections = true;

  // Gate 5: Gemini key configured
  const g5 = await handleSignedInReflections({ auth: { userId: USER_A }, body: validBody, db, redis, geminiApiKey: '' });
  assert.equal(g5.status, 503);
  assert.equal(g5.body.code, 'AI_UNAVAILABLE');

  // Success with notes opt-in FALSE: note excluded + x-goog-api-key header verified
  const geminiCalls = [];
  const callGemini = async (req) => { geminiCalls.push(req); return 'Solid 35m Organic Chemistry focus.'; };
  const okNoNotes = await handleSignedInReflections({
    auth: { userId: USER_A },
    body: validBody,
    db,
    redis,
    geminiApiKey: 'fake-gemini-key',
    burstLimit: 2,
    monthlyQuota: 3,
    globalDailyCap: 5,
    callGemini
  });
  assert.equal(okNoNotes.status, 200);
  assert.equal(okNoNotes.body.notesIncluded, false);
  assert.ok(!geminiCalls[0].url.includes('key='));
  assert.equal(geminiCalls[0].headers['x-goog-api-key'], 'fake-gemini-key');
  assert.ok(!geminiCalls[0].prompt.includes('strong focus'));

  // Enable notes opt-in -> note included AND PII redacted
  db._state.profiles.get(USER_A).ai_notes_opt_in = true;
  const okWithNotes = await handleSignedInReflections({
    auth: { userId: USER_A },
    body: validBody,
    db,
    redis,
    geminiApiKey: 'fake-gemini-key',
    burstLimit: 2,
    monthlyQuota: 3,
    globalDailyCap: 5,
    callGemini
  });
  assert.equal(okWithNotes.status, 200);
  assert.equal(okWithNotes.body.notesIncluded, true);
  assert.ok(geminiCalls[1].prompt.includes('strong focus'));
  assert.ok(!geminiCalls[1].prompt.includes('me@test.in'));
  assert.ok(!geminiCalls[1].prompt.includes('9876543210'));

  // Gate 6: Burst rate limit (3rd call exceeds burstLimit=2)
  const g6 = await handleSignedInReflections({
    auth: { userId: USER_A },
    body: validBody,
    db,
    redis,
    geminiApiKey: 'fake-gemini-key',
    burstLimit: 2,
    monthlyQuota: 3,
    globalDailyCap: 5,
    callGemini
  });
  assert.equal(g6.status, 429);
  assert.equal(g6.body.code, 'RATE_LIMITED');

  // Gate 7: Monthly quota exceeded (fresh Redis so burst passes)
  const freshRedis = new InMemoryRedisStore();
  const g7 = await handleSignedInReflections({
    auth: { userId: USER_A },
    body: validBody,
    db,
    redis: freshRedis,
    geminiApiKey: 'fake-gemini-key',
    burstLimit: 10,
    monthlyQuota: 2, // already used 2 above
    globalDailyCap: 5,
    callGemini
  });
  assert.equal(g7.status, 429);
  assert.equal(g7.body.code, 'MONTHLY_QUOTA_EXCEEDED');

  // Gate 8: Global daily spend cap
  const g8 = await handleSignedInReflections({
    auth: { userId: USER_A },
    body: validBody,
    db,
    redis: freshRedis,
    geminiApiKey: 'fake-gemini-key',
    burstLimit: 10,
    monthlyQuota: 50,
    globalDailyCap: 0,
    callGemini
  });
  assert.equal(g8.status, 503);
  assert.equal(g8.body.code, 'GLOBAL_BUDGET_EXCEEDED');
});

// =========================================================================
// 5. ACCOUNT EXPORT & DELETE, ADMIN MFA, ME, FLAGS & HEALTH
// =========================================================================
test('Account export omits purchase tokens and account delete enforces confirmation, institute check, Razorpay cancel, and Play notice', async () => {
  const db = createMockDb();
  const redis = new InMemoryRedisStore();

  await db.upsertPlayPurchase({
    userId: USER_A,
    productId: 'pro_monthly',
    purchaseTokenHash: 'hash-secret',
    purchaseTokenEnc: 'encrypted-secret-blob',
    orderId: 'GPA.999',
    state: 'active'
  });

  // Export must NEVER contain purchaseTokenEnc or purchaseTokenHash
  const exp = await handleAccountExport({ auth: { userId: USER_A, email: 'asha@example.com' }, db, redis });
  assert.equal(exp.status, 200);
  const serialized = JSON.stringify(exp.body);
  assert.ok(!serialized.includes('encrypted-secret-blob'));
  assert.ok(!serialized.includes('hash-secret'));
  assert.equal(exp.body.purchasesSummary.googlePlayPurchases.length, 1);

  // Delete without "DELETE" -> 400
  const badDel = await handleAccountDelete({ auth: { userId: USER_A }, body: { confirmation: 'delete' }, db, redis });
  assert.equal(badDel.status, 400);

  // Delete while owning an institute -> 409
  db._state.ownedInstitutes.set(USER_A, 1);
  const instDel = await handleAccountDelete({ auth: { userId: USER_A }, body: { confirmation: 'DELETE' }, db, redis });
  assert.equal(instDel.status, 409);
  assert.equal(instDel.body.code, 'INSTITUTE_OWNER_MUST_TRANSFER');
  db._state.ownedInstitutes.set(USER_A, 0);

  // Delete cancels active Razorpay subscription and cascades
  let canceledSub = null;
  const okDel = await handleAccountDelete({
    auth: { userId: USER_A },
    body: { confirmation: 'DELETE' },
    db,
    redis,
    razorpayClient: { async cancelSubscription(id) { canceledSub = id; } }
  });
  assert.equal(okDel.status, 200);
  assert.equal(okDel.body.deleted, true);
  assert.equal(okDel.body.razorpaySubscriptionCanceled, true);
  assert.equal(canceledSub, 'sub_test_1');
  assert.equal(await db.getProfile(USER_A), null);

  // Delete with active Play sub includes Play cancellation notice
  await db.upsertEntitlement(USER_B, { plan: 'pro_monthly', status: 'active', source: 'play', sourceRef: 'tok-b', includesAi: true });
  const playDel = await handleAccountDelete({ auth: { userId: USER_B }, body: { confirmation: 'DELETE' }, db, redis });
  assert.equal(playDel.status, 200);
  assert.ok(playDel.body.playCancelNotice?.includes('Google Play Store'));
});

test('Admin routes require admin role + aal2 MFA and record audit logs', async () => {
  const db = createMockDb();

  // Regular user -> 403 ADMIN_REQUIRED
  const nonAdmin = await handleAdminMetrics({ auth: { userId: USER_A, aal: 'aal2' }, db });
  assert.equal(nonAdmin.status, 403);
  assert.equal(nonAdmin.body.code, 'ADMIN_REQUIRED');

  // Admin with aal1 -> 403 MFA_REQUIRED
  const aal1 = await handleAdminMetrics({ auth: { userId: ADMIN_U, aal: 'aal1' }, db });
  assert.equal(aal1.status, 403);
  assert.equal(aal1.body.code, 'MFA_REQUIRED');

  // Admin with aal2 -> 200 & sets flag + writes audit row
  const metricsOk = await handleAdminMetrics({ auth: { userId: ADMIN_U, aal: 'aal2' }, days: 14, db });
  assert.equal(metricsOk.status, 200);
  assert.equal(metricsOk.body.metrics.days, 14);

  const flagOk = await handleAdminSetFlag({
    auth: { userId: ADMIN_U, aal: 'aal2' },
    body: { key: 'ai_reflections', enabled: false, reason: 'cost spike mitigation' },
    db
  });
  assert.equal(flagOk.status, 200);

  const auditOk = await handleAdminAuditLogs({ auth: { userId: ADMIN_U, aal: 'aal2' }, db });
  assert.equal(auditOk.status, 200);
  assert.equal(auditOk.body.logs.length, 1);
  assert.equal(auditOk.body.logs[0].target, 'ai_reflections');
});

test('GET /api/me, /api/flags, and /api/health return platform payment methods, cache headers, security headers, and no versions', async () => {
  const db = createMockDb();

  const meAndroid = await handleMe({ auth: { userId: USER_A, email: 'asha@example.com' }, platform: 'android', db });
  assert.equal(meAndroid.status, 200);
  assert.deepEqual(meAndroid.body.paymentMethods, ['google_play']);
  assert.ok(meAndroid.headers['Strict-Transport-Security']);
  assert.equal(meAndroid.headers['X-Content-Type-Options'], 'nosniff');

  const meWeb = await handleMe({ auth: { userId: USER_A, email: 'asha@example.com' }, platform: 'web', db });
  assert.deepEqual(meWeb.body.paymentMethods, ['razorpay']);

  const flagsRes = await handleFlags({ db });
  assert.equal(flagsRes.status, 200);
  assert.ok(flagsRes.headers['Cache-Control'].includes('max-age=300'));

  const healthOk = await handleHealth({ db });
  assert.equal(healthOk.status, 200);
  assert.equal(healthOk.body.status, 'ok');
  assert.equal(healthOk.body.version, undefined);
  assert.equal(healthOk.body.postgresVersion, undefined);

  db.setHealthy(false);
  const healthDown = await handleHealth({ db });
  assert.equal(healthDown.status, 503);
  assert.equal(healthDown.body.database, 'unreachable');
});
