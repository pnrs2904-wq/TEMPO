/**
 * Distributed state store backed by Upstash Redis REST API in production,
 * with a deterministic InMemoryRedisStore adapter for unit & integration tests.
 *
 * Used for:
 *  - Per-user and per-IP rate limiting
 *  - Single-use nonce replay protection (SET NX EX)
 *  - Global daily AI spend / request cap
 */

export class InMemoryRedisStore {
  constructor() {
    this.kv = new Map(); // key -> { value, expiresAt }
  }

  _gc(key, now = Date.now()) {
    const item = this.kv.get(key);
    if (item && item.expiresAt !== null && now >= item.expiresAt) {
      this.kv.delete(key);
      return null;
    }
    return item || null;
  }

  async incrWithExpire(key, ttlSec) {
    const now = Date.now();
    const existing = this._gc(key, now);
    const nextVal = existing ? Number(existing.value) + 1 : 1;
    const expiresAt = existing ? existing.expiresAt : now + ttlSec * 1000;
    this.kv.set(key, { value: nextVal, expiresAt });
    return nextVal;
  }

  async setNxEx(key, value, ttlSec) {
    const now = Date.now();
    const existing = this._gc(key, now);
    if (existing !== null) return false;
    this.kv.set(key, { value, expiresAt: now + ttlSec * 1000 });
    return true;
  }

  async get(key) {
    const item = this._gc(key);
    return item ? item.value : null;
  }

  async del(key) {
    this.kv.delete(key);
  }

  clear() {
    this.kv.clear();
  }
}

export class UpstashRedisStore {
  constructor({ restUrl, restToken, fetchFn = globalThis.fetch } = {}) {
    if (!restUrl || !restToken) {
      throw new Error('Upstash Redis requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
    }
    this.restUrl = restUrl.replace(/\/+$/, '');
    this.restToken = restToken;
    this.fetchFn = fetchFn;
  }

  async _pipeline(commands) {
    const res = await this.fetchFn(`${this.restUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands)
    });
    if (!res.ok) {
      throw new Error(`Upstash Redis HTTP ${res.status}`);
    }
    return res.json();
  }

  async incrWithExpire(key, ttlSec) {
    const results = await this._pipeline([
      ['INCR', key],
      ['EXPIRE', key, String(ttlSec), 'NX']
    ]);
    return Number(results?.[0]?.result ?? 0);
  }

  async setNxEx(key, value, ttlSec) {
    const results = await this._pipeline([
      ['SET', key, String(value), 'EX', String(ttlSec), 'NX']
    ]);
    return results?.[0]?.result === 'OK';
  }

  async get(key) {
    const results = await this._pipeline([['GET', key]]);
    return results?.[0]?.result ?? null;
  }

  async del(key) {
    await this._pipeline([['DEL', key]]);
  }
}

export function createRedisStore(env = process.env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRedisStore({
      restUrl: env.UPSTASH_REDIS_REST_URL,
      restToken: env.UPSTASH_REDIS_REST_TOKEN
    });
  }
  return new InMemoryRedisStore();
}

export async function checkRateLimit(store, key, { limit, windowSec }) {
  const count = await store.incrWithExpire(`rl:${key}`, windowSec);
  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count)
  };
}

export async function claimSingleUseNonce(store, nonce, ttlSec = 360) {
  const ok = await store.setNxEx(`nonce:${nonce}`, '1', ttlSec);
  return ok;
}

export async function consumeDailyAiBudget(store, maxDailyRequests, nowDate = new Date()) {
  const dayKey = nowDate.toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const count = await store.incrWithExpire(`ai:daily:${dayKey}`, 26 * 3600);
  return {
    allowed: count <= maxDailyRequests,
    count,
    limit: maxDailyRequests
  };
}
