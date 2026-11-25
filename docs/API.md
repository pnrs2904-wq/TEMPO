# Tempo 4.0 Backend API Contract

- **Primary API Base URL (Vercel, region `bom1` Mumbai):** `https://tempo.example.com/api`
- **Signed-Out Android Reflection Service (Cloud Run, region `asia-south1`):** `https://reflections.tempo.example.com`
- **Android Application ID:** `com.tempo.focus`
- **Auth Model:** Supabase Auth JWT (`Authorization: Bearer <access_token>`). `user_id` is **never** accepted from request bodies; it is derived exclusively from the verified JWT and enforced in PostgreSQL via Row-Level Security (`FORCE ROW LEVEL SECURITY`).
- **Standard Security Headers (all responses):** `X-Request-Id`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cache-Control: no-store` (except `GET /api/flags`).

---

## 1. Sync & Core User Endpoints

### `POST /api/sync`
Bidirectional dual-cursor sync for `sessions`, `user_state` (preferences), and exam-prep tables (`user_exam_plans`, `user_topic_progress`, `revision_events`, `mock_tests`, `question_attempts`).
- **Auth:** Required (`Bearer <jwt>`). Pro entitlement required for non-empty writes (`403 PRO_REQUIRED`).
- **Rate Limits (Upstash Redis):** 60 req/min per user, 120 req/min per IP (`429 RATE_LIMITED`).
- **Conflict Rules (matches `shared/sync-contract-fixtures.json`):**
  - Later `updatedAt` wins.
  - On equal `updatedAt`, tombstone (`deletedAt != null`) wins.
  - Identical `updatedAt` & `deletedAt` is an idempotent `NO_OP` (does not advance sequence).
  - Client `updatedAt` > server time + 5 minutes is rejected per-record with `FUTURE_TIMESTAMP`.
  - Pull pages return at most **500 rows** with `more: true` when additional pages exist.
  - Passing `resetCursor: true` resets pull cursors to `0` (also suggested weekly by server via `resetCursor: true` to close Postgres sequence commit-order gaps).

**Wire format (shared by Android and the website; mapped to columns by `web/src/lib/server/wire.mjs`):**
- camelCase keys. Instants may be sent as epoch milliseconds (what Android sends) or ISO strings; **responses always use epoch milliseconds**.
- Calendar days are epoch-day integers (`examDateEpochDay`, `lastStudiedEpochDay`, `revisionEpochDay`, …).
- A session's start may be sent as `startedAt` or `timestamp` (Android). Responses carry both.
- The sessions cursor may be sent as `cursor` or `sessionsCursor` (Android, as a string). Responses carry both.
- Only listed fields are written; extra client fields (Android's `localId`) are ignored, and `user_id` always comes from the token.
- Web-only optional fields (migration 0005): sessions `tz`, `localDate`, `expectedDifficulty`, `topicId`, `mockScore`, `mockMaxScore`; mock tests `scoringMode` (`PER_QUESTION` | `MARKS_ENTRY`). A client that leaves them out never blanks them.
- `preferences` is last-write-wins on its `updatedAt`, like every record. The website stores its settings under `preferences.web`.

**Request Example:**
```json
{
  "cursor": 0,
  "prepCursor": 0,
  "resetCursor": false,
  "clientPlatform": "android",
  "appVersion": "4.0.0",
  "deviceId": "dev-android-001",
  "sessions": [
    {
      "id": "11111111-1111-4111-8111-111111111101",
      "startedAt": "2026-11-24T10:00:00.000Z",
      "phase": "focus",
      "energy": 4,
      "subject": "Physics",
      "sessionType": "Study",
      "plannedMinutes": 40,
      "actualSeconds": 2400,
      "status": "completed",
      "focusQuality": 5,
      "difficulty": 3,
      "durationFeedback": "about_right",
      "distractions": 0,
      "updatedAt": "2026-11-24T10:40:00.000Z",
      "deletedAt": null
    }
  ],
  "preferences": { "themeMode": "paper", "updatedAt": "2026-11-24T10:40:00.000Z" },
  "prep": [
    {
      "table": "user_exam_plans",
      "row": {
        "id": "22222222-2222-4222-8222-222222222201",
        "examId": "neet_ug",
        "applicableYear": 2026,
        "syllabusVersion": "NMC-NEET-UG-2026.1",
        "examDateEpochDay": 20575,
        "dailyHours": 5.0,
        "studyDaysPerWeek": 6,
        "targetScorePercent": 85,
        "updatedAt": "2026-11-24T10:40:00.000Z",
        "deletedAt": null
      }
    }
  ]
}
```

**Response `200 OK`:**
```json
{
  "cursor": 1,
  "prepCursor": 1,
  "more": false,
  "resetCursor": false,
  "sessions": [],
  "preferences": { "themeMode": "paper" },
  "prep": [],
  "accepted": [{ "id": "11111111-1111-4111-8111-111111111101", "table": "sessions", "updatedAt": 1795516800000, "status": "APPLY" }],
  "rejected": [],
  "rejectedSessions": [],
  "rejectedPrep": []
}
```

### `GET /api/me`
Returns authenticated user profile, Pro entitlement, admin flag, authoritative `SERVER_PRICES`, and platform-gated `paymentMethods` (`["google_play"]` when header `X-Client-Platform: android`, `["razorpay"]` on web).

**Response `200 OK`:**
```json
{
  "user": { "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "email": "asha@example.com" },
  "profile": { "role": "user", "displayName": "Asha", "aiOptIn": true, "aiNotesOptIn": false },
  "entitlement": { "isPro": true, "plan": "pro_monthly", "status": "active", "source": "play", "includesAi": true, "currentPeriodEnd": "2026-12-25T00:00:00.000Z", "productId": "pro_monthly", "expiresAt": "2026-12-25T00:00:00.000Z" },
  "isAdmin": false,
  "prices": {
    "pro_monthly": { "productId": "pro_monthly", "amountPaise": 19900, "currency": "INR", "includesAi": true },
    "pro_annual": { "productId": "pro_annual", "amountPaise": 149900, "currency": "INR", "includesAi": true },
    "lifetime": { "productId": "lifetime", "amountPaise": 399900, "currency": "INR", "includesAi": true }
  },
  "paymentMethods": ["google_play"]
}
```

### `GET /api/flags`
Public feature flags (`Cache-Control: public, max-age=300, stale-while-revalidate=60`). Falls back to safe defaults if DB is temporarily unreachable.

### `GET /api/health`
Database reachability probe. Returns `200 { "status": "ok", "database": "reachable", "timestamp": "..." }` or `503 { "status": "degraded", "database": "unreachable", "timestamp": "..." }`. Never exposes Postgres, Node, or Next.js versions.

---

## 2. Billing Endpoints (Web Razorpay & Android Google Play)

### `POST /api/billing/checkout` (Web / Razorpay)
Creates a Razorpay order using server-configured `SERVER_PRICES` (client cannot pass price/amount).
- **Request:** `{ "plan": "pro_monthly" | "pro_annual" | "lifetime" }`
- **Response `200 OK`:** `{ "keyId": "...", "orderId": "order_...", "amountPaise": 149900, "currency": "INR", "plan": "pro_annual" }`

### `POST /api/billing/verify` (Web / Razorpay)
Verifies the constant-time HMAC-SHA256 signature over `order_id|payment_id`, enforces payment ownership (`409 PAYMENT_OWNERSHIP_CONFLICT` on cross-user reuse), is idempotent on `razorpay_payment_id`, and grants Pro.
- **The plan comes from the order this server created at checkout for this user**, never from the request: an unknown or foreign order is `400 ORDER_NOT_FOUND`; a `plan` that differs from the order is `400 PLAN_MISMATCH`.
- Buying again before the current pass ends starts the new period when the current one ends (no paid days lost). Checkout refuses users who already hold lifetime (`409 ALREADY_LIFETIME`).
- **Request:** `{ "razorpay_order_id": "order_...", "razorpay_payment_id": "pay_...", "razorpay_signature": "<hex>" }` (`plan` optional, checked against the order)
- **Response `200 OK`:** `{ "verified": true, "entitlement": { ... } }`

### `POST /api/billing/webhook` (Razorpay Server-to-Server)
Verifies `X-Razorpay-Signature` HMAC-SHA256 over raw request body (`401 INVALID_WEBHOOK_SIGNATURE`), deduplicates via `webhook_events`, and updates entitlements for `payment.captured`, `subscription.charged`, `subscription.cancelled` (retains access through `current_period_end`), and `payment.refunded`/`refund.processed` (immediate revocation).

### `POST /api/billing/cancel` (Web / Razorpay)
Web checkout sells one-time passes, which never renew, so there is nothing to cancel at Razorpay. The entitlement is marked `canceled` and stays active until `currentPeriodEnd`. A real Razorpay subscription (`sub_…`, if added later) is cancelled at cycle end.

### `POST /api/billing/play/verify` (Android / Google Play Billing)
- **Auth:** Required (`Bearer <jwt>`).
- **Request:** `{ "productId": "pro_monthly" | "pro_annual" | "lifetime", "purchaseToken": "<token>", "orderId": "GPA...." }`
- **Behavior:** Checks SHA-256 token hash ownership (`409 TOKEN_OWNED_BY_ANOTHER_USER`), verifies purchase against Google Play Android Publisher API (`subscriptionsv2.get` or `products.get`), validates `packageName === "com.tempo.focus"` (`403 PACKAGE_MISMATCH`) and `productId` (`400 PRODUCT_MISMATCH`), encrypts token with AES-256-GCM before storing in service-role-only `play_purchases`, acknowledges server-side when active, and upserts `entitlements` with `source = 'play'`.
- **Response `200 OK`:** `{ "verified": true, "state": "active", "acknowledged": true, "entitlement": { ... } }`

### `POST /api/billing/play/rtdn` (Google Cloud Pub/Sub Push)
- **Auth:** Google-signed RS256 OIDC JWT in `Authorization: Bearer <token>` verified against Google JWKS, issuer, expected audience, service-account email, `email_verified === true`, and expiry (`401` on any failure).
- **Behavior:** Deduplicates on `message.messageId` in `webhook_events`, ignores unlinked/test notifications safely (`200`), and **always re-fetches authoritative state from Google Play Android Publisher API** before updating `play_purchases` and `entitlements` (handling active, grace period, account hold, paused, canceled, expired, revoked, voided).

---

## 3. AI Reflection Endpoints

### `POST /api/reflections` (Signed-In Web & Android)
Enforces the exact 8-step gate order:
1. Signed in (`401 UNAUTHORIZED`)
2. Active Pro plan includes AI (`403 PLAN_NO_AI`)
3. User opted in via `profile.ai_opt_in` (`403 AI_OPT_IN_REQUIRED`)
4. Feature flag `ai_reflections` enabled (`503 FEATURE_DISABLED`)
5. Server `GEMINI_API_KEY` present (`503 AI_UNAVAILABLE`)
6. Per-user/IP burst rate limit in Redis (`429 RATE_LIMITED`)
7. Per-user monthly quota in `ai_usage` (`429 MONTHLY_QUOTA_EXCEEDED`)
8. Global daily spend cap in Redis (`503 GLOBAL_BUDGET_EXCEEDED`)

Session notes are stripped unless **both** `profile.ai_notes_opt_in === true` AND `body.includeNotes === true`, and redacted for emails, phone numbers, API keys, and passwords before calling Gemini via `x-goog-api-key` header.

### `POST /api/v1/reflections` (Signed-Out Android Cloud Run Service)
- **Required Headers:** `Content-Type: application/json`, `X-Installation-Id: <uuid>`, `X-Request-Timestamp: <epoch_ms>` (within ±5 min), `X-Request-Nonce: <8..128 chars>` (single-use in Redis, `409 REPLAY_DETECTED`), and `X-Play-Integrity-Token` when `PLAY_INTEGRITY_ENABLED=true` (`403 INTEGRITY_FAILED`).
- **Play Integrity Policy:** Verifies package `com.tempo.focus`, nonce binding, `timestampMillis` freshness (±5 min), `PLAY_RECOGNIZED`, configurable device policy (`basic` | `device` [default] | `strong`), and optional `LICENSED` check.
- **Gemini Key:** Sent strictly via `x-goog-api-key` header (never query string).
- **`GET /health`:** Returns `200 { "status": "ok", "timestamp": "..." }`.

---

## 4. Account (DPDP Data Rights) & Admin MFA Endpoints

### `GET /api/account`
Exports full user data JSON (profile, preferences, sessions, exam prep records, consents, and payment summaries). Explicitly **omits** encrypted and hashed Google Play purchase tokens.

### `DELETE /api/account`
- **Request:** `{ "confirmation": "DELETE" }` (`400 CONFIRMATION_REQUIRED` otherwise).
- **Guards:** Refuses with `409 INSTITUTE_OWNER_MUST_TRANSFER` if user owns an institute. Cancels active Razorpay subscription server-side; returns `playCancelNotice` if user has an active Google Play subscription; cascades deletion via `auth.users(id)`.

### `GET /api/admin/metrics?days=30`, `POST /api/admin/flags`, `GET /api/admin/audit`
Require `profile.role === 'admin'` (`403 ADMIN_REQUIRED`) **and** `aal === 'aal2'` MFA (`403 MFA_REQUIRED`), verified both in the API handler and inside PostgreSQL `SECURITY DEFINER` RPCs (`is_admin() AND has_aal2_mfa()`). Every flag mutation writes a row to `admin_audit_logs`.
