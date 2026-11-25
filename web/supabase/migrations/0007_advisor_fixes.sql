-- ============================================================================
-- Fixes from the Supabase security and performance advisors.
-- ============================================================================

-- 1. Replace the SECURITY DEFINER view with a function that can only ever return the caller's
--    own purchases (no purchase tokens). Views cannot pin search_path or be revoked per role
--    as cleanly; a function can.
DROP VIEW IF EXISTS public.user_play_purchases_summary;
CREATE OR REPLACE FUNCTION public.my_play_purchases()
RETURNS TABLE (id UUID, product_id TEXT, order_id TEXT, state TEXT, expiry_time TIMESTAMPTZ,
               auto_renewing BOOLEAN, acknowledged BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pp.id, pp.product_id, pp.order_id, pp.state, pp.expiry_time, pp.auto_renewing, pp.acknowledged, pp.created_at, pp.updated_at
  FROM public.play_purchases pp
  WHERE pp.user_id = (SELECT auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.my_play_purchases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_play_purchases() TO authenticated;

-- 2. Pin search_path on every helper and trigger function.
ALTER FUNCTION public.is_service_role() SET search_path = '';
ALTER FUNCTION public.has_aal2_mfa() SET search_path = '';
ALTER FUNCTION public.touch_updated_at_and_rev() SET search_path = '';
ALTER FUNCTION public.touch_prep_updated_at_and_rev() SET search_path = '';
ALTER FUNCTION public.prevent_ownership_change() SET search_path = '';
ALTER FUNCTION public.protect_profile_role() SET search_path = '';
ALTER FUNCTION public.check_revision_parent_owner() SET search_path = '';
ALTER FUNCTION public.check_attempt_parent_owner() SET search_path = '';

-- 3. Evaluate auth.uid() once per statement instead of once per row in every policy.
DO $$
DECLARE
  p RECORD;
  q TEXT;
  c TEXT;
  sql TEXT;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
    q := replace(p.qual, 'auth.uid()', '( SELECT auth.uid() AS uid)');
    c := replace(p.with_check, 'auth.uid()', '( SELECT auth.uid() AS uid)');
    IF q IS DISTINCT FROM p.qual OR c IS DISTINCT FROM p.with_check THEN
      sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
      IF q IS NOT NULL THEN sql := sql || format(' USING (%s)', q); END IF;
      IF c IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', c); END IF;
      EXECUTE sql;
    END IF;
  END LOOP;
END $$;

-- 4. Index foreign keys used by cascades and parent checks.
CREATE INDEX IF NOT EXISTS idx_question_attempts_mock_test_id ON public.question_attempts(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_revision_events_topic_id ON public.revision_events(topic_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_institute_id ON public.groups(institute_id);
CREATE INDEX IF NOT EXISTS idx_institutes_owner_user_id ON public.institutes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs(actor_user_id);
