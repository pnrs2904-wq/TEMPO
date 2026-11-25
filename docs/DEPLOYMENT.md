# Tempo 4.0 deployment (live setup)

| Piece | Where | Status |
|---|---|---|
| Database + accounts | Supabase project `tempo` (`hxgzsguxrqfwmxajqvci`, Mumbai) | **Live.** Migrations 0001–0007 applied, advisors clean |
| Website + API | Cloudflare Worker `tempo` → https://tempo.harinag9590.workers.dev | **Live.** Builds and deploys on every push to `main` |
| Android app | Built by GitHub Actions | Points at the live backend by default |
| Signed-out AI proxy (`backend/`) | Cloud Run (optional) | Not deployed; only needed for AI without an account |

## 1. Supabase (done)

Already applied: all migrations in `web/supabase/migrations`. Feature flags: `exam_prep` on, `ai_reflections` off, `institutes` off.

Still to do in the Supabase dashboard:
1. **Authentication → URL Configuration**: Site URL `https://tempo.harinag9590.workers.dev`; Redirect URLs `https://tempo.harinag9590.workers.dev/app` and `https://tempo.harinag9590.workers.dev/reset`.
2. **Authentication → Sign In / Providers → Google** (optional): create an OAuth client in Google Cloud (type *Web application*, redirect URI `https://hxgzsguxrqfwmxajqvci.supabase.co/auth/v1/callback`), paste its id and secret. For Android sign-in, also add the Android OAuth client's id in the same provider's "Authorized Client IDs".
3. **Authentication → Multi-Factor**: keep TOTP enabled (the admin page needs it).
4. Make yourself admin, after signing up on the site once (SQL editor):
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR@EMAIL');`

## 2. Website on Cloudflare Workers

Connected: Cloudflare → Workers & Pages → `tempo` builds from GitHub `pnrs2904-wq/TEMPO`, root directory `web`, build `npx opennextjs-cloudflare build`, deploy `npx wrangler deploy`. Every push to `main` redeploys (free plan; commercial use allowed).

Public values (Supabase URL and anon key, site URL) are in `web/.env.production`. Add secrets in **Cloudflare → Workers & Pages → tempo → Settings → Variables and Secrets** (type *Secret*); they apply on the next deploy (or click *Deploy*):

| Variable | Needed for | Where to get it |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | payments, account deletion, AI quota | Supabase → Project Settings → API Keys (service_role / secret) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | web payments | Razorpay → Account & Settings → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | refunds and payment events | the secret you type when creating the webhook (§3) |
| `GEMINI_API_KEY` (+ `ai_reflections` flag on) | AI reflections | aistudio.google.com |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | shared rate limits (optional) | upstash.com |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_TOKEN_ENCRYPTION_KEY`, `PLAY_RTDN_AUDIENCE`, `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` | Android purchases | §4 |

`PLAY_TOKEN_ENCRYPTION_KEY`: 32 random bytes, base64 (`openssl rand -base64 32`). Keep a copy: stored purchase tokens cannot be read without it.

Local check of the Cloudflare build: `cd web && npm run preview` (runs the Worker in Cloudflare's runtime on your machine).

The earlier Netlify site (`tempo-focus-study`) is not used; unlink or delete it in Netlify.

## 3. Razorpay

Webhook: Account & Settings → Webhooks → Add: URL `https://tempo.harinag9590.workers.dev/api/billing/webhook`, a secret you make up (→ `RAZORPAY_WEBHOOK_SECRET`), events `payment.captured`, `payment.failed`, `refund.processed`. Start in test mode; switch keys to live after the smoke test.

Prices are fixed in `web/src/lib/server/config.mjs` (₹199 / ₹1,499 / ₹3,999). A unit test fails if the website shows different prices.

## 4. Google Play (Android purchases)

1. Play Console → Monetize → create subscriptions `pro_monthly`, `pro_annual` and in-app product `lifetime`.
2. Google Cloud: service account with the Android Publisher API enabled; Play Console → Users and permissions → invite its email with financial-data access. Its JSON key → `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
3. Real-time developer notifications: Pub/Sub topic + **push** subscription to `https://tempo.harinag9590.workers.dev/api/billing/play/rtdn` with authentication on (service account → `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`, audience → `PLAY_RTDN_AUDIENCE`). Put the topic in Play Console → Monetization setup.

## 5. Android build

Push the repository to GitHub; Actions → **Android** builds tests, lint and `tempo-4.0.0-debug.apk`. Run it manually (or tag `v4.0.0`) for release APK/AAB + `mapping.txt` + `SHA256SUMS`. Signing secrets (optional): `TEMPO_UPLOAD_KEYSTORE_BASE64`, `TEMPO_STORE_PASSWORD`, `TEMPO_KEY_PASSWORD`, `TEMPO_KEY_ALIAS`. The app talks to `https://tempo.harinag9590.workers.dev` and the Supabase project by default; override with repository variables `TEMPO_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## 6. Signed-out AI proxy (optional)

`backend/` on Cloud Run (`backend/cloudrun.yaml`) with `GEMINI_API_KEY`, Play Integrity settings; then set `TEMPO_BACKEND_URL` for the Android build. Signed-in users use `/api/reflections` on the website instead.

## 7. Smoke test after deploy

1. `https://tempo.harinag9590.workers.dev/api/health` → `{"status":"ok"}`.
2. Sign up with email; confirm; open Settings → Account shows your email.
3. Buy Pro (Razorpay test card); Settings shows the plan; reload Patterns.
4. Record a session on the web; sign in on Android with the same account; sync; it appears. Edit it on the phone; it updates on the web.
5. Make yourself admin (§1.4); open /app/admin; set up the authenticator; metrics load; toggle a flag; it appears in the audit log.
6. Settings → Delete account (test user) → the user is gone from Supabase → Authentication.
