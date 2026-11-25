# Tempo (web)

An adaptive focus timer for exam preparation. Web port of the Tempo Android app, with the
recommendation engine preserved rule for rule.

- Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Recharts, Supabase (Postgres, Auth, RLS)
- Offline-first PWA: IndexedDB is the primary store; an account is optional
- Razorpay payments verified on the server; optional Gemini reflections behind a server route

Tempo 4.0: the same `/api/*` serves this website and the Android app; see `../docs/API.md` and `../docs/DEPLOYMENT.md`.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000  (works with no environment variables, local-only)
npm test             # 126 unit tests + 17 API route tests + 16 real-Postgres security tests
npm run build
npm run build:html   # dist/tempo.html: the app's screens in one self-contained file, no server
```

To enable accounts, sync, billing and institutes, copy `.env.example` to `.env.local`, fill it in,
and run `supabase/migrations/0001_init.sql` on your Supabase project. Deploy to Vercel as a normal
Next.js project (`vercel.json` pins the Mumbai region).

## Layout

```
src/domain/        Pure logic, no React or I/O. Everything here is unit-tested.
  engine.ts          Recommendation engine (port of the two Kotlin engines)
  recommend.ts       History selection + "show working" receipt
  timer.ts           Timestamp-based timer arithmetic
  time.ts            Timezone-safe calendar days
  analytics.ts       Daily/weekly/subject/energy analytics; completion rules
  sync.ts            Merge rules and validation shared by browser and server
  exam.ts            Exam presets, countdown, targets, revision calendar
  plans.ts           Plans and entitlement resolution
  reflection.ts      On-device reflection, redaction, AI prompt
src/lib/client/    IndexedDB store, app state, Supabase browser client
src/lib/server/    Auth, entitlements, Razorpay, Gemini, sync planning
src/app/api/       Route handlers (see docs/API.md)
src/app/app/       The app: Focus (rings), Patterns, Exam, History, You, Institute
src/app/           Landing page, pricing, institutes, privacy, terms, manifest, sitemap
supabase/migrations/0001_init.sql   Schema, RLS, institute functions
tests/unit/        Logic tests, including the ported Kotlin suites
tests/integration/ RLS and privacy tests on real Postgres (PGlite)
public/sw.js       Service worker
```

## Acceptance tests and where they live

| Requirement | Test |
|---|---|
| Timer survives refreshes | `tests/unit/timer.test.ts`; also driven in Chrome (refresh, pause, closed-tab completion) |
| Session durations are accurate | `tests/unit/timer.test.ts`, `tests/unit/analytics.test.ts` |
| Subject-specific recommendations | `tests/unit/engine.test.ts` |
| Incomplete sessions never count as completed | `tests/unit/analytics.test.ts`, `tests/integration/rls.test.ts` (database constraint) |
| Offline sessions synchronise safely | `tests/unit/sync.test.ts`, `outbox.test.ts`, `server.test.ts` |
| Users cannot access another user's data | `tests/integration/rls.test.ts` |
| AI is disabled by default | `tests/integration/rls.test.ts` |
| Entitlements enforced server-side | `tests/integration/rls.test.ts`, `tests/unit/product.test.ts`, `server.test.ts` |
