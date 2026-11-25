# Tempo 4.0 Data Inventory (India DPDP Act 2023 Readiness)

> **Important Legal Notice:** This inventory is an engineering data-mapping artifact prepared for compliance readiness under India's Digital Personal Data Protection Act, 2023 (DPDP Act). Items marked **Legal Counsel Review Required** must be reviewed and approved by qualified Indian legal counsel before public launch.

- **Data Fiduciary (Placeholder):** Tempo Operator (`https://tempo.example.com`)
- **Support Contact:** `support@example.com`
- **Grievance Officer Contact (Placeholder):** `grievance@example.com` *(Legal Counsel Review Required: publish named Grievance Officer & SLA per DPDP Rules)*

---

## 1. Personal Data Inventory

| Data Category | Tables / Stores | Exact Fields | Purpose | Legal Basis / Consent | Storage Location | Retention & Deletion |
|---|---|---|---|---|---|---|
| Account Identity | `auth.users`, `public.profiles` | `user_id`, `email`, `display_name`, `role` | Authentication, cross-device sync, support | Explicit user sign-up consent (`user_consents`) | Supabase `ap-south-1` (Mumbai) | Retained until user deletes account (`DELETE /api/account` cascades immediately). |
| Study & Focus Records | `public.sessions`, `public.user_state` | Subject, energy, planned/actual minutes, focus quality, optional session notes, theme/timer preferences | Adaptive duration personalization & cross-device backup (Pro) | Explicit opt-in to cloud sync (`user_consents`) | On-device Room (offline) + Supabase `ap-south-1` (Pro sync) | Soft-deleted via `deleted_at` tombstones; hard-deleted on `DELETE /api/account`. |
| Exam Preparation Data | `user_exam_plans`, `user_topic_progress`, `revision_events`, `mock_tests`, `question_attempts` | Exam ID, exam date, syllabus progress, mock scores, revision history | Study planning & performance analytics | Explicit user entry & cloud sync consent | On-device Room + Supabase `ap-south-1` (Pro sync) | Hard-deleted via `ON DELETE CASCADE` on `DELETE /api/account`. |
| Billing & Entitlements | `public.payments`, `public.entitlements`, `public.play_purchases` | Plan, status, Razorpay order/payment ID, Google Play order ID, SHA-256 token hash, AES-256-GCM encrypted token | Subscription verification, anti-fraud, refund handling | Contractual necessity (paid subscription) | Supabase `ap-south-1` (raw tokens service-role only) | Entitlements & `play_purchases` cascade-delete on account deletion; *Legal Counsel Review Required: statutory GST/accounting retention window for tax invoices/payment logs (typically 6–8 years in India).* |
| AI Reflection Inputs | Transient in-memory (not persisted by Tempo; sent to Gemini API) | Sanitized session subject/energy/duration; optional redacted notes | Generate 1–2 sentence study reflection | Separate explicit opt-ins (`profile.ai_opt_in`, `profile.ai_notes_opt_in` + `user_consents`) | Processed via Vercel `bom1` / Cloud Run `asia-south1` -> Google Gemini API *(Legal Counsel Review Required: cross-border transfer disclosure under DPDP Sec. 16)* | Not stored in Tempo DB or logs; notes redacted for email/phone/keys before leaving server. |
| Abuse-Control & Sync Metadata | Upstash Redis, `public.sync_devices`, `public.ai_usage` | Ephemeral rate-limit counters, single-use nonce keys (5-min TTL), device ID/platform/app version, monthly AI request count | Abuse prevention, replay protection, quota enforcement | Legitimate security / service protection | Upstash Redis `ap-south-1` & Supabase `ap-south-1` | Redis keys auto-expire (5 min – 26 hr); `sync_devices` & `ai_usage` cascade-delete on account deletion. |
| Consent Ledger | `public.user_consents` | `consent_type`, `policy_version`, `granted`, `created_at` | Verifiable proof of informed consent & withdrawal | DPDP Act Sec. 6 notice & consent auditability | Supabase `ap-south-1` | Retained while account active; exportable via `GET /api/account`. |
| Institute Cohort Sharing | `public.institutes`, `public.groups`, `public.group_members` | `consent_share_stats`, `consent_granted_at` | Optional sharing of study progress with coaching mentor | Explicit revocable opt-in (`consent_share_stats`) | Supabase `ap-south-1` | Revocable at any time; `DELETE /api/account` blocks institute owners until ownership transfer. |

---

## 2. Data Principal Rights Supported in Backend

- **Right to Access / Data Portability:** `GET /api/account` exports a complete JSON archive of profile, preferences, sessions, exam prep records, consents, and token-free purchase summaries.
- **Right to Erasure:** `DELETE /api/account` (with typed `"DELETE"` confirmation) cancels active Razorpay subscriptions, notifies users of any active Google Play subscription requiring Play Store cancellation, and cascades deletion from `auth.users(id)`.
- **Right to Withdraw Consent:** Users can toggle `ai_opt_in`, `ai_notes_opt_in`, and `consent_share_stats` off at any time; backend enforces both flags on every request.

---

## 3. Items Flagged for Legal Counsel Review

1. **Verifiable Parental Consent for Minors (DPDP Act Sec. 9):** Indian competitive exams (especially NEET UG, CLAT UG, CA Foundation) include candidates under 18 years old. Counsel must advise on age-gating and verifiable parental consent workflows before launch.
2. **Tax & Financial Record Retention vs. Erasure:** Confirm whether anonymized Razorpay/Play order summaries must be retained separately for GST/Income Tax compliance after `DELETE /api/account`.
3. **Cross-Border Data Processing (Gemini API & Vercel/Google Cloud):** Confirm Privacy Notice disclosures and current Central Government notification status under DPDP Act Section 16.
4. **Grievance Redressal Officer & Notice Language:** Finalize named Grievance Officer details, response SLAs, and availability of consent notices in English and Eighth Schedule Indian languages.
