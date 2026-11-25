-- ============================================================================
-- Richer admin metrics. Still counts only: no emails, names, notes, subjects or per-user rows.
-- Same gate as before: admin role AND an MFA (aal2) session.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_metrics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_since TIMESTAMPTZ := now() - make_interval(days => v_days);
BEGIN
  IF NOT (public.is_admin() AND public.has_aal2_mfa()) THEN
    RAISE EXCEPTION 'Forbidden: admin role with aal2 MFA required';
  END IF;

  RETURN jsonb_build_object(
    'windowDays', v_days,
    'totalUsers', (SELECT COUNT(*) FROM public.profiles),
    'newUsers', (SELECT COUNT(*) FROM public.profiles WHERE created_at >= v_since),
    'activeProUsers', (SELECT COUNT(DISTINCT user_id) FROM public.entitlements
                        WHERE status IN ('active', 'grace_period', 'canceled') AND plan <> 'free'
                          AND (current_period_end IS NULL OR current_period_end > now())),
    'proBySource', (SELECT COALESCE(jsonb_object_agg(source, n), '{}'::jsonb) FROM (
                      SELECT source, COUNT(DISTINCT user_id) n FROM public.entitlements
                      WHERE status IN ('active', 'grace_period', 'canceled') AND plan <> 'free'
                        AND (current_period_end IS NULL OR current_period_end > now()) GROUP BY source) x),
    'dau', (SELECT COUNT(DISTINCT user_id) FROM public.sessions WHERE deleted_at IS NULL AND started_at >= now() - interval '1 day'),
    'mau', (SELECT COUNT(DISTINCT user_id) FROM public.sessions WHERE deleted_at IS NULL AND started_at >= now() - interval '30 days'),
    'sessionsLogged', (SELECT COUNT(*) FROM public.sessions WHERE deleted_at IS NULL AND started_at >= v_since),
    'focusMinutes', (SELECT COALESCE(SUM(actual_seconds) / 60, 0) FROM public.sessions
                      WHERE deleted_at IS NULL AND phase = 'focus' AND started_at >= v_since),
    'mocksLogged', (SELECT COUNT(*) FROM public.mock_tests WHERE deleted_at IS NULL AND date_timestamp >= v_since),
    'revisionsLogged', (SELECT COUNT(*) FROM public.revision_events WHERE deleted_at IS NULL AND updated_at >= v_since),
    'revenuePaise', (SELECT COALESCE(SUM(amount_paise), 0) FROM public.payments WHERE status = 'captured' AND created_at >= v_since),
    'paymentsByStatus', (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) FROM (
                      SELECT status, COUNT(*) n FROM public.payments WHERE created_at >= v_since GROUP BY status) x),
    'examDistribution', (SELECT COALESCE(jsonb_agg(jsonb_build_object('examId', exam_id, 'users', n) ORDER BY n DESC), '[]'::jsonb) FROM (
                      SELECT exam_id, COUNT(DISTINCT user_id) n FROM public.user_exam_plans WHERE deleted_at IS NULL GROUP BY exam_id) x),
    'dailyActive', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'users', n) ORDER BY d), '[]'::jsonb) FROM (
                      SELECT (started_at AT TIME ZONE 'Asia/Kolkata')::date d, COUNT(DISTINCT user_id) n FROM public.sessions
                      WHERE deleted_at IS NULL AND started_at >= v_since GROUP BY 1) x)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_metrics(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_metrics(INTEGER) TO authenticated, service_role;
