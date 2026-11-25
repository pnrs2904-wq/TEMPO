# Tempo Android — Google Play Production Release Checklist

**App Name:** Tempo: Adaptive Focus Timer  
**Package Name / Application ID:** `com.tempo.focus`  
**Target Release Track:** Closed Testing $\rightarrow$ Open Testing $\rightarrow$ Staged Production  
**Min SDK:** 24 (Android 7.0) | **Target SDK:** 36 | **Compile SDK:** 36  

---

## 1. Pre-Release Engineering Verification

- [x] **Zero Hardcoded Secrets:** Codebase scanned; zero API keys, tokens, or cloud credentials packaged in APK.
- [x] **Backend Proxy Architecture:** Server-side proxy (`backend/server.js`) handles Gemini API calls.
- [x] **Replay Defense & Nonce Tracking:** Android client sends `X-Request-Nonce`; backend enforces server-side replay cache returning HTTP 409 on duplicates.
- [x] **Network Security Configuration:** Cleartext HTTP blocked at OS manifest level (`network_security_config.xml`). Insecure HTTP backend URLs rejected in code.
- [x] **Release Minification:** R8 minification and resource shrinking enabled in `app/build.gradle.kts`.
- [x] **Log Sanitization:** ProGuard rules strip verbose/debug Android logging in release builds.
- [x] **Safe Room Migrations:** Explicit `MIGRATION_1_2` applies indices without table drops. Destructive downgrade table-dropping removed to safeguard user data.
- [x] **Play Integrity SDK Integration:** Added `com.google.android.play:integrity:1.4.0` via `GooglePlayIntegrityProvider` bound to cryptographic request nonce.
- [x] **Unit & Integration Tests:** 38 Android unit & Robolectric tests passing (`./gradlew :app:testDebugUnitTest`).
- [x] **Backend Test Suite:** 31 Node.js test cases passing (`npm --prefix backend test`).
- [x] **Data Safety Alignment:** Automated regex scrubbing on client and server minimizes transmission of passwords and emails; privacy policies clarify that unstructured personal notes cannot be guaranteed PII-free.

---

## 2. Google Play Console Deployment Steps

### Step 2.1: App Integrity & Signing
1. Navigate to **Release > Setup > App Integrity** in the Google Play Console.
2. Select **Play App Signing** (Google manages the master app signing key).
3. Build signed release bundle with your release upload keystore:
   ```bash
   gradle :app:bundleRelease
   ```
4. Output bundle: `app/build/outputs/bundle/release/app-release.aab`.
5. Upload de-obfuscation mapping file: `app/build/outputs/mapping/release/mapping.txt`.

### Step 2.2: Google Cloud & Play Integrity Linking (For Server Attestation)
1. Link your Google Cloud Project to your Google Play Console under **App Integrity**.
2. Create a Google Cloud Service Account with the **Play Integrity API Viewer** role.
3. Generate a service account credential token and deploy to the backend environment as `PLAY_INTEGRITY_SERVICE_ACCOUNT_TOKEN`.
4. Set `PLAY_INTEGRITY_ENABLED=true` on the production backend.

### Step 2.3: Store Listing Preparation
1. **App Title:** `Tempo: Adaptive Focus Timer` (<= 30 characters).
2. **Short Description:** `Adaptive focus timer that learns from your energy and feedback.` (<= 80 characters).
3. **Full Description:** Reference `STORE_LISTING.md`.
4. **App Icon:** 512 x 512 px PNG (32-bit color, no transparency).
5. **Feature Graphic:** 1024 x 500 px PNG/JPEG.
6. **Phone Screenshots:** At least 2 phone screenshots (16:9 or 18:9 aspect ratio).

### Step 2.4: Data Safety Form
Refer to `PLAY_STORE_DATA_SAFETY.md` for exact entries:
- **Data Collected:** No account registration required. Optional anonymized study session metrics sent only if user toggles on AI reflection.
- **Data Encrypted in Transit:** Yes (TLS 1.3 / HTTPS).
- **Data Deletion Mechanism:** In-app "Reset All Data" button immediately wipes local Room database and DataStore preferences.
- **Backup Disclosure:** Local database and preferences are backed up via standard Android Auto Backup (Google Drive) under user control.

### Step 2.5: Content Rating & Target Audience
1. IARC Questionnaire:
   - Category: Utility / Productivity.
   - Contains Violence: No.
   - User Interaction: No social networking or unmoderated public chat.
   - Rating: PEGI 3 / Everyone.
2. Target Audience: Age 13 and above.

---

## 3. Server Deployment (`backend/`)

1. **Deployment Architecture:**
   - Host behind a trusted single reverse proxy (e.g. Google Cloud Run, Cloudflare, or AWS ALB) to match `app.set('trust proxy', 1)`.
   - Node 18+ runtime.
2. **Production Environment Variables:**
   - `PORT=8080`
   - `GEMINI_API_KEY=<your-secret-gemini-key>`
   - `GLOBAL_MAX_REQUESTS_PER_HOUR=1000` (Circuit breaker threshold)
   - `PLAY_INTEGRITY_ENABLED=true` (Requires linked GCP Service Account)
   - `PLAY_INTEGRITY_SERVICE_ACCOUNT_TOKEN=<gcp-oauth-bearer-token>`
3. **Multi-Instance Scaling Note:**
   - If running multiple container replicas behind a load balancer, migrate the in-memory rate limiting and nonce replay maps to Redis or Cloud Memorystore.

---

## 4. Release Rollout Strategy

1. **Closed Testing Track:** Deploy the AAB to an internal testing ring (5-10 devices) to verify crash-free rate across Android 8 through 15/16.
2. **Staged Production Rollout:**
   - Day 1: 10% rollout
   - Day 2: 20% rollout
   - Day 3: 50% rollout
   - Day 5: 100% rollout
3. **Android Vitals Monitoring:**
   - Target ANR rate: < 0.1%
   - Target Crash rate: < 0.2%
