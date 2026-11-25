-- ============================================================================
-- Tempo 4.0 Migration 0002: Exam Prep Tables, Shared Prep Rev Sequence,
-- Feature Flags, Admin Audit Logs, and Security-Definer Admin RPCs
-- ============================================================================
-- Invariants enforced:
--   1. Shared sequence public.prep_rev_seq bumps rev on every write across all 5 prep tables.
--   2. One live exam plan per (user_id, exam_id) where deleted_at IS NULL.
--   3. One live revision per (user_id, topic_id, revision_epoch_day) where deleted_at IS NULL.
--   4. Child rows (revision_events, question_attempts) require parent owned by same user_id.
--   5. Mock counts add up (attempted = correct + incorrect; attempted + unanswered = total)
--      and total_score <= max_marks.
--   6. Admin RPCs verify BOTH is_admin() AND aal2 MFA claim and log every admin write.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.prep_rev_seq START 1;

CREATE OR REPLACE FUNCTION public.touch_prep_updated_at_and_rev()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Keep the client's edit time (see touch_updated_at_and_rev in 0001).
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  NEW.rev := nextval('public.prep_rev_seq');
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. user_exam_plans
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_exam_plans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL CHECK (char_length(exam_id) BETWEEN 2 AND 64),
  applicable_year INTEGER NOT NULL CHECK (applicable_year BETWEEN 2024 AND 2040),
  syllabus_version TEXT NOT NULL CHECK (char_length(syllabus_version) BETWEEN 1 AND 64),
  selected_ca_group TEXT NOT NULL DEFAULT 'both' CHECK (selected_ca_group IN ('group_1', 'group_2', 'both')),
  exam_date_epoch_day BIGINT,
  daily_hours NUMERIC(4, 2) NOT NULL DEFAULT 4.0 CHECK (daily_hours >= 0.5 AND daily_hours <= 16.0),
  study_days_per_week SMALLINT NOT NULL DEFAULT 6 CHECK (study_days_per_week BETWEEN 1 AND 7),
  target_score_percent SMALLINT NOT NULL DEFAULT 75 CHECK (target_score_percent BETWEEN 1 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  rev BIGINT NOT NULL DEFAULT nextval('public.prep_rev_seq')
);

-- One live plan per exam per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_exam_plans_live_exam
  ON public.user_exam_plans(user_id, exam_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_exam_plans_user_rev ON public.user_exam_plans(user_id, rev);

DROP TRIGGER IF EXISTS trg_user_exam_plans_ownership ON public.user_exam_plans;
CREATE TRIGGER trg_user_exam_plans_ownership
  BEFORE UPDATE ON public.user_exam_plans
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_change();

DROP TRIGGER IF EXISTS trg_user_exam_plans_rev ON public.user_exam_plans;
CREATE TRIGGER trg_user_exam_plans_rev
  BEFORE INSERT OR UPDATE ON public.user_exam_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_prep_updated_at_and_rev();

ALTER TABLE public.user_exam_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exam_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY user_exam_plans_select_own ON public.user_exam_plans
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY user_exam_plans_insert_own_pro ON public.user_exam_plans
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));
CREATE POLICY user_exam_plans_update_own_pro ON public.user_exam_plans
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));
CREATE POLICY user_exam_plans_delete_own_pro ON public.user_exam_plans
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.has_pro(auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. user_topic_progress
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_topic_progress (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL CHECK (char_length(exam_id) BETWEEN 2 AND 64),
  syllabus_version TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 120),
  unit TEXT NOT NULL DEFAULT '',
  chapter TEXT NOT NULL DEFAULT '',
  topic_name TEXT NOT NULL CHECK (char_length(topic_name) BETWEEN 1 AND 240),
  subtopics TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'learning', 'practising', 'completed', 'revision_due', 'mastered')),
  difficulty TEXT NOT NULL DEFAULT 'moderate' CHECK (difficulty IN ('foundational', 'moderate', 'high', 'critical')),
  ncert_completed BOOLEAN NOT NULL DEFAULT FALSE,
  formula_revision_done BOOLEAN NOT NULL DEFAULT FALSE,
  diagram_revision_done BOOLEAN NOT NULL DEFAULT FALSE,
  rtp_mtp_completed BOOLEAN NOT NULL DEFAULT FALSE,
  revision_count INTEGER NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
  last_studied_epoch_day BIGINT,
  next_revision_epoch_day BIGINT,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  rev BIGINT NOT NULL DEFAULT nextval('public.prep_rev_seq')
);

CREATE INDEX IF NOT EXISTS idx_user_topic_progress_user_rev ON public.user_topic_progress(user_id, rev);
CREATE INDEX IF NOT EXISTS idx_user_topic_progress_user_exam ON public.user_topic_progress(user_id, exam_id);

DROP TRIGGER IF EXISTS trg_user_topic_progress_ownership ON public.user_topic_progress;
CREATE TRIGGER trg_user_topic_progress_ownership
  BEFORE UPDATE ON public.user_topic_progress
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_change();

DROP TRIGGER IF EXISTS trg_user_topic_progress_rev ON public.user_topic_progress;
CREATE TRIGGER trg_user_topic_progress_rev
  BEFORE INSERT OR UPDATE ON public.user_topic_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_prep_updated_at_and_rev();

ALTER TABLE public.user_topic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_topic_progress FORCE ROW LEVEL SECURITY;

CREATE POLICY user_topic_progress_select_own ON public.user_topic_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY user_topic_progress_insert_own_pro ON public.user_topic_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));
CREATE POLICY user_topic_progress_update_own_pro ON public.user_topic_progress
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));
CREATE POLICY user_topic_progress_delete_own_pro ON public.user_topic_progress
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.has_pro(auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. revision_events (child of user_topic_progress; parent must belong to same user)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.revision_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL CHECK (char_length(exam_id) BETWEEN 2 AND 64),
  topic_id UUID NOT NULL REFERENCES public.user_topic_progress(id) ON DELETE CASCADE,
  topic_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  revision_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision_epoch_day BIGINT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  recall_rating SMALLINT NOT NULL CHECK (recall_rating BETWEEN 1 AND 5),
  accuracy_percent SMALLINT CHECK (accuracy_percent IS NULL OR accuracy_percent BETWEEN 0 AND 100),
  difficulty SMALLINT NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  next_revision_epoch_day BIGINT NOT NULL,
  method TEXT NOT NULL DEFAULT 'active_recall',
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 240),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  rev BIGINT NOT NULL DEFAULT nextval('public.prep_rev_seq')
);

-- One live revision per topic per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_revision_events_live_topic_day
  ON public.revision_events(user_id, topic_id, revision_epoch_day)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_revision_events_user_rev ON public.revision_events(user_id, rev);

CREATE OR REPLACE FUNCTION public.check_revision_parent_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_topic_progress t
    WHERE t.id = NEW.topic_id AND t.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Parent topic_id does not belong to user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revision_events_parent_owner ON public.revision_events;
CREATE TRIGGER trg_revision_events_parent_owner
  BEFORE INSERT OR UPDATE ON public.revision_events
  FOR EACH ROW EXECUTE FUNCTION public.check_revision_parent_owner();

DROP TRIGGER IF EXISTS trg_revision_events_ownership ON public.revision_events;
CREATE TRIGGER trg_revision_events_ownership
  BEFORE UPDATE ON public.revision_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_change();

DROP TRIGGER IF EXISTS trg_revision_events_rev ON public.revision_events;
CREATE TRIGGER trg_revision_events_rev
  BEFORE INSERT OR UPDATE ON public.revision_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_prep_updated_at_and_rev();

ALTER TABLE public.revision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_events FORCE ROW LEVEL SECURITY;

CREATE POLICY revision_events_select_own ON public.revision_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY revision_events_insert_own_pro ON public.revision_events
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND public.has_pro(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_topic_progress t
      WHERE t.id = topic_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY revision_events_update_own_pro ON public.revision_events
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_pro(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_topic_progress t
      WHERE t.id = topic_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY revision_events_delete_own_pro ON public.revision_events
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.has_pro(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. mock_tests (strict count arithmetic & total_score <= max_marks)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mock_tests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL CHECK (char_length(exam_id) BETWEEN 2 AND 64),
  attempt_year INTEGER NOT NULL CHECK (attempt_year BETWEEN 2020 AND 2040),
  mock_name TEXT NOT NULL CHECK (char_length(mock_name) BETWEEN 1 AND 160),
  date_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_questions INTEGER NOT NULL CHECK (total_questions >= 0),
  attempted_questions INTEGER NOT NULL CHECK (attempted_questions >= 0),
  correct_answers INTEGER NOT NULL CHECK (correct_answers >= 0),
  incorrect_answers INTEGER NOT NULL CHECK (incorrect_answers >= 0),
  unanswered_questions INTEGER NOT NULL CHECK (unanswered_questions >= 0),
  positive_marks_per_q NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (positive_marks_per_q >= 0),
  negative_marks_per_q NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (negative_marks_per_q >= 0),
  total_score NUMERIC(8, 2) NOT NULL,
  max_marks NUMERIC(8, 2) NOT NULL CHECK (max_marks > 0),
  percentage NUMERIC(6, 2) NOT NULL,
  accuracy_percent NUMERIC(6, 2) NOT NULL CHECK (accuracy_percent >= 0 AND accuracy_percent <= 100),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 1),
  avg_seconds_per_question NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (avg_seconds_per_question >= 0),
  weakest_subject TEXT,
  weakest_subject_accuracy NUMERIC(6, 2),
  is_quick_entry BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 240),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  rev BIGINT NOT NULL DEFAULT nextval('public.prep_rev_seq'),
  CONSTRAINT chk_mock_counts_add_up CHECK (
    attempted_questions = correct_answers + incorrect_answers
    AND attempted_questions + unanswered_questions = total_questions
  ),
  CONSTRAINT chk_mock_score_le_max CHECK (total_score <= max_marks)
);

CREATE INDEX IF NOT EXISTS idx_mock_tests_user_rev ON public.mock_tests(user_id, rev);

DROP TRIGGER IF EXISTS trg_mock_tests_ownership ON public.mock_tests;
CREATE TRIGGER trg_mock_tests_ownership
  BEFORE UPDATE ON public.mock_tests
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_change();

DROP TRIGGER IF EXISTS trg_mock_tests_rev ON public.mock_tests;
CREATE TRIGGER trg_mock_tests_rev
  BEFORE INSERT OR UPDATE ON public.mock_tests
  FOR EACH ROW EXECUTE FUNCTION public.touch_prep_updated_at_and_rev();

ALTER TABLE public.mock_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_tests FORCE ROW LEVEL SECURITY;

CREATE POLICY mock_tests_select_own ON public.mock_tests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY mock_tests_insert_own_pro ON public.mock_tests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));
CREATE POLICY mock_tests_update_own_pro ON public.mock_tests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));
CREATE POLICY mock_tests_delete_own_pro ON public.mock_tests
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.has_pro(auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. question_attempts (child of mock_tests; parent must belong to same user)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_attempts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL CHECK (char_length(exam_id) BETWEEN 2 AND 64),
  question_number INTEGER NOT NULL CHECK (question_number >= 1),
  subject TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'moderate',
  selected_answer TEXT,
  correct_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent_seconds INTEGER NOT NULL DEFAULT 60 CHECK (time_spent_seconds >= 0),
  error_category TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  rev BIGINT NOT NULL DEFAULT nextval('public.prep_rev_seq')
);

CREATE INDEX IF NOT EXISTS idx_question_attempts_user_rev ON public.question_attempts(user_id, rev);

CREATE OR REPLACE FUNCTION public.check_attempt_parent_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.mock_tests m
    WHERE m.id = NEW.mock_test_id AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Parent mock_test_id does not belong to user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_attempts_parent_owner ON public.question_attempts;
CREATE TRIGGER trg_question_attempts_parent_owner
  BEFORE INSERT OR UPDATE ON public.question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.check_attempt_parent_owner();

DROP TRIGGER IF EXISTS trg_question_attempts_ownership ON public.question_attempts;
CREATE TRIGGER trg_question_attempts_ownership
  BEFORE UPDATE ON public.question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_change();

DROP TRIGGER IF EXISTS trg_question_attempts_rev ON public.question_attempts;
CREATE TRIGGER trg_question_attempts_rev
  BEFORE INSERT OR UPDATE ON public.question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.touch_prep_updated_at_and_rev();

ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY question_attempts_select_own ON public.question_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY question_attempts_insert_own_pro ON public.question_attempts
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND public.has_pro(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.mock_tests m
      WHERE m.id = mock_test_id AND m.user_id = auth.uid()
    )
  );
CREATE POLICY question_attempts_update_own_pro ON public.question_attempts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_pro(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.mock_tests m
      WHERE m.id = mock_test_id AND m.user_id = auth.uid()
    )
  );
CREATE POLICY question_attempts_delete_own_pro ON public.question_attempts
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.has_pro(auth.uid()));

-- ----------------------------------------------------------------------------
-- 6. feature_flags (publicly readable; writable only via admin RPC)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,64}$'),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.feature_flags(key, enabled, description) VALUES
  ('exam_prep', TRUE, 'Multi-exam preparation planner and mock analytics'),
  ('ai_reflections', FALSE, 'Opt-in AI study reflections (requires Pro + key)'),
  ('institutes', FALSE, 'Coaching institute cohorts and consent-based sharing')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags FORCE ROW LEVEL SECURITY;

CREATE POLICY feature_flags_select_all ON public.feature_flags
  FOR SELECT TO anon, authenticated USING (TRUE);

-- ----------------------------------------------------------------------------
-- 7. admin_audit_logs (admin MFA read only; written by admin RPC / service_role)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 2 AND 100),
  target TEXT NOT NULL CHECK (char_length(target) BETWEEN 1 AND 120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON public.admin_audit_logs(created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_logs_select_admin_mfa ON public.admin_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin() AND public.has_aal2_mfa());

-- ----------------------------------------------------------------------------
-- 8. Security-Definer Admin RPCs (verify is_admin() AND aal2 MFA claim)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_metrics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_since TIMESTAMPTZ := now() - make_interval(days => v_days);
  v_total_users BIGINT;
  v_active_pro BIGINT;
  v_sessions_count BIGINT;
  v_mocks_count BIGINT;
BEGIN
  IF NOT (public.is_admin() AND public.has_aal2_mfa()) THEN
    RAISE EXCEPTION 'Forbidden: admin role with aal2 MFA required';
  END IF;

  SELECT COUNT(*) INTO v_total_users FROM public.profiles;
  SELECT COUNT(DISTINCT user_id) INTO v_active_pro
    FROM public.entitlements
    WHERE status IN ('active', 'grace_period')
      AND (current_period_end IS NULL OR current_period_end > now());
  SELECT COUNT(*) INTO v_sessions_count
    FROM public.sessions WHERE deleted_at IS NULL AND created_at >= v_since;
  SELECT COUNT(*) INTO v_mocks_count
    FROM public.mock_tests WHERE deleted_at IS NULL AND date_timestamp >= v_since;

  RETURN jsonb_build_object(
    'windowDays', v_days,
    'totalUsers', v_total_users,
    'activeProUsers', v_active_pro,
    'sessionsLogged', v_sessions_count,
    'mocksLogged', v_mocks_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_feature_flag(p_key TEXT, p_enabled BOOLEAN, p_reason TEXT DEFAULT '')
RETURNS public.feature_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.feature_flags;
BEGIN
  IF NOT (public.is_admin() AND public.has_aal2_mfa()) THEN
    RAISE EXCEPTION 'Forbidden: admin role with aal2 MFA required';
  END IF;

  UPDATE public.feature_flags
  SET enabled = p_enabled,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE key = p_key
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown feature flag: %', p_key;
  END IF;

  INSERT INTO public.admin_audit_logs(actor_user_id, action, target, metadata)
  VALUES (
    auth.uid(),
    'set_feature_flag',
    p_key,
    jsonb_build_object('enabled', p_enabled, 'reason', left(COALESCE(p_reason, ''), 200))
  );

  RETURN v_row;
END;
$$;
