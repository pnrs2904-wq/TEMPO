# Tempo 4.0: adaptive focus timer + exam preparation (Android + website, one backend)

| Folder | What it is |
|---|---|
| `app/` | Android app (Kotlin, Compose, Room), package `com.tempo.focus` |
| `web/` | Website and API (Next.js): the full study app in the browser, plus `/api/*` used by both the website and Android |
| `web/supabase/migrations/` | Database (Supabase Postgres) with row-level security, applied to the live project |
| `backend/` | Optional signed-out AI proxy for Android (Cloud Run) |
| `shared/` | Sync contract fixtures used by the server, website and Android tests |
| `docs/` | `DEPLOYMENT.md` (live setup and remaining steps), `TEST_REPORT.md`, `API.md`, `SECURITY_REVIEW.md`, `DATA_INVENTORY.md` |

Live: database on Supabase project `tempo` (Mumbai); website at https://tempo-focus-study.netlify.app once the repository is linked (see `docs/DEPLOYMENT.md` §2).

```
cd web && npm ci && npm run typecheck && npm test && npm run build   # website + API: 126 unit, 17 route, 16 Postgres tests
node --test backend/test/server.test.js                              # signed-out AI proxy
./gradlew testDebugUnitTest assembleDebug                            # Android (or GitHub Actions → Android)
```

---

# Tempo 2.0 — Multi-Examination Preparation & Adaptive Focus Platform

> Focus sessions matched to your energy — paired with rigorous, honest multi-examination preparation intelligence.

Tempo 2.0 builds on Tempo's privacy-first, offline-by-default adaptive focus timer (Kotlin + Jetpack Compose + Room + DataStore) and expands it into a structured competitive examination preparation platform supporting **26 examinations** across Medical, Law, Chartered Accountancy, Civil Services, Engineering, Banking/SSC, University, and Custom exams.

---

## Key Features

### 1. Adaptive Focus Engine (Preserved & Upgraded)
- Learns optimal focus session duration per energy level (`1–5`) and subject from completed sessions, difficulty, distractions, and focus quality.
- **Mock-Test Isolation:** Long `Mock Test` sessions are excluded from normal study-block duration adaptation so exam simulations never distort daily study intervals.
- **Transparent "Show working":** Expandable step-by-step explanation of base adaptive duration, subject history, and optional exam context.
- **Simple Mode vs Advanced Exam Prep Mode:** Toggle anytime in Settings, Dashboard, or Focus Timer between distraction-free Simple Mode and full Exam Prep Mode.

### 2. 26 Supported Examinations (`ExamRegistry`)
Each examination defines its applicable year, syllabus version, pattern verification status (`Official Pattern` vs `Provisional — Editable`), marking scheme, sectional time limits, revision rules, and curated resources:
- **Medical (2):** NEET UG (`+4/-1`, 180Q/720M, NCERT/Formula/Diagram trackers), NEET PG (`+4/-1`, 200Q/800M, 5×42m sectional limits).
- **Law (11):** CLAT UG (`+1/-0.25`), CLAT PG, AILET UG, AILET PG, TS LAWCET (3-Yr & 5-Yr, zero negative marking), AP LAWCET (3-Yr & 5-Yr), MH CET Law (3-Yr & 5-Yr), State Judiciary.
- **Chartered Accountancy (6):** CA Foundation, CA Intermediate Group I & Group II, CA Final Group I & Group II (with Group I / Group II / Both paper switching & RTP/MTP/Exemption tracking), CA Final SPOM.
- **Competitive & Academic (7):** UPSC CSE, State PSC, SSC CGL, Banking, GATE, University, Custom.

### 3. Hierarchical Syllabus & Spaced Revision Engine
- **4-Level Syllabus:** `Subject → Unit → Chapter → Topic` with 6 progression states (`Not started`, `Learning`, `Practising`, `Completed`, `Revision due`, `Mastered`), manual add, and bulk CSV import.
- **Safe Exam Switching:** Switching examinations isolates active subjects and plans while preserving all previous exam records in Room.
- **Spaced Repetition (`RevisionSchedulerEngine`):** Intervals (`1, 3, 7, 14, 30` days) are calculated strictly from the **actual revision date** (never original study date), adapt to recall rating (`1–5`) and accuracy, enforce same-day duplicate revision blocking, and support manual rescheduling.

### 4. Mock Test Scoring & Question-Level Error Diagnostics
- Exact negative-marking engine: `Final Score = (Correct × Positive) − (Incorrect × Negative)` with toggleable/editable marking rules and zero-negative support.
- Both **Quick Score Entry** and **Detailed Question-Level Entry** across 6 error categories (`Conceptual`, `Calculation`, `Misreading`, `Guessing`, `Memory failure`, `Time-pressure`) with CA exemption detection (`>= 60%`).

### 5. Adaptive Weighted Study Plan & 4-Pillar Exam Readiness
- **Study Plan Generator:** Weighted (non-equal) subject time allocation distinguishing `Official Weightage`, `Historical Analysis`, and `Algorithmic Recommendation`, weak-subject mock accuracy boosting, overdue revision backlog recovery, 7-day timetable, and monthly milestones.
- **4-Pillar Exam Readiness Dashboard:** Separately reports **A. Consistency**, **B. Coverage**, **C. Competency**, and **D. Examination Readiness** with expandable formulas and honest `Insufficient data` when fewer than 2 mock tests have been recorded.

---

## Architecture: Privacy-First & Offline-By-Default

- **Local Persistence:** Room v3 (`AppDatabase` with safe non-destructive `MIGRATION_1_2` and `MIGRATION_2_3`) + DataStore Preferences.
- **No Embedded Client Secrets:** Zero API keys are bundled in the Android app.
- **Opt-In AI Reflections:** Disabled by default. When enabled and configured via `TEMPO_BACKEND_URL`, requests route through the Node.js proxy in [`backend/`](backend/README.md) with Google Play Integrity nonce binding.

---

## Building & Testing

### Prerequisites
- Android Studio Ladybug or higher
- JDK 17+
- Android SDK Platform 36 (`minSdk 24`, `targetSdk 36`)

### Run All Unit & Robolectric Tests
```bash
gradle :app:testDebugUnitTest
```

### Debug & Release Builds
```bash
# Debug APK
gradle :app:assembleDebug

# Signed Release Bundle (AAB)
export KEYSTORE_PATH="/path/to/upload-key.jks"
export STORE_PASSWORD="your-store-password"
export KEY_ALIAS="upload"
export KEY_PASSWORD="your-key-password"
# Optional: Deployed AI reflection proxy URL
export TEMPO_BACKEND_URL="https://your-backend.example.com/api/v1/reflections"

gradle :app:bundleRelease
```

---

## Documentation Index

- [Tempo 2.0 Before-and-After Audit Report](AUDIT_REPORT_2_0.md)
- [Release QA & Test Verification Report](RELEASE_QA_REPORT.md)
- [Privacy Policy](PRIVACY_POLICY.md)
- [Google Play Data Safety Guide](PLAY_STORE_DATA_SAFETY.md)
- [Play Store Readiness Checklist](PLAY_STORE_READINESS.md)
- [Backend Deployment Guide](backend/README.md)
