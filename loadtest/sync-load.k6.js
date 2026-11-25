/**
 * k6 Load Test for Tempo 4.0 POST /api/sync (Live Deployment)
 *
 * Usage:
 *   BASE_URL=https://tempo.example.com SYNC_BEARER_TOKEN=<jwt> k6 run loadtest/sync-load.k6.js
 *
 * Target: 50 concurrent users each pushing & pulling 200 records with p95 < 800 ms.
 */
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  iterations: 50,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const TOKEN = __ENV.SYNC_BEARER_TOKEN || '';

function uuidFromIndex(vu, i) {
  const v = String(vu).padStart(4, '0');
  const idx = String(i).padStart(12, '0');
  return `10000000-${v}-4000-8000-${idx}`;
}

export default function () {
  const nowIso = new Date().toISOString();
  const sessions = [];
  for (let i = 0; i < 200; i++) {
    sessions.push({
      id: uuidFromIndex(__VU, i),
      startedAt: nowIso,
      phase: 'focus',
      energy: (i % 5) + 1,
      subject: 'Physics',
      sessionType: 'Study',
      plannedMinutes: 30,
      actualSeconds: 1800,
      status: 'completed',
      updatedAt: nowIso,
      deletedAt: null
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`
  };

  const pushRes = http.post(
    `${BASE_URL}/api/sync`,
    JSON.stringify({ cursor: 0, prepCursor: 0, sessions, prep: [] }),
    { headers }
  );
  check(pushRes, { 'push status 200': (r) => r.status === 200 });

  const pullRes = http.post(
    `${BASE_URL}/api/sync`,
    JSON.stringify({ cursor: 0, prepCursor: 0, sessions: [], prep: [] }),
    { headers }
  );
  check(pullRes, { 'pull status 200': (r) => r.status === 200 });
}
