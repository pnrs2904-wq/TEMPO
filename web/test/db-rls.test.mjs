/**
 * Real Postgres (PGlite) tests for migrations 0001-0004, set up the way Supabase is:
 *   - default privileges grant tables, sequences and functions to anon/authenticated/service_role
 *     BEFORE the migrations run (so the migrations' own REVOKEs are tested, not bypassed);
 *   - requests carry claims only in request.jwt.claims (current PostgREST), not the legacy
 *     per-claim settings, so helpers must work with today's Supabase;
 *   - auth.uid() is Supabase's own definition.
 * Every refusal is checked for its specific reason, so a test cannot pass because a row was
 * merely invalid.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbToWire, wireToDb, SYNC_TABLES } from '../src/lib/server/wire.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../supabase/migrations');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FREE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = Date.now();

let db;

async function createDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''),
                      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  for (const f of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  return pg;
}

/** Runs fn as a client role with current-PostgREST claims. Rolls back on error. */
async function as(role, userId, fn, aal = 'aal1') {
  await db.exec('BEGIN');
  try {
    const claims = JSON.stringify(userId ? { sub: userId, role, aal } : { role });
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.exec(`SET LOCAL ROLE ${role}`);
    const out = await fn();
    await db.exec('COMMIT');
    return out;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}
const q = (sql, params) => db.query(sql, params).then((r) => r.rows);

/** Inserts a wire-format row exactly as /api/sync does: wireToDb + upsert on id. */
async function syncWrite(userId, table, wireRow) {
  const row = wireToDb(table, wireRow, userId);
  const cols = Object.keys(row);
  const sql = `INSERT INTO public.${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
               ON CONFLICT (id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(',')}
               RETURNING *`;
  return as('authenticated', userId, () => q(sql, cols.map((c) => row[c])));
}

const uuid = () => crypto.randomUUID();
const at = (minAgo) => NOW - minAgo * 60_000;

// Android-shaped rows (SyncPayloadSerializer.kt): epoch-ms numbers, `timestamp` for start, `localId` extra.
const session = (o = {}) => ({ id: uuid(), localId: 7, timestamp: at(60), phase: 'focus', energy: 4, subject: 'Physics', sessionType: 'Study',
  plannedMinutes: 40, actualSeconds: 2400, status: 'completed', focusQuality: 5, difficulty: 3, durationFeedback: 'about_right', distractions: 0,
  notes: null, createdAt: at(60), updatedAt: at(20), deletedAt: null, ...o });
const plan = (o = {}) => ({ id: uuid(), examId: 'neet_ug', applicableYear: 2026, syllabusVersion: 'NMC-NEET-UG-2026.1', selectedCaGroup: 'both',
  examDateEpochDay: 20575, dailyHours: 5.5, studyDaysPerWeek: 6, targetScorePercent: 85, updatedAt: at(20), deletedAt: null, ...o });
const topic = (o = {}) => ({ id: uuid(), examId: 'neet_ug', syllabusVersion: 'NMC-NEET-UG-2026.1', subject: 'Physics', unit: 'Mechanics', chapter: 'Kinematics',
  topicName: 'Projectile Motion', subtopics: '', status: 'completed', difficulty: 'high', ncertCompleted: true, formulaRevisionDone: false,
  diagramRevisionDone: false, rtpMtpCompleted: false, revisionCount: 1, lastStudiedEpochDay: 20416, nextRevisionEpochDay: 20419, isCustom: false,
  updatedAt: at(20), deletedAt: null, ...o });
const revision = (topicId, o = {}) => ({ id: uuid(), examId: 'neet_ug', topicId, topicName: 'Projectile Motion', subject: 'Physics', revisionTimestamp: at(30),
  revisionEpochDay: 20416, revisionNumber: 1, recallRating: 4, accuracyPercent: 80, difficulty: 3, nextRevisionEpochDay: 20419, method: 'active_recall',
  notes: null, updatedAt: at(20), deletedAt: null, ...o });
const mock = (o = {}) => ({ id: uuid(), examId: 'neet_ug', attemptYear: 2026, mockName: 'Mock 1', dateTimestamp: at(120), totalQuestions: 180,
  attemptedQuestions: 160, correctAnswers: 120, incorrectAnswers: 40, unansweredQuestions: 20, positiveMarksPerQ: 4, negativeMarksPerQ: 1, totalScore: 440,
  maxMarks: 720, percentage: 61.11, accuracyPercent: 75, durationMinutes: 180, avgSecondsPerQuestion: 60, weakestSubject: 'Physics',
  weakestSubjectAccuracy: 55.5, isQuickEntry: true, notes: null, updatedAt: at(20), deletedAt: null, ...o });
const attempt = (mockTestId, o = {}) => ({ id: uuid(), examId: 'neet_ug', mockTestId, questionNumber: 1, subject: 'Physics', topicName: 'Optics',
  difficulty: 'moderate', selectedAnswer: 'B', correctAnswer: 'C', isCorrect: false, timeSpentSeconds: 75, errorCategory: 'conceptual',
  updatedAt: at(20), deletedAt: null, ...o });

const grantPro = (u) => q(`INSERT INTO public.entitlements (user_id, plan, status, source, source_ref, includes_ai, current_period_end)
  VALUES ($1, 'pro_monthly', 'active', 'grant', $2, true, now() + interval '30 days')`, [u, `test-${u}`]);

let aTopic;
let aMock;

test.before(async () => {
  db = await createDb();
  for (const [id, email, name] of [[A, 'a@example.com', 'Asha'], [B, 'b@example.com', 'Ravi'], [ADMIN, 'admin@example.com', 'Admin'], [FREE, 'free@example.com', null]]) {
    await q(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)`, [id, email, JSON.stringify(name ? { full_name: name } : {})]);
  }
  await grantPro(A);
  await grantPro(B);
  await q(`UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [ADMIN]); // operator session (SQL editor)
  aTopic = topic();
  aMock = mock();
  await syncWrite(A, 'user_topic_progress', aTopic);
  await syncWrite(A, 'mock_tests', aMock);
});
test.after(() => db?.close());

test('signup creates a profile row with the name from the identity provider', async () => {
  const rows = await q(`SELECT id, role, display_name FROM public.profiles ORDER BY display_name NULLS LAST`);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.find((r) => r.id === A), { id: A, role: 'user', display_name: 'Asha' });
  assert.equal(rows.find((r) => r.id === FREE).display_name, null);
});

test('sync wire rows (Android format) round-trip through every real table unchanged', async () => {
  const t = topic({ topicName: 'Round trip' });
  const m = mock({ mockName: 'Round trip' });
  const cases = [
    ['sessions', session()],
    // Web-shaped session: the web-only fields (migration 0005) round-trip too.
    ['sessions', session({ tz: 'Asia/Kolkata', localDate: '2026-11-25', expectedDifficulty: 4, topicId: uuid(), mockScore: 132.5, mockMaxScore: 200 })],
    ['user_exam_plans', plan({ examId: 'clat_ug', examDateEpochDay: null })],
    ['user_topic_progress', t],
    ['mock_tests', m],
    ['mock_tests', mock({ mockName: 'CA paper', scoringMode: 'MARKS_ENTRY', totalQuestions: 0, attemptedQuestions: 0, correctAnswers: 0, incorrectAnswers: 0, unansweredQuestions: 0, positiveMarksPerQ: 0, negativeMarksPerQ: 0, totalScore: 62, maxMarks: 100, percentage: 62, accuracyPercent: 0, avgSecondsPerQuestion: 0 })],
    ['revision_events', revision(t.id, { accuracyPercent: null, notes: 'Short note' })],
    ['question_attempts', attempt(m.id, { selectedAnswer: null, errorCategory: null })],
  ];
  assert.deepEqual([...new Set(cases.map((c) => c[0]))].sort(), [...SYNC_TABLES].sort());
  for (const [table, wire] of cases) {
    const [row] = await syncWrite(A, table, wire);
    assert.equal(row.user_id, A);
    const back = dbToWire(table, row);
    const { rev, ...rest } = back;
    assert.ok(rev > 0, `${table} rev assigned`);
    const expected = { ...wire };
    delete expected.localId; // Android-only field, not stored
    if (table === 'sessions') {
      expected.startedAt = wire.timestamp;
      for (const k of ['tz', 'localDate', 'expectedDifficulty', 'topicId', 'mockScore', 'mockMaxScore']) expected[k] ??= null;
    }
    if (table === 'mock_tests') expected.scoringMode ??= 'PER_QUESTION';
    assert.deepEqual(rest, expected, `${table} round trip`);
  }
});

test('an Android write never blanks the web-only fields', async () => {
  const s = session({ tz: 'Asia/Kolkata', localDate: '2026-11-25', topicId: uuid() });
  await syncWrite(A, 'sessions', s);
  const { tz, localDate, topicId, ...androidShaped } = s; // Android sends none of these
  const [row] = await syncWrite(A, 'sessions', { ...androidShaped, subject: 'Edited on phone', updatedAt: s.updatedAt + 1000 });
  assert.equal(row.subject, 'Edited on phone');
  assert.equal(row.tz, 'Asia/Kolkata');
  assert.equal(row.local_date, '2026-11-25');
  assert.equal(row.topic_id, topicId);
});

test('the client edit time is kept, so a late-synced old edit cannot beat a newer one', async () => {
  const s = session({ updatedAt: at(240) });
  const [row] = await syncWrite(A, 'sessions', s);
  assert.equal(new Date(row.updated_at).getTime(), s.updatedAt);
  const [again] = await syncWrite(A, 'sessions', { ...s, subject: 'Chemistry', updatedAt: at(200) });
  assert.ok(Number(again.rev) > Number(row.rev), 'rev moves on every write');
});

test('another user cannot read, change, delete or overwrite your rows', async () => {
  await as('authenticated', B, async () => {
    for (const t of SYNC_TABLES) {
      const rows = await q(`SELECT user_id FROM public.${t}`);
      assert.ok(rows.every((r) => r.user_id === B), `${t} leaks rows`);
    }
    assert.equal((await q(`UPDATE public.user_topic_progress SET status = 'mastered' WHERE id = $1 RETURNING id`, [aTopic.id])).length, 0);
    assert.equal((await q(`DELETE FROM public.mock_tests WHERE id = $1 RETURNING id`, [aMock.id])).length, 0);
  });
  // Writing a row in someone else's name.
  const forged = wireToDb('sessions', session(), A);
  await assert.rejects(as('authenticated', B, () => q(`INSERT INTO public.sessions (id,user_id,started_at,phase,energy,planned_minutes,actual_seconds,status,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [forged.id, A, forged.started_at, 'focus', 3, 25, 0, 'completed', forged.updated_at])), /row-level security/);
  // Upsert on A's primary key (what /api/sync does): the hidden row makes the insert path fail.
  await assert.rejects(syncWrite(B, 'user_topic_progress', { ...aTopic, topicName: 'Hijacked' }), /duplicate key|row-level security/);
  const [t] = await q(`SELECT topic_name, status FROM public.user_topic_progress WHERE id = $1`, [aTopic.id]);
  assert.deepEqual(t, { topic_name: 'Projectile Motion', status: 'completed' });
});

test('revisions and question attempts cannot hang off someone else\'s topic or mock', async () => {
  await assert.rejects(syncWrite(B, 'revision_events', revision(aTopic.id)), /Parent topic_id does not belong/);
  await assert.rejects(syncWrite(B, 'question_attempts', attempt(aMock.id)), /Parent mock_test_id does not belong/);
});

test('ownership of a row cannot be transferred', async () => {
  await assert.rejects(as('authenticated', A, () => q(`UPDATE public.mock_tests SET user_id = $1 WHERE id = $2`, [B, aMock.id])), /row-level security|Ownership transfer/);
});

test('cloud writes need Pro; without it reads still work', async () => {
  await assert.rejects(syncWrite(FREE, 'sessions', session()), /row-level security/);
  assert.deepEqual(await as('authenticated', FREE, () => q(`SELECT id FROM public.sessions`)), []);
});

test('has_pro() answers only about yourself', async () => {
  const [{ mine }] = await as('authenticated', B, () => q(`SELECT public.has_pro() AS mine`));
  const [{ other }] = await as('authenticated', B, () => q(`SELECT public.has_pro($1) AS other`, [A]));
  assert.equal(mine, true);
  assert.equal(other, false);
  const [{ svc }] = await as('service_role', null, () => q(`SELECT public.has_pro($1) AS svc`, [A]));
  assert.equal(svc, true);
});

test('role escalation is blocked for users and allowed for the service role and the operator', async () => {
  await assert.rejects(as('authenticated', A, () => q(`UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [A])), /row-level security|Only service_role/);
  await assert.rejects(as('authenticated', A, () => q(`SELECT public.protect_profile_role()`)), /trigger functions can only be called as triggers|permission denied/);
  await as('service_role', null, () => q(`UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [FREE]));
  await as('service_role', null, () => q(`UPDATE public.profiles SET role = 'user' WHERE id = $1`, [FREE]));
  const [{ role }] = await q(`SELECT role FROM public.profiles WHERE id = $1`, [A]);
  assert.equal(role, 'user');
});

test('my_play_purchases() returns only your own purchases and never the token', async () => {
  await q(`INSERT INTO public.play_purchases (user_id, product_id, purchase_token_hash, purchase_token_enc, state) VALUES ($1, 'pro_monthly', 'h-a', 'enc-a', 'active'), ($2, 'pro_annual', 'h-b', 'enc-b', 'active')`, [A, B]);
  const rows = await as('authenticated', A, () => q(`SELECT * FROM public.my_play_purchases()`));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].product_id, 'pro_monthly');
  assert.ok(!('purchase_token_enc' in rows[0]) && !('purchase_token_hash' in rows[0]));
  await assert.rejects(as('anon', null, () => q(`SELECT * FROM public.my_play_purchases()`)), /permission denied/);
});

test('policies evaluate auth.uid() once per statement (advisor fix applied)', async () => {
  const rows = await q(`SELECT policyname FROM pg_policies WHERE schemaname = 'public'
    AND (coalesce(qual, '') ~ '(^|[^(] *)auth\.uid\(\)' AND coalesce(qual, '') !~ 'SELECT auth\.uid')`);
  assert.deepEqual(rows, []);
});

test('purchase tokens and webhook records are unreadable to users; anon sees only flags', async () => {
  await assert.rejects(as('authenticated', A, () => q(`SELECT * FROM public.play_purchases`)), /permission denied/);
  await assert.rejects(as('authenticated', A, () => q(`SELECT * FROM public.webhook_events`)), /permission denied/);
  assert.ok((await as('anon', null, () => q(`SELECT key FROM public.feature_flags`))).length > 0);
  assert.deepEqual(await as('anon', null, () => q(`SELECT id FROM public.sessions`)), []);
  await assert.rejects(as('anon', null, () => q(`SELECT public.has_pro()`)), /permission denied/);
});

test('database constraints back up the API checks', async () => {
  await assert.rejects(syncWrite(A, 'mock_tests', mock({ correctAnswers: 150 })), /check constraint/);
  await assert.rejects(syncWrite(A, 'mock_tests', mock({ totalScore: 900 })), /check constraint/);
  const t = topic({ topicName: 'Duplicate day' });
  await syncWrite(A, 'user_topic_progress', t);
  await syncWrite(A, 'revision_events', revision(t.id));
  await assert.rejects(syncWrite(A, 'revision_events', revision(t.id)), /duplicate key/);
});

test('admin functions need the admin role AND MFA, and every flag change is audited', async () => {
  await assert.rejects(as('authenticated', A, () => q(`SELECT public.admin_metrics(30)`), 'aal2'), /admin role with aal2/);
  await assert.rejects(as('authenticated', ADMIN, () => q(`SELECT public.admin_metrics(30)`), 'aal1'), /admin role with aal2/);
  const [{ m }] = await as('authenticated', ADMIN, () => q(`SELECT public.admin_metrics(30) AS m`), 'aal2');
  assert.ok(m && typeof m === 'object');
  assert.doesNotMatch(JSON.stringify(m), /a@example\.com|Projectile/);
  const [{ key }] = await q(`SELECT key FROM public.feature_flags LIMIT 1`);
  await as('authenticated', ADMIN, () => q(`SELECT public.set_feature_flag($1, false, 'test')`, [key]), 'aal2');
  const logs = await as('authenticated', ADMIN, () => q(`SELECT action, actor_user_id FROM public.admin_audit_logs`), 'aal2');
  assert.ok(logs.some((l) => l.actor_user_id === ADMIN));
  assert.deepEqual(await as('authenticated', A, () => q(`SELECT * FROM public.admin_audit_logs`)), []);
});

test('deleting the auth user (what Supabase does on account deletion) removes all their data', async () => {
  await q(`DELETE FROM auth.users WHERE id = $1`, [A]);
  for (const t of ['profiles', 'entitlements', 'user_state', 'sync_devices', ...SYNC_TABLES]) {
    const col = t === 'profiles' ? 'id' : 'user_id';
    const [{ c }] = await q(`SELECT count(*)::int AS c FROM public.${t} WHERE ${col} = $1`, [A]);
    assert.equal(c, 0, `${t} still has rows`);
  }
});
