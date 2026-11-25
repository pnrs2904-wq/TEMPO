-- ============================================================================
-- Tempo 4.0 launch fixes
--   1. Every new auth user gets a profile row (nothing created one before, so /api/me,
--      AI opt-in and admin roles had no row to read or update).
--   2. Backfill profiles for any users created before this migration.
--   3. Anonymous callers cannot execute any public function; signed-in users keep the ones
--      the apps call. Admin functions still check is_admin() and MFA themselves.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    'user',
    NULLIF(left(COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''), 80), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, role)
SELECT u.id, 'user' FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Function privileges: nothing for anon; explicit grants for signed-in users.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
-- Trigger-only function: never callable directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
