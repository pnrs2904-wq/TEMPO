import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../supabase/migrations');

const m1 = fs.readFileSync(path.join(migrationsDir, '0001_core_rls.sql'), 'utf8');
const m2 = fs.readFileSync(path.join(migrationsDir, '0002_exam_prep_admin_flags.sql'), 'utf8');
const m3 = fs.readFileSync(path.join(migrationsDir, '0003_play_billing_entitlements_sync.sql'), 'utf8');
const allSql = `${m1}\n${m2}\n${m3}`;

function extractCreatedTables(sql) {
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  const tables = new Set();
  let match;
  while ((match = regex.exec(sql)) !== null) {
    tables.add(match[1]);
  }
  return [...tables];
}

test('Every created public table has ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY', () => {
  const tables = extractCreatedTables(allSql);
  assert.ok(tables.length >= 15, `Expected at least 15 tables, found ${tables.length}: ${tables.join(', ')}`);

  for (const table of tables) {
    const enableRe = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
    const forceRe = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
    assert.match(allSql, enableRe, `Table ${table} missing ENABLE ROW LEVEL SECURITY`);
    assert.match(allSql, forceRe, `Table ${table} missing FORCE ROW LEVEL SECURITY`);
  }
});

test('No SQL rate_limits table exists (rate limits live in Redis)', () => {
  const tables = extractCreatedTables(allSql);
  assert.ok(!tables.includes('rate_limits'), 'rate_limits SQL table must not exist');
});

test('play_purchases has zero user RLS policies, unique token hash, encrypted token column, and token-free summary view', () => {
  assert.match(m3, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.play_purchases/i);
  assert.match(m3, /purchase_token_hash\s+text\s+NOT\s+NULL\s+UNIQUE/i);
  assert.match(m3, /purchase_token_enc\s+text\s+NOT\s+NULL/i);
  // Ensure no CREATE POLICY ON public.play_purchases exists
  assert.doesNotMatch(allSql, /CREATE\s+POLICY\s+[^;]+ON\s+(?:public\.)?play_purchases\b/i);
  // Summary view exists and omits purchase_token_enc / purchase_token_hash
  const viewMatch = m3.match(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.user_play_purchases_summary[\s\S]*?;/i);
  assert.ok(viewMatch, 'user_play_purchases_summary view must exist');
  assert.doesNotMatch(viewMatch[0], /purchase_token_enc/i);
  assert.doesNotMatch(viewMatch[0], /purchase_token_hash/i);
});

test('entitlements has source (razorpay|play|grant), source_ref, and partial unique index for one active Pro per user', () => {
  assert.match(m3, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+source\s+text/i);
  assert.match(m3, /CHECK\s*\(\s*source\s+IN\s*\(\s*'razorpay'\s*,\s*'play'\s*,\s*'grant'\s*\)\s*\)/i);
  assert.match(m3, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+source_ref\s+text/i);
  assert.match(m3, /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_entitlements_one_active_pro_per_user/i);
});

test('profiles prevents non-service-role role escalation and has ownership immutability guards', () => {
  assert.match(m1, /protect_profile_role/i);
  assert.match(m1, /service_role/i);
  assert.match(m1, /prevent_ownership_change/i);
});

test('exam prep constraints enforce unique live plan, unique live revision/day, mock arithmetic, and parent ownership', () => {
  assert.match(m2, /CREATE\s+UNIQUE\s+INDEX[^;]+ON\s+public\.user_exam_plans[^;]+WHERE\s+deleted_at\s+IS\s+NULL/i);
  assert.match(m2, /CREATE\s+UNIQUE\s+INDEX[^;]+ON\s+public\.revision_events[^;]+WHERE\s+deleted_at\s+IS\s+NULL/i);
  assert.match(m2, /attempted_questions\s*=\s*correct_answers\s*\+\s*incorrect_answers/i);
  assert.match(m2, /attempted_questions\s*\+\s*unanswered_questions\s*=\s*total_questions/i);
  assert.match(m2, /total_score\s*<=\s*max_marks/i);
  assert.match(m2, /check_revision_parent_owner/i);
  assert.match(m2, /check_attempt_parent_owner/i);
});

test('admin RPCs enforce both is_admin() and has_aal2_mfa() and write audit logs', () => {
  assert.match(m1, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_aal2_mfa/i);
  assert.match(m2, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_metrics/i);
  assert.match(m2, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.set_feature_flag/i);
  const adminMetricsBlock = m2.slice(m2.indexOf('admin_metrics'), m2.indexOf('set_feature_flag'));
  assert.match(adminMetricsBlock, /public\.is_admin\(\)/i);
  assert.match(adminMetricsBlock, /public\.has_aal2_mfa\(\)/i);
  const setFlagBlock = m2.slice(m2.indexOf('set_feature_flag'));
  assert.match(setFlagBlock, /public\.is_admin\(\)/i);
  assert.match(setFlagBlock, /public\.has_aal2_mfa\(\)/i);
  assert.match(setFlagBlock, /INSERT\s+INTO\s+public\.admin_audit_logs/i);
});

test('DPDP compliance and operational tables exist in 0003 with auth.users ON DELETE CASCADE', () => {
  assert.match(m3, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.sync_devices/i);
  assert.match(m3, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.user_consents/i);
  assert.match(m3, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.webhook_events/i);
  assert.match(m1, /REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i);
  assert.match(m3, /REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i);
});
