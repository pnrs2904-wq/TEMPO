# Tempo 4.0 test report

Run on 25 November 2026. Every number below is from a run that completed in this session.

## Passed

| Suite | Command | Result |
|---|---|---|
| Website typecheck | `cd web && npm run typecheck` | 0 errors |
| Website unit tests (domain engines, Kotlin parity, wire format, prices = server prices) | `cd web && npx vitest run tests/unit` | **126 passed** |
| API route handlers (sync, Razorpay, Play verify + RTDN, reflections, account, admin, me/flags/health) | `cd web && npm run test:server` | **17 passed** |
| Real Postgres (PGlite, set up like Supabase: default grants, current JWT claims) — RLS, triggers, constraints, Android + web wire round trip, admin MFA gate, cascade delete | `cd web && npm run test:db` | **16 passed** |
| Website production build (34 pages and API routes) | `cd web && npm run build` | Succeeded |
| Local sync load test (50 users × 200 records) | `node loadtest/run-sync-load.mjs` | Passed, p95 ≈ 14 ms (in-memory database) |
| Secret scan (allow-lists only the public Supabase anon key) | see `.github/workflows/backend.yml` | Clean |
| Live Supabase project `tempo` (Mumbai) | migrations 0001–0007 applied; advisors re-run | 0 security errors; every table has RLS; 52 policies use the per-statement form; signup trigger present |

## Bugs found by running the tests (all fixed, each with a test)

| Area | Problem | Fix |
|---|---|---|
| Database tests | All 5 original tests failed: `pgcrypto` load, `profiles.user_id` (column is `id`), sessions without required columns, cascade run as the wrong role. `assert.rejects` accepted any error, so attack tests could pass for the wrong reason. | Rewritten: 16 tests, each refusal matched to its reason. |
| `is_service_role()` | Read `request.jwt.claim.role`, which current PostgREST no longer sets: the service role and the dashboard SQL editor could never change roles. | Reads `request.jwt.claims`; the operator session counts only when no JWT is present. |
| `has_pro(uuid)` | Any signed-in user could ask whether any other user has Pro. | Answers only about the caller (or for the service role). |
| Signup | No profile row was created for new users. | `on_auth_user_created` trigger + backfill (0004). |
| Sync, server | The adapter wrote camelCase fields into snake_case columns: every live sync write would fail. Hidden by an in-memory test fake. | `wire.mjs` field map, tested against the real tables. |
| Sync, Android contract | Server rejected Android's `sessionsCursor` field (strict keys) → every Android sync 400; responses used ISO dates and `cursor` where Android reads epoch ms and `sessionsCursor`. | Server accepts both names, returns both, times as epoch ms. |
| Sync, timestamps | A trigger replaced each record's edit time with server arrival time, so a late-synced old edit beat a real newer edit. | Client edit time kept (future times already rejected). |
| Preferences | Any push overwrote stored preferences, even a stale one. | Last write wins. |
| Razorpay verify | Plan taken from the request: pay for monthly, claim lifetime. | Plan from the server-created order for that user. |
| Razorpay renew | Buying again early threw away the remaining days; buying monthly over lifetime replaced lifetime. | Renewals stack; lifetime holders are not sold another plan. |
| Cancel / account deletion | Called Razorpay's cancel-subscription API with a payment id; deletion refused when that failed → Razorpay payers could never delete their account. | Only real `sub_` ids are cancelled. |
| Entitlement renewal | A Play renewal of the same token hit the one-active-Pro index; the insert error was ignored. | All active rows retired first; errors raised. |
| `/api/me` | Android reads `productId` / `expiresAt`; neither was sent. | Added. |
| Android build | Missing `debug.keystore`; Robolectric pinned to `/home/appuser/...` → a clean checkout could not build or test. | Fallbacks. |

## Not run here, and how to run them

| Item | Why | How |
|---|---|---|
| Android Gradle build, unit tests, lint, APK/AAB | Google/Maven/Gradle hosts are blocked from this workspace. | Push to GitHub: `.github/workflows/android.yml` builds and tests, and uploads the APK with SHA256SUMS. |
| Website deploy | `api.netlify.com` is blocked from this workspace. | Connect the GitHub repo to the Netlify site (DEPLOYMENT.md §2). |
| Live payments, Google sign-in, Play Billing, Gemini | Need your keys / consoles. | DEPLOYMENT.md §3–6, then the smoke tests in §7. |
