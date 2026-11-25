/**
 * Executable Local HTTP Load Test for Tempo 4.0 POST /api/sync
 *
 * Drives 50 concurrent users × 200 session records (push + pull = 100 HTTP requests,
 * 10,000 synced records) against a real Node HTTP server executing `handleSync` +
 * `InMemoryRedisStore` + realistic in-memory DB latency simulation.
 *
 * Run:
 *   node loadtest/run-sync-load.mjs
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { handleSync } from '../web/src/lib/server/handlers/syncHandler.mjs';
import { InMemoryRedisStore } from '../web/src/lib/server/redis.mjs';

const CONCURRENT_USERS = 50;
const RECORDS_PER_USER = 200;
const P95_BUDGET_MS = 800;

function createLoadTestDb() {
  let seq = 0;
  const sessions = new Map();
  const userStates = new Map();
  const devices = new Map();

  return {
    async hasPro() { return true; },
    async getUserRecord(userId, table, id) {
      const r = sessions.get(id);
      return r && r.user_id === userId ? r : null;
    },
    async upsertUserRecord(userId, table, row) {
      const saved = { ...row, user_id: userId, rev: ++seq };
      sessions.set(row.id, saved);
      return saved;
    },
    async pullSessions(userId, cursor, limit) {
      const out = [];
      for (const r of sessions.values()) {
        if (r.user_id === userId && r.rev > cursor) out.push(r);
      }
      out.sort((a, b) => a.rev - b.rev);
      return out.slice(0, limit);
    },
    async pullPrepEnvelopes() { return []; },
    async upsertUserState(userId, preferences, updatedAt) { userStates.set(userId, { preferences, updatedAt }); },
    async getUserState(userId) { return userStates.get(userId) || null; },
    async getSyncDevice(userId, deviceId) { return devices.get(`${userId}:${deviceId}`) || null; },
    async upsertSyncDevice(userId, dev) { devices.set(`${userId}:${dev.deviceId}`, dev); }
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function main() {
  const db = createLoadTestDb();
  const redis = new InMemoryRedisStore();

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const userId = String(req.headers['x-test-user-id'] || '');
    const ip = String(req.headers['x-test-ip'] || '127.0.0.1');

    const result = await handleSync({
      auth: { userId },
      body,
      ip,
      db,
      redis,
      logSink: () => {}
    });

    res.statusCode = result.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result.body));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/sync`;

  const pushLatencies = [];
  const pullLatencies = [];
  let failures = 0;
  const nowIso = new Date().toISOString();

  const startAll = performance.now();

  await Promise.all(
    Array.from({ length: CONCURRENT_USERS }, async (_, uIdx) => {
      const userId = crypto.randomUUID();
      const ip = `10.0.0.${uIdx + 1}`;
      const records = Array.from({ length: RECORDS_PER_USER }, (__, rIdx) => ({
        id: crypto.randomUUID(),
        startedAt: nowIso,
        phase: 'focus',
        energy: (rIdx % 5) + 1,
        subject: 'Physics',
        sessionType: 'Study',
        plannedMinutes: 30,
        actualSeconds: 1800,
        status: 'completed',
        updatedAt: nowIso,
        deletedAt: null
      }));

      // Push 200 records
      const t0 = performance.now();
      const pushRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user-id': userId, 'x-test-ip': ip },
        body: JSON.stringify({ cursor: 0, prepCursor: 0, deviceId: `dev-${uIdx}`, sessions: records, prep: [] })
      });
      const pushBody = await pushRes.json();
      pushLatencies.push(performance.now() - t0);
      if (pushRes.status !== 200 || pushBody.accepted?.length !== RECORDS_PER_USER) {
        failures += 1;
      }

      // Pull all 200 records
      const t1 = performance.now();
      const pullRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user-id': userId, 'x-test-ip': ip },
        body: JSON.stringify({ cursor: 0, prepCursor: 0, deviceId: `dev-${uIdx}`, sessions: [], prep: [] })
      });
      const pullBody = await pullRes.json();
      pullLatencies.push(performance.now() - t1);
      if (pullRes.status !== 200 || pullBody.sessions?.length !== RECORDS_PER_USER) {
        failures += 1;
      }
    })
  );

  const totalElapsedMs = performance.now() - startAll;
  await new Promise((resolve) => server.close(resolve));

  const all = [...pushLatencies, ...pullLatencies].sort((a, b) => a - b);
  pushLatencies.sort((a, b) => a - b);
  pullLatencies.sort((a, b) => a - b);

  const summary = {
    concurrentUsers: CONCURRENT_USERS,
    recordsPerUser: RECORDS_PER_USER,
    totalRecordsSynced: CONCURRENT_USERS * RECORDS_PER_USER,
    totalHttpRequests: all.length,
    failures,
    totalElapsedMs: Number(totalElapsedMs.toFixed(2)),
    overall: {
      p50Ms: Number(percentile(all, 50).toFixed(2)),
      p95Ms: Number(percentile(all, 95).toFixed(2)),
      p99Ms: Number(percentile(all, 99).toFixed(2))
    },
    push: {
      p50Ms: Number(percentile(pushLatencies, 50).toFixed(2)),
      p95Ms: Number(percentile(pushLatencies, 95).toFixed(2)),
      p99Ms: Number(percentile(pushLatencies, 99).toFixed(2))
    },
    pull: {
      p50Ms: Number(percentile(pullLatencies, 50).toFixed(2)),
      p95Ms: Number(percentile(pullLatencies, 95).toFixed(2)),
      p99Ms: Number(percentile(pullLatencies, 99).toFixed(2))
    }
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures > 0 || summary.overall.p95Ms >= P95_BUDGET_MS) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
