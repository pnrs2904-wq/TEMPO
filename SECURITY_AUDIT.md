# Tempo Android — Security Audit Report

**Date:** September 2026  
**Auditor:** Senior Security & Android Release Engineering  
**Application ID:** `com.tempo.focus`  
**Compile SDK:** 36 | **Target SDK:** 36 | **Min SDK:** 24 (Android 7.0)  
**Overall Status:** **HARDENED — CONDITIONAL PRODUCTION READINESS** (Cloud Play Integrity attestation link required at deployment)

---

## 1. Executive Summary

A thorough security audit of the Tempo Android application, local database architecture, and backend proxy service was conducted. The application enforces a zero-trust boundary: the Android client contains zero Gemini API keys, zero cloud secret credentials, and zero service account tokens.

All network communications require TLS (HTTPS). Cleartext traffic is blocked at the Android OS manifest level. All local study session records and focus metrics remain stored on the device in private sandboxed application storage (`tempo_database`).

---

## 2. Threat Modeling & Scope Verification

| Security Domain | Threat Vector | Mitigation Implemented | Verification Status |
| :--- | :--- | :--- | :--- |
| **API Keys & Secrets** | Decompilation of APK / reverse engineering | Server-side proxy (`backend/server.js`). Key is never shipped to client. | **VERIFIED** |
| **Transport Layer** | Man-in-the-middle (MitM) eavesdropping | Cleartext HTTP blocked at OS manifest level (`network_security_config.xml`). Insecure HTTP backend URLs rejected in code with `SecurityException`. | **VERIFIED** |
| **Replay Protection** | Capturing and replaying reflection requests | Timestamp freshness check (±5 min) **PLUS** unique request nonce tracking with server-side in-memory replay cache. Duplicate nonces within the window return HTTP 409 `REPLAY_DETECTED`. | **VERIFIED** (Single Instance) |
| **Client Identification** | Abuse control / rate limiting | Anonymous installation identifier (`X-Installation-Id`). **Note:** This is an abuse-control and rate-limiting identifier, NOT an authentication mechanism. | **VERIFIED (Rate Limiting Only)** |
| **Backend Abuse / DoS** | Excessive reflection requests / billing spikes | Multi-layer sliding-window rate limiter (10 req / 10 min per installation ID and per IP) + Global hourly budget circuit breaker (`GLOBAL_MAX_REQUESTS_PER_HOUR`). | **VERIFIED** (Single Instance) |
| **Play Integrity (App Attestation)** | Unauthorized / modified clients calling backend | Android client integrates Google Play Integrity SDK (`1.4.0`) via `GooglePlayIntegrityProvider`, binding tokens to the cryptographic `requestNonce`. Backend implements token payload evaluation (`evaluateIntegrityPayload` verifying `com.tempo.focus`, `PLAY_RECOGNIZED`, and device integrity verdicts) and Google decode endpoint integration. | **CLIENT IMPLEMENTED & BACKEND READY — CLOUD ATTESTATION LINK REQUIRED IN PRODUCTION HOSTING** |
| **Data Leakage in Transit** | Unintended transmission of notes / credentials | Client transmits maximum 5 recent sessions, truncates notes, minimizes schema, and executes client + server automated redaction for common API keys, passwords, and emails. | **VERIFIED (Minimized; Not a PII-Free Guarantee)** |
| **Local Data Loss** | Room schema migrations dropping data | Safe `MIGRATION_1_2` explicitly indexes columns. Destructive downgrade behavior (`fallbackToDestructiveMigrationOnDowngrade`) has been removed to protect user study history. | **VERIFIED** |
| **Response Caching** | Cached user reflection data on shared devices | Backend injects `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache` on all reflection responses. | **VERIFIED** |

---

## 3. Detailed Technical Findings

### 3.1 Play Integrity Architecture & Deployment Requirements
- **Client Side (`GooglePlayIntegrityProvider.kt` & `InsightGenerator.kt`):**
  - Integrated `com.google.android.play:integrity:1.4.0`.
  - Generates a unique cryptographic nonce (`UUID.randomUUID().toString()`) per request.
  - Sends `X-Request-Nonce` header.
  - Invokes `IntegrityManagerFactory.create(context).requestIntegrityToken(request)` using `IntegrityTokenRequest.builder().setNonce(nonce).build()`.
  - Attaches acquired token to `X-Play-Integrity-Token`.
  - If Google Play Services is absent or token acquisition fails, it falls back safely without crashing.
- **Server Side (`backend/server.js`):**
  - Implements `decodeAndVerifyPlayIntegrityToken` and `evaluateIntegrityPayload`.
  - Enforces:
    1. `requestPackageName === 'com.tempo.focus'`
    2. `appIntegrity.appRecognitionVerdict === 'PLAY_RECOGNIZED'`
    3. `deviceIntegrity.deviceRecognitionVerdict` includes `MEETS_DEVICE_INTEGRITY` or `MEETS_BASIC_INTEGRITY`
    4. Nonce binding matching `X-Request-Nonce`.
  - Rejects missing, empty, or unverified tokens with HTTP 403 `INTEGRITY_FAILED` when `PLAY_INTEGRITY_ENABLED=true`.
- **Production Prerequisite:**
  - Activating `PLAY_INTEGRITY_ENABLED=true` in live Google Cloud hosting requires linking the Google Play Console project to the GCP Cloud Project and providing a service account OAuth token (`PLAY_INTEGRITY_SERVICE_ACCOUNT_TOKEN`).

### 3.2 Replay Protection Mechanism
- The system combines:
  1. `X-Request-Timestamp`: rejects requests outside `now ± 5 minutes`.
  2. `X-Request-Nonce`: required 8-128 character identifier.
  3. Server-side `nonceCache`: short-lived in-memory cache tracking observed nonces. Duplicate nonces immediately trigger HTTP 409 `REPLAY_DETECTED`.

### 3.3 Installation ID vs Authentication
- `X-Installation-Id` is generated by the client application as a UUID.
- **Security Reality:** Client-generated installation IDs are abuse-control and rate-limiting bucket identifiers, NOT authentication mechanisms. Protection is layered with IP rate limiting and the global hourly circuit breaker.

### 3.4 Data Minimization & Redaction Limitations
- The application enforces data minimization:
  - Transmits at most 5 recent sessions with notes.
  - Truncates subjects to 50 characters and notes to 250 characters.
  - AI reflection is disabled by default (`aiInsightsEnabled = false`).
- Automated regex-based scrubbing redacts common API keys, Bearer tokens, passwords, and standard email formats.
- **Compliance Clarification:** Automated regex scrubbing is a defense-in-depth measure, not a guarantee that all personal information is removed. Unstructured text entered into notes will not be detected by regexes.

### 3.5 Single-Instance vs Horizontal Scaling
- The rate limiter, global hourly budget limiter, and nonce replay cache currently reside in Node.js process memory.
- In single-instance deployments (e.g. standard Cloud Run instance or single VM), this provides effective protection.
- When deploying behind a load balancer with multiple replica containers, a shared cache (such as Redis or Cloud Memorystore) should back the rate limiter and replay cache.

### 3.6 Reverse Proxy Topology
- `app.set('trust proxy', 1)` is configured for standard single reverse proxy topologies (e.g. Cloud Run or ALB). Ensure proxy configuration matches your production hosting environment.

---

## 4. Conclusion & Production Action Items

The codebase features genuine Play Integrity token generation and evaluation, replay defense, honest privacy disclosures, non-destructive database migration, and clean separation between offline core features and optional AI reflections.

**Final Sign-Off Checklist:**
1. Link Google Cloud Project with Google Play Console under App Integrity.
2. Provide `PLAY_INTEGRITY_SERVICE_ACCOUNT_TOKEN` and set `PLAY_INTEGRITY_ENABLED=true` on production server.
3. Configure `GEMINI_API_KEY` on production server.
