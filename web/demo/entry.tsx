/**
 * Entry point for the single-file HTML build (npm run build:html).
 * It mounts the same screens as the Next.js app, with hash routing and on-page storage in place of
 * the server. Accounts, sync, payments, AI reflections and institute groups need the full app.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ExamPage from "@/app/app/exam/page";
import HistoryPage from "@/app/app/history/page";
import FocusPage from "@/app/app/page";
import PatternsPage from "@/app/app/patterns/page";
import SettingsPage from "@/app/app/settings/page";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Eyebrow } from "@/components/ui";
import { FEATURES, PLANS, formatRupees } from "@/domain/plans";
import { getMeta, saveSessions, setMeta } from "@/lib/client/db";
import { eraseThisDevice, useTempo } from "@/lib/client/store";
import { usePathname } from "next/navigation";
import { findExam } from "@/domain/exams";
import { addDays, deviceTimeZone, localDateKey } from "@/domain/time";
import { ensureExamInitialized, getPrep, initPrep, logRevision, recordQuickMock, setTopicStatus, topicsFor, updatePlan } from "@/lib/client/prep";
import { sampleData } from "./sample";

/** A little exam-prep history so the Exam tab has something to show. Same code paths as real use. */
async function seedPrep() {
  const exam = findExam("upsc_cse");
  if (!exam) return;
  await initPrep();
  await ensureExamInitialized(exam);
  const today = localDateKey(Date.now(), deviceTimeZone());
  await updatePlan(exam.examId, { examDate: addDays(today, 189), dailyHours: 6 });
  const topics = topicsFor(getPrep(), exam, "both");
  for (const [i, t] of topics.slice(0, 6).entries()) {
    await setTopicStatus(t.id, i < 2 ? "completed" : "learning", addDays(today, -(6 - i)));
    if (i < 3) await logRevision(exam, t.id, [4, 3, 2][i], null, 3, "active_recall", "", addDays(today, -(4 - i)));
  }
  const m = exam.markingScheme;
  await recordQuickMock(exam, "Sample mock 1", m.totalQuestions, Math.round(m.totalQuestions * 0.48), Math.round(m.totalQuestions * 0.3), m.durationMinutes, m, "", "");
  await recordQuickMock(exam, "Sample mock 2", m.totalQuestions, Math.round(m.totalQuestions * 0.55), Math.round(m.totalQuestions * 0.25), m.durationMinutes, m, "", "");
}

function Plans() {
  const rows: [string, string, string, string[]][] = [
    ["Free", "₹0", "always", ["Adaptive, subject-aware timer", "“Show working” for every recommendation", "Exam countdown, subject goals, mock tracking", `Patterns for the last ${FEATURES.free.analyticsHistoryDays} days`, "Works offline, no account"]],
    [PLANS.pro_monthly.name, formatRupees(PLANS.pro_monthly.defaultPaise), "per month", ["Cloud backup and sync", "Full history in Patterns", "Spaced revision calendar", `Optional AI reflections (${FEATURES.pro.aiMonthlyQuota} a month)`]],
    [PLANS.pro_annual.name, formatRupees(PLANS.pro_annual.defaultPaise), "per year", ["Everything in Pro", "A full exam cycle"]],
    [PLANS.lifetime.name, formatRupees(PLANS.lifetime.defaultPaise), "once", ["Pro features for good", `AI reflections (${FEATURES.lifetime.aiMonthlyQuota} a month)`]],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-display text-3xl">Plans</h1>
      <p className="text-sm text-ink-2">This single-file version runs the free plan. Accounts, payments, sync, AI reflections and institute groups are part of the full app.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map(([name, price, unit, items]) => (
          <Card key={name}>
            <Eyebrow>{name}</Eyebrow>
            <p className="font-display mt-1 text-4xl">{price}</p>
            <p className="text-xs text-muted">{unit}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-2">{items.map((i) => <li key={i}>{i}</li>)}</ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Groups() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-display text-3xl">Institutes and groups</h1>
      <Card><p className="text-sm text-ink-2">Groups, challenges and the institute dashboard need accounts, so they are part of the full app and not this single-file version.</p></Card>
    </div>
  );
}

function SampleBar() {
  const { sessions } = useTempo();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => { setToast((e as CustomEvent<string>).detail); setTimeout(() => setToast(null), 4000); };
    window.addEventListener("tempo-toast", on);
    return () => window.removeEventListener("tempo-toast", on);
  }, []);
  const hasSample = sessions.some((s) => s.subject === "Prelims GS" && s.mockScore === 104);
  return (
    <>
      {hasSample && (
        <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-ink-2">
          <span>Showing four weeks of invented sample sessions so the rings and charts have data.</span>
          <Button variant="quiet" className="min-h-8 px-3 text-xs" onClick={() => void eraseThisDevice()}>Clear and start empty</Button>
        </div>
      )}
      {toast && <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl bg-ink px-4 py-3 text-center text-xs text-bg md:bottom-6">{toast}</div>}
    </>
  );
}

function App() {
  const path = usePathname();
  const page =
    path === "/app/patterns" ? <PatternsPage /> : path === "/app/exam" ? <ExamPage /> : path === "/app/history" ? <HistoryPage /> :
    path === "/app/settings" ? <SettingsPage /> : path === "/app/institute" ? <Groups /> : path === "/pricing" ? <Plans /> : <FocusPage />;
  return <AppShell><SampleBar />{page}</AppShell>;
}

async function start() {
  // First visit only: load sample history. Clearing it never brings it back.
  if (!(await getMeta<boolean>("sampleOffered"))) {
    const { sessions, state } = sampleData(Date.now());
    await saveSessions(sessions, { fromServer: true });
    await setMeta("userState", state);
    await seedPrep();
    await setMeta("sampleOffered", true);
  }
  createRoot(document.getElementById("root") as HTMLElement).render(<App />);
}
void start();
