# Tempo 4.0 Security Review

## 1. Threat Model & Key Controls

| Threat | Mitigation Implemented | Verification |
|---|---|---|
| Cross-user data read/write or ID collision upsert | `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on every public table; `user_id` derived solely from verified JWT (`auth.uid()`); `prevent_ownership_change()` triggers; parent-owner triggers + RLS `WITH CHECK` on `revision_events` and `question_attempts`. | Static SQL audit (`web/test/migrations-static.test.mjs`) + route tests (`web/test/routes.test.mjs`); live Postgres RLS test suite (`web/test/db-rls.test.mjs`) ready for CI. |
| Privilege escalation (`role = 'admin'`) | `protect_profile_role()` BEFORE trigger rejects any role change unless `public.is_service_role()`. | Static SQL audit + `db-rls.test.mjs`. |
| Admin account compromise | All admin routes & PostgreSQL RPCs (`admin_metrics`, `set_feature_flag`, `admin_audit_logs` RLS) enforce `is_admin() AND has_aal2_mfa()` (`aal2` MFA claim). Mutations write `admin_audit_logs`. | `web/test/routes.test.mjs` + `migrations-static.test.mjs`. |
| Client-forged billing / price tampering / replay | Prices come strictly from server `SERVER_PRICES`; Razorpay signatures verified via constant-time HMAC-SHA256; Play purchases verified via Android Publisher API + package/product match; purchase token hashes unique per user (`409` on cross-user reuse); webhook/RTDN events deduplicated in `webhook_events`. | `web/test/routes.test.mjs`. |
| Forged Google Play RTDN push messages | `POST /api/billing/play/rtdn` verifies Google RS256 OIDC Bearer JWT (cryptographic signature, `iss`, `aud`, `email`, `email_verified`, `exp`) and always re-fetches authoritative state from Android Publisher API. | `web/test/routes.test.mjs` (ephemeral RSA-2048 JWT tests). |
| Exposure of raw Google Play purchase tokens | `play_purchases` has **zero** authenticated/anon RLS policies (service-role only), stores `purchase_token_hash` (SHA-256) and `purchase_token_enc` (AES-256-GCM with 32-byte `PLAY_TOKEN_ENCRYPTION_KEY`); user export uses token-free `user_play_purchases_summary`. | `migrations-static.test.mjs` + `routes.test.mjs`. |
| AI spend abuse / replay / API key leakage | Exact 8-step gate order on `/api/reflections`; distributed Upstash Redis rate limits, single-use nonce cache (`SET NX EX`), and global daily AI budget; Gemini API key passed strictly via `x-goog-api-key` header (fixed legacy `?key=` URL bug in `backend/server.js`); notes excluded unless separately opted in and PII-redacted. | `backend/test/server.test.js` + `web/test/routes.test.mjs`. |
| Signed-out Android reflection abuse | Cloud Run proxy enforces UUID `X-Installation-Id`, ±5 min `X-Request-Timestamp`, single-use `X-Request-Nonce`, 16 KB body cap, Play Integrity RS256 OAuth verification with ±5 min `timestampMillis` freshness, configurable device policy (default `device`), and optional `LICENSED` check. | `backend/test/server.test.js`. |
| Sensitive data in logs | Structured JSON logs emit only `ts`, `level`, `requestId`, `route`, `method`, `status`, `latencyMs`, `code` — never notes, subjects, emails, JWTs, purchase tokens, or API keys. | Inspected across `web/src/lib/server/logger.mjs` and `backend/server.js`. |
| Secret commits | All `.env.example` files contain empty values only; server secrets never prefixed with `NEXT_PUBLIC_`; CI runs automated secret scan. | Verified via `grep` secret scan (0 matches). |

---

## 2. Exhaustive List of `service_role` Usages

Data access for user-owned records (`sessions`, `user_state`, `user_exam_plans`, `user_topic_progress`, `revision_events`, `mock_tests`, `question_attempts`, `sync_devices`, `user_consents`, `profiles`) uses the **caller's Supabase JWT** so RLS applies on every query.

`SUPABASE_SERVICE_ROLE_KEY` is restricted exclusively to the following operations where RLS cannot express the rule:

| Location | Operation | Justification (Why RLS Cannot Express It) |
|---|---|---|
| `web/src/lib/server/handlers/razorpayHandler.mjs` via `supabaseAdapter.ts` | Insert/update `payments` & `entitlements`, insert `webhook_events` | Entitlements and payment receipts must never be client-writable; Razorpay webhooks have no user JWT. |
| `web/src/lib/server/handlers/playBillingHandler.mjs` via `supabaseAdapter.ts` | Read/write `play_purchases`, upsert `entitlements`, insert `webhook_events` | `play_purchases` holds encrypted purchase tokens and has zero user RLS policies; RTDN Pub/Sub push has Google OIDC auth (no user JWT) and must check cross-user token uniqueness. |
| `web/src/lib/server/handlers/reflectionsHandler.mjs` via `supabaseAdapter.ts` | Increment `ai_usage` monthly counters | Prevents users from resetting or spoofing their own monthly AI quota counts. |
| `web/src/lib/server/handlers/accountHandler.mjs` via `supabaseAdapter.ts` | `auth.admin.deleteUser(userId)` (`DELETE /api/account`) | Supabase requires admin/service-role privileges to delete the `auth.users` row (which triggers `ON DELETE CASCADE` across all user tables) after verifying typed `"DELETE"` confirmation and zero owned institutes. |
| `web/src/lib/server/handlers/meAndFlagsHandler.mjs` (`GET /api/health`) | Lightweight `SELECT 1` / table probe | Unauthenticated uptime probe has no user JWT; reads zero user records. |

---

## 3. Open Risks & Items Requiring Live Verification

1. **Live PostgreSQL / PGlite Execution (`NOT VERIFIED` locally):** Because this build container has no outbound network to install `@electric-sql/pglite` or connect to Supabase Postgres, `web/test/db-rls.test.mjs` has been written and statically aligned against `0001..0003` but must be executed in GitHub Actions CI or a networked dev environment (`cd web && npm install && node --test test/db-rls.test.mjs`).
2. **Live External Provider Integration (`NOT VERIFIED` locally):** End-to-end verification against live Google Play Integrity (`decodeIntegrityToken`), Google Play Android Publisher (`subscriptionsv2.get` + RTDN Pub/Sub OIDC keys fetched from `https://www.googleapis.com/oauth2/v3/certs`), Razorpay test-mode checkout/webhooks, and Upstash Redis REST requires provisioned credentials and network access.
3. **Production Deployment & Restore Drill (`NOT VERIFIED` locally):** PITR backup restore drill, Supabase MFA enrollment for admin accounts, and k6 load test against deployed Vercel `bom1` + Supabase must be executed during staging rollout (see `docs/DEPLOYMENT.md`).
4. **Google OIDC JWKS Caching in `supabaseAdapter.ts` / Next.js Route:** Ensure production Vercel deployment fetches and caches Google's OIDC JWKS (`https://www.googleapis.com/oauth2/v3/certs`) respecting `Cache-Control: max-age` headers (already wired in `play/rtdn/route.ts` via env/JWKS loader).
