# Tempo — Production Play Store Readiness & Launch Guide

This document summarizes the comprehensive production hardening, architecture fixes, and verification steps implemented for **Tempo — Energy Focus Timer** (`com.tempo.focus`).

---

## 1. Production Hardening Summary

| Area | Production Requirement | Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Namespace & Package** | Unique production ID (no `com.example`) | Migrated to `com.tempo.focus`, `applicationId = "com.tempo.focus"` | 🟢 Production Ready |
| **Release Minification** | R8 shrinking and resource optimization | `isMinifyEnabled = true`, `isShrinkResources = true`, full `proguard-rules.pro` rules | 🟢 Production Ready |
| **Security & Network** | No cleartext traffic, TLS only | `usesCleartextTraffic="false"` enforced in `AndroidManifest.xml` | 🟢 Production Ready |
| **AI Key Security** | No embedded API keys in client | All AI requests route exclusively via authenticated HTTPS backend proxy (`/api/v1/reflections`) | 🟢 Production Ready |
| **AI Privacy & Consent** | Strict opt-in; off by default | Disabled by default; comprehensive disclosure dialog; data sanitization & minimization | 🟢 Production Ready |
| **Timer Reliability** | Drift-free wall-clock accuracy | Elapsed time uses epoch timestamps and accumulates properly across process pauses/backgrounding | 🟢 Production Ready |
| **Data Integrity** | Session state machine in Room | Sessions start as `ACTIVE`, transition to `PAUSED`, `COMPLETED`, `ENDED_EARLY`, or `CANCELLED` | 🟢 Production Ready |
| **Cloud Backup** | Preserves user records on device transfer | Full `backup_rules.xml` and `data_extraction_rules.xml` configured for `tempo_database` | 🟢 Production Ready |
| **Permissions** | Least privilege Google Play compliant | Standard `POST_NOTIFICATIONS` (Android 13+), `VIBRATE`, and `INTERNET` only | 🟢 Production Ready |
| **Compliance Docs** | Store Listing, Privacy Policy, Data Safety | `PRIVACY_POLICY.md`, `PLAY_STORE_DATA_SAFETY.md`, `STORE_LISTING.md` provided | 🟢 Production Ready |

---

## 2. Generating the Signed Production Release (AAB)

### A. Create Your Upload Keystore (One-Time)
Run this command on your secure workstation:
```bash
keytool -genkey -v -keystore tempo-upload-key.jks \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_SECURE_STORE_PASSWORD \
  -keypass YOUR_SECURE_KEY_PASSWORD
```

### B. Build the Release App Bundle (AAB)
Export your credentials and execute the bundle task:
```bash
export KEYSTORE_PATH="/path/to/tempo-upload-key.jks"
export STORE_PASSWORD="YOUR_SECURE_STORE_PASSWORD"
export KEY_PASSWORD="YOUR_SECURE_KEY_PASSWORD"
export KEY_ALIAS="upload"

gradle :app:bundleRelease
```
The optimized, R8-shrunk release bundle will be generated at:
```
app/build/outputs/bundle/release/app-release.aab
```

---

## 3. Production AI Architecture: Backend Proxy Specification

In production, Tempo never exposes Gemini API keys inside the Android binary. Instead, when the user opts in to AI Reflections:
1. `InsightGenerator.kt` sanitizes the user's latest 5 session notes using regex pattern masking (redacting secrets, emails, keys).
2. If `TEMPO_BACKEND_URL` is configured, it sends an HTTPS POST request to your verified backend proxy with anonymous installation identifier (for rate limiting), request nonce (for replay defense), and optional Play Integrity attestation:
   ```json
   {
     "sessions": [
       {
         "subject": "Math",
         "sessionType": "Study",
         "energy": 4,
         "plannedMinutes": 35,
         "notes": "Completed calculus problem set 4"
       }
     ]
   }
   ```
3. Your secure backend validates the request, attaches the server-side Gemini API key, invokes Gemini 2.5 Flash, and returns:
   ```json
   {
     "insight": "You maintain strong focus during afternoon calculus sessions when paired with 35-minute intervals."
   }
   ```
4. If network is offline, the backend returns an error, or the feature is disabled, the app gracefully falls back without blocking any local timer or history functions.

---

## 4. Pre-Launch Verification Checklist

- [x] All unit and Robolectric tests passing (`gradle :app:testDebugUnitTest`)
- [x] Room database migrations and table mappings verified
- [x] Release build compiles cleanly with ProGuard/R8
- [x] Zero references to `com.example` or debug signing credentials
- [x] Zero embedded client Gemini keys in APK/AAB
- [x] AndroidManifest configured with `usesCleartextTraffic="false"`
- [x] Full Play Store Listing copy prepared in `STORE_LISTING.md`
- [x] Complete Privacy Policy documented in `PRIVACY_POLICY.md`
- [x] Detailed Data Safety questionnaire guide in `PLAY_STORE_DATA_SAFETY.md`
