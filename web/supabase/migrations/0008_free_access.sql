-- 0008: launch offer. Every signed-in user gets Pro features free until a set moment.
--
-- One public, read-only setting decides the end of the free window. has_pro() honours it, so the
-- RLS-gated cloud sync tables accept writes from everyone while it is open, and the server's
-- /api/me reports Pro to the web and Android apps. When the moment passes nothing has to be
-- deployed: access falls back to paid entitlements automatically. To change the date:
--   update public.app_settings set value = '2027-01-31T23:59:59+05:30' where key = 'free_access_until';
-- To end it now: set value = now()::text (or delete the row).

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,64}$'),
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select_all ON public.app_settings;
CREATE POLICY app_settings_select_all ON public.app_settings
  FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON public.app_settings FROM anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;

-- Free until the end of 31 December 2026, India time.
INSERT INTO public.app_settings(key, value)
VALUES ('free_access_until', '2027-01-01T00:00:00+05:30')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.free_access_until()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN value ~ '^\d{4}-\d{2}-\d{2}' THEN value::timestamptz END
  FROM public.app_settings
  WHERE key = 'free_access_until';
$$;

CREATE OR REPLACE FUNCTION public.has_pro(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Users may ask only about themselves; the server (service role) may ask about anyone.
    (p_user_id = auth.uid() OR public.is_service_role())
    AND (
      coalesce(public.free_access_until() > now(), FALSE)
      OR EXISTS (
        SELECT 1
        FROM public.entitlements e
        WHERE e.user_id = p_user_id
          AND e.plan IN ('pro_monthly', 'pro_annual', 'lifetime')
          AND e.status IN ('active', 'grace_period')
          AND (e.current_period_end IS NULL OR e.current_period_end > now())
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.free_access_until() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.free_access_until() TO anon, authenticated, service_role;
