# Audit of the Android project (`tempo.zip`) and what changed in the web port

Scope read: `domain/` (both recommendation engines, InsightGenerator, StreakCalculator, ExportHelper),
`data/` (SessionEntity, DAO, enums, UserPreferencesRepository), `TempoViewModel`, the five screens,
`backend/server.js` and its tests, the unit tests, and the security and release documents.

## 1. What the Android app does well (kept as is)

| Area | Android behaviour | Web port |
|---|---|---|
| Recommendation rules | Energy default (15/20/25/35/45), last-session rule under 3 sessions, median of last 3, vote of duration feedback, four majority gates, clamp 10-50, max step 5 | `src/domain/engine.ts`: line-for-line port, same constants and reason strings |
| Subject awareness | Subject history used at 3+ sessions, falls back to all subjects with an explanation | Same file, `calculateSubjectAwareRecommendation` |
| Tests | 19 engine cases in `TempoRecommendationTest.kt` | All ported with the same names in `tests/unit/engine.test.ts` |
| Timer | Derived from timestamps, not ticks; state persisted for restore | `src/domain/timer.ts`, same arithmetic |
| Status parsing | Unknown values never become "completed" | `parseSessionStatus`, test ported |
| Privacy posture | AI off by default, key server-side, notes truncated and redacted | Kept, and tightened (section 3) |

## 2. Defects and gaps found in the Android code

1. **Session length cannot be chosen.** `startFocusSession()` always uses the recommendation. The brief asks for a user-selected duration. *Web:* a stepper overrides the recommendation; the chosen length is stored as `plannedMinutes`, which the engine already reads, so overrides feed back naturally.
2. **Mock tests are capped at 50 minutes** because they go through the same engine. *Web:* mock tests take the paper's length (up to 240 min) and are left out of adaptive history so a 120-minute paper cannot distort study recommendations. This is the only change to what the engine is fed.
3. **Focus time drops real study.** `getTodayFocusMinutes()` counts only completed sessions and floors each session's seconds separately. A session stopped at 20 of 25 minutes shows as 0. *Web:* time actually studied is summed (completed + stopped early), in seconds, then converted. Completion rate, streaks and the engine still count completed sessions only.
4. **Days depend on the phone's current timezone.** Streaks and daily totals call `ZoneId.systemDefault()` at read time, so history shifts when the user travels. *Web:* each session stores its timezone and calendar day at start.
5. **Orphaned sessions.** A session row is created as `active`; if the app is killed and preferences are lost it stays active forever. *Web:* on load, sessions left active or paused with no timer are closed as stopped early (or discarded if they never ran).
6. **Stale state in auto-break.** `handleSessionCompletion` checks `currentState.showFeedbackDialog` captured before the update, so auto-break can start under the feedback dialog. *Web:* break starts after feedback is saved or skipped.
7. **Subject is free text.** "Maths" and "Math" are separate histories. *Web:* subjects are picked from chips (free text still allowed); matching stays case-insensitive as on Android.
8. **Reflections only consider sessions with notes**, so a student who never writes notes gets nothing. *Web:* reflections use totals; notes are optional.
9. **Backend: Gemini key in the URL query string** (`?key=`), where it reaches proxy and access logs. *Web:* sent in the `x-goog-api-key` header.
10. **Backend: rate limiter, budget breaker and nonce cache are in process memory.** The audit document itself notes this fails with more than one instance; on serverless it does not hold at all. *Web:* limits are counted in Postgres (`ai_usage`).
11. **Backend: the installation ID is not authentication** (also noted in `SECURITY_AUDIT.md`). Anyone can mint IDs. *Web:* real accounts (Supabase Auth); Play Integrity is not applicable to a browser and is dropped.
12. **Prompt has no rule against shaming or psychological conclusions.** *Web:* added explicitly, plus an instruction that user data is not instructions.
13. **CSV export allows spreadsheet formula injection** (a note starting with `=`). *Web:* such cells are prefixed with `'`.
14. `SECURITY_AUDIT.md` refers to `decodeAndVerifyPlayIntegrityToken` and `network_security_config.xml`; neither exists in the archive (the function is `verifyPlayIntegrity`). Documentation drift only.

## 3. What is new in the web version

- **Rings interface:** today as a 24-hour dial, four weeks as concentric rings, with a plain view for accessibility.
- **"Show working" receipt** for every recommendation (`src/domain/recommend.ts`). Tests assert the lines always add up to the engine's answer.
- **Exam mode:** seven presets, countdown, subject goals, daily target, syllabus topics, spaced revision calendar, mock score tracking.
- **Accounts, sync, billing, institutes** with Row Level Security (`supabase/migrations/0001_init.sql`).
- **Offline first:** IndexedDB is the primary store; sync is an idempotent merge.

## 4. Known limits of this delivery (read before launch)

- **Nothing has been run against live Supabase, Razorpay or Gemini.** No credentials were available. The schema and RLS were tested on real Postgres (PGlite); signatures, sync planning and entitlement logic are unit-tested; the UI was exercised in Chrome in local-only mode. Do a full pass on a staging project (see `docs/LAUNCH_CHECKLIST.md`).
- **Razorpay only.** Cashfree is not implemented. `src/lib/server/razorpay.ts` is the single file to mirror.
- **Two Pro features are soft-gated in the browser:** Patterns history beyond 14 days and the revision calendar. They run on data already on the device, so they cannot be enforced by a server. Sync, AI reflections and institute reports are enforced server-side and in the database.
- **No app blocking, and background alerts are best-effort.** A web app cannot block other apps, and a phone may delay the completion alert while the screen is off. The countdown itself stays correct. Keep the Android app if these matter.
- **English only.** Hindi and regional languages are not done.
- **Privacy and Terms pages are templates** and say so on the page.
- **Pricing pages read prices at build time;** redeploy after changing price variables.
