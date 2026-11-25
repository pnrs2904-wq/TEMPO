-- ============================================================================
-- Tempo 4.0 Migration 0003: Google Play Purchases, Multi-Source Entitlements,
-- Sync Devices, DPDP Consent Ledger, and Idempotent Webhook Events
-- ============================================================================
-- Note: rate_limits is intentionally NOT a Postgres table; distributed rate
-- limits, nonce replay cache, and global daily AI budget live in Upstash Redis.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. entitlements: add source (razorpay | play | grant) & source_ref
--    Enforce one active Pro entitlement per user via unique partial index
-- ----------------------------------------------------------------------------
ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'grant'
    CHECK (source IN ('razorpay', 'play', 'grant')),
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_one_active_pro_per_user
  ON public.entitlements(user_id)
  WHERE plan IN ('pro_monthly', 'pro_annual', 'lifetime')
    AND status IN ('active', 'grace_period');

-- ----------------------------------------------------------------------------
-- 2. play_purchases (service_role ONLY; users read summary view without token)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.play_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL CHECK (product_id IN ('pro_monthly', 'pro_annual', 'lifetime')),
  purchase_token_hash TEXT NOT NULL UNIQUE,
  purchase_token_enc TEXT NOT NULL,
  order_id TEXT,
  state TEXT NOT NULL CHECK (state IN (
    'pending', 'active', 'grace_period', 'account_hold',
    'paused', 'canceled', 'expired', 'revoked', 'voided'
  )),
  expiry_time TIMESTAMPTZ,
  auto_renewing BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  linked_purchase_token_hash TEXT,
  raw_latest_notification_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_play_purchases_user_id ON public.play_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_play_purchases_order_id ON public.play_purchases(order_id);

ALTER TABLE public.play_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_purchases FORCE ROW LEVEL SECURITY;
-- Zero policies for anon or authenticated: service_role exclusively reads/writes play_purchases.

-- Safe read-only summary view for users (NEVER exposes purchase_token_hash or purchase_token_enc)
CREATE OR REPLACE VIEW public.user_play_purchases_summary
WITH (security_invoker = false)
AS
SELECT
  pp.id,
  pp.user_id,
  pp.product_id,
  pp.order_id,
  pp.state,
  pp.expiry_time,
  pp.auto_renewing,
  pp.acknowledged,
  pp.created_at,
  pp.updated_at
FROM public.play_purchases pp
WHERE pp.user_id = auth.uid();

REVOKE ALL ON public.play_purchases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_play_purchases_summary TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. sync_devices (optional per-device diagnostics; own rows only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_devices (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL CHECK (char_length(device_id) BETWEEN 4 AND 128),
  platform TEXT NOT NULL CHECK (platform IN ('android', 'web', 'ios', 'other')),
  app_version TEXT NOT NULL CHECK (char_length(app_version) BETWEEN 1 AND 32),
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

DROP TRIGGER IF EXISTS trg_sync_devices_ownership ON public.sync_devices;
CREATE TRIGGER trg_sync_devices_ownership
  BEFORE UPDATE ON public.sync_devices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ownership_change();

ALTER TABLE public.sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_devices FORCE ROW LEVEL SECURITY;

CREATE POLICY sync_devices_select_own ON public.sync_devices
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY sync_devices_insert_own ON public.sync_devices
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY sync_devices_update_own ON public.sync_devices
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY sync_devices_delete_own ON public.sync_devices
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. user_consents (India DPDP Act 2023 verifiable consent records)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('ai_reflections', 'ai_notes_sharing', 'institute_sharing')),
  granted BOOLEAN NOT NULL,
  notice_version TEXT NOT NULL DEFAULT 'dpdp-2026-v1',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_purpose ON public.user_consents(user_id, purpose, recorded_at DESC);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents FORCE ROW LEVEL SECURITY;

CREATE POLICY user_consents_select_own ON public.user_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY user_consents_insert_own ON public.user_consents
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. webhook_events (idempotency registry for Razorpay & Play RTDN; service_role only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  provider TEXT NOT NULL CHECK (provider IN ('razorpay', 'play_rtdn')),
  event_id TEXT NOT NULL CHECK (char_length(event_id) BETWEEN 2 AND 200),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_events FROM PUBLIC, anon, authenticated;
