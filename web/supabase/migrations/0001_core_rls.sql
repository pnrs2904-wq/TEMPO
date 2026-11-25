-- ============================================================================
-- Tempo 4.0 Migration 0001: Core Tables, Roles, Triggers, and Strict RLS
-- ============================================================================
-- Security invariants:
--   1. Every table enables AND forces Row Level Security (RLS).
--   2. user_id is always derived from auth.uid(); ownership cannot be reassigned.
--   3. profiles.role (user|admin) can only be modified by service_role.
--   4. rev increments strictly monotonically on every write.
--   5. Deleting auth.users cascades to all user-owned records.
-- ============================================================================

-- gen_random_uuid() is built into Postgres 13+; pgcrypto is not needed.

-- Shared revision sequence for sessions & core tables
CREATE SEQUENCE IF NOT EXISTS public.core_rev_seq START 1;

-- ----------------------------------------------------------------------------
-- Helper functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  -- API requests carry JWT claims: current PostgREST sets request.jwt.claims (JSON), older
  -- versions request.jwt.claim.role. With no claims at all, only the operator's own session
  -- (migrations, dashboard SQL editor) counts, never a SECURITY DEFINER call made for a user.
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  NULLIF(current_setting('request.jwt.claim.role', true), '')) = 'service_role'
      OR (COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), NULLIF(current_setting('request.jwt.claim.role', true), '')) IS NULL
          AND session_user IN ('postgres', 'supabase_admin'));
$$;

CREATE OR REPLACE FUNCTION public.has_aal2_mfa()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', '') = 'aal2';
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at_and_rev()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Keep the client's edit time: sync merges compare edit times across devices, and the API
  -- already rejects times more than 5 minutes ahead. Overwriting it with now() would make a
  -- late-synced old edit look newer than a real newer edit from another device.
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  NEW.rev := nextval('public.core_rev_seq');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_ownership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Ownership transfer (user_id change) is forbidden';
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) <= 80),
  ai_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ai_notes_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'user' AND NOT public.is_service_role() THEN
      RAISE EXCEPTION 'Only service_role may assign non-user roles';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_service_role() THEN
      RAISE EXCEPTION 'Only service_role may modify profiles.role';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_role ON public.profiles;
CREATE TRIGGER trg_profiles_protect_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'user');

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = 'user');

-- Security-definer helper for checking admin status (used by RLS & admin RPCs)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. entitlements (written ONLY by service_role after provider verification)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro_monthly', 'pro_annual', 'lifetime')),
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'active', 'grace_period', 'account_hold', 'pending', 'canceled', 'expired', 'revoked')),
  includes_ai BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON public.entitlements(user_id);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements FORCE ROW LEVEL SECURITY;

CREATE POLICY entitlements_select_own ON public.entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policies for authenticated or anon: strictly service_role only.

CREATE OR REPLACE FUNCTION public.has_pro(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entitlements e
    WHERE e.user_id = p_user_id
      -- Users may ask only about themselves; the server (service role) may ask about anyone.
      AND (p_user_id = auth.uid() OR public.is_service_role())
      AND e.plan IN ('pro_monthly', 'pro_annual', 'lifetime')
      AND e.status IN ('active', 'grace_period')
      AND (e.current_period_end IS NULL OR e.current_period_end > now())
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. sessions (Pro-gated writes for cloud sync; own rows only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('focus', 'break')),
  energy SMALLINT NOT NULL CHECK (energy BETWEEN 1 AND 5),
  subject TEXT NOT NULL DEFAULT '' CHECK (char_length(subject) <= 60),
  session_type TEXT NOT NULL DEFAULT 'Study' CHECK (char_length(session_type) <= 40),
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 360),
  actual_seconds INTEGER NOT NULL CHECK (actual_seconds >= 0 AND actual_seconds <= 86400),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'ended_early', 'cancelled')),
  focus_quality SMALLINT CHECK (focus_quality IS NULL OR focus_quality BETWEEN 1 AND 5),
  difficulty SMALLINT CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
  duration_feedback TEXT CHECK (duration_feedback IS NULL OR duration_feedback IN ('not_sure', 'too_short', 'about_right', 'too_long')),
  distractions INTEGER CHECK (distractions IS NULL OR distractions >= 0),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  rev BIGINT NOT NULL DEFAULT nextval('public.core_rev_seq'),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_rev ON public.sessions(user_id, rev);
CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON public.sessions(user_id, started_at DESC);

DROP TRIGGER IF EXISTS trg_sessions_ownership ON public.sessions;
CREATE TRIGGER trg_sessions_ownership
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_change();

DROP TRIGGER IF EXISTS trg_sessions_rev ON public.sessions;
CREATE TRIGGER trg_sessions_rev
  BEFORE INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_and_rev();

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY sessions_select_own ON public.sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY sessions_insert_own_pro ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));

CREATE POLICY sessions_update_own_pro ON public.sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));

CREATE POLICY sessions_delete_own_pro ON public.sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. user_state (preferences & round-cycle settings, Pro-gated cloud sync)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rev BIGINT NOT NULL DEFAULT nextval('public.core_rev_seq')
);

DROP TRIGGER IF EXISTS trg_user_state_ownership ON public.user_state;
CREATE TRIGGER trg_user_state_ownership
  BEFORE UPDATE ON public.user_state
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_change();

DROP TRIGGER IF EXISTS trg_user_state_rev ON public.user_state;
CREATE TRIGGER trg_user_state_rev
  BEFORE INSERT OR UPDATE ON public.user_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_and_rev();

ALTER TABLE public.user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_state FORCE ROW LEVEL SECURITY;

CREATE POLICY user_state_select_own ON public.user_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_state_insert_own_pro ON public.user_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));

CREATE POLICY user_state_update_own_pro ON public.user_state
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.has_pro(auth.uid()));

CREATE POLICY user_state_delete_own_pro ON public.user_state
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.has_pro(auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. payments (Razorpay order/subscription records; writes strictly service_role)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('razorpay', 'play')),
  provider_payment_id TEXT UNIQUE,
  provider_order_id TEXT,
  provider_subscription_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('pro_monthly', 'pro_annual', 'lifetime')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

CREATE POLICY payments_select_own ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. institutes, groups, group_members (consent-based sharing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutes FORCE ROW LEVEL SECURITY;

CREATE POLICY institutes_select_owner ON public.institutes
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY institutes_insert_owner ON public.institutes
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY institutes_update_owner ON public.institutes
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY institutes_delete_owner ON public.institutes
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups FORCE ROW LEVEL SECURITY;

CREATE POLICY groups_select_owner_or_member ON public.groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.institutes i
      WHERE i.id = groups.institute_id AND i.owner_user_id = auth.uid()
    )
  );

CREATE POLICY groups_manage_owner ON public.groups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.institutes i
      WHERE i.id = groups.institute_id AND i.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.institutes i
      WHERE i.id = groups.institute_id AND i.owner_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_study_metrics_consent BOOLEAN NOT NULL DEFAULT FALSE,
  consented_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members FORCE ROW LEVEL SECURITY;

CREATE POLICY group_members_select_self_or_owner ON public.group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      share_study_metrics_consent = TRUE
      AND EXISTS (
        SELECT 1 FROM public.groups g
        JOIN public.institutes i ON i.id = g.institute_id
        WHERE g.id = group_members.group_id AND i.owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY group_members_insert_self ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY group_members_update_self ON public.group_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY group_members_delete_self_or_owner ON public.group_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.groups g
      JOIN public.institutes i ON i.id = g.institute_id
      WHERE g.id = group_members.group_id AND i.owner_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 7. ai_usage (monthly per-user AI reflection ledger; writes service_role only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_key)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_select_own ON public.ai_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
