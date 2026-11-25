/**
 * Port of ExamReadinessEngine.kt: four separate measures, and no readiness score without at least
 * two mocks. Study hours alone never produce a readiness figure.
 */
import { calculateStreak } from "../streak";
import { addDays, type DateKey } from "../time";
import type { Session } from "../types";
import type { TopicPlanInput } from "./studyPlan";

export const MIN_MOCKS_FOR_READINESS = 2;
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface MockSnapshot { dateTimestamp: number; percentage: number; accuracyPercent: number; avgSecondsPerQuestion: number; weakestSubject?: string | null; weakestSubjectAccuracy?: number | null }
export interface RevisionSnapshot { recallRating: number; accuracyPercent: number | null }

export interface ReadinessReport {
  consistency: { scorePercent: number; studyHoursLast14Days: number; activeDaysLast14Days: number; completedSessions: number; currentStreakDays: number; formula: string };
  coverage: { scorePercent: number; completedOrMasteredTopics: number; totalTopics: number; pendingTopics: number; revisionsCompleted: number; overdueBacklog: number; formula: string };
  competency: { scorePercent: number | null; averageAccuracyPercent: number | null; avgSecondsPerQuestion: number | null; masteredTopicsPercent: number; averageRecallRating: number | null; formula: string };
  readiness:
    | { kind: "score"; scorePercent: number; recentMockAveragePercent: number; consistencySpreadPercent: number; weakestSubjectName: string | null; weakestSubjectAccuracy: number | null; revisionRetentionPercent: number; trendLabel: string; formula: string }
    | { kind: "insufficient"; mocksRecorded: number; mocksRequired: number; reason: string; formula: string };
}

export function evaluateReadiness(sessions: Session[], topics: TopicPlanInput[], revisions: RevisionSnapshot[], mocks: MockSnapshot[], dailyGoalMinutes: number, today: DateKey): ReadinessReport {
  const windowStart = addDays(today, -13);
  const completedFocus = sessions.filter((s) => !s.deletedAt && s.phase === "focus" && s.status === "completed");
  const recent = completedFocus.filter((s) => s.localDate >= windowStart && s.localDate <= today);
  const activeDays = new Set(recent.map((s) => s.localDate)).size;
  const recentMinutes = recent.reduce((a, s) => a + Math.floor(s.actualSeconds / 60), 0);
  const streak = calculateStreak(sessions, today).currentStreak;
  const consistencyScore = clamp(
    Math.round(clamp(activeDays / 14, 0, 1) * 50 + clamp(recentMinutes / (Math.max(30, dailyGoalMinutes) * 10), 0, 1) * 30 + clamp(streak / 7, 0, 1) * 20),
    0, 100);

  const totalTopics = topics.length;
  const done = topics.filter((t) => t.status === "completed" || t.status === "mastered").length;
  const overdue = topics.filter((t) => t.nextRevisionDate !== null && t.nextRevisionDate <= today).length;
  const coverageScore = clamp(Math.round((totalTopics ? done / totalTopics : 0) * 100 - (totalTopics ? (overdue / totalTopics) * 30 : 0)), 0, 100);

  const mastered = topics.filter((t) => t.status === "mastered").length;
  const masteredPct = totalTopics ? Math.round((mastered / totalTopics) * 1000) / 10 : 0;
  const avgAccuracy = mocks.length ? r1(mean(mocks.map((m) => m.accuracyPercent))) : null;
  const speeds = mocks.filter((m) => m.avgSecondsPerQuestion > 0).map((m) => m.avgSecondsPerQuestion);
  const avgSpeed = speeds.length ? r1(mean(speeds)) : null;
  const avgRecall = revisions.length ? r1(mean(revisions.map((r) => r.recallRating))) : null;
  let competencyScore: number | null = null;
  if (!(avgAccuracy === null && avgRecall === null && mastered === 0)) {
    const accPart = avgAccuracy ?? (avgRecall !== null ? (avgRecall / 5) * 100 : masteredPct);
    const recallPart = avgRecall !== null ? (avgRecall / 5) * 100 : accPart;
    competencyScore = clamp(Math.round(accPart * 0.5 + recallPart * 0.3 + masteredPct * 0.2), 0, 100);
  }

  const formula = `45% recent mock avg + 20% score consistency + 20% weakest subject floor + 15% revision retention (requires >= ${MIN_MOCKS_FOR_READINESS} mocks)`;
  const sorted = [...mocks].sort((a, b) => b.dateTimestamp - a.dateTimestamp);
  let readiness: ReadinessReport["readiness"];
  if (sorted.length < MIN_MOCKS_FOR_READINESS) {
    readiness = { kind: "insufficient", mocksRecorded: sorted.length, mocksRequired: MIN_MOCKS_FOR_READINESS, formula,
      reason: `Insufficient data — log at least ${MIN_MOCKS_FOR_READINESS} timed mock tests for this exam. Study hours alone never generate a readiness score.` };
  } else {
    const rm = sorted.slice(0, 5);
    const recentAvg = clamp(mean(rm.map((m) => m.percentage)), 0, 100);
    const spread = Math.max(0, Math.max(...rm.map((m) => m.percentage)) - Math.min(...rm.map((m) => m.percentage)));
    const consistencyFactor = clamp(100 - spread * 1.5, 0, 100);
    let weakest: [string, number] | null = null;
    for (const m of rm) if (m.weakestSubject && m.weakestSubjectAccuracy != null && (!weakest || m.weakestSubjectAccuracy < weakest[1])) weakest = [m.weakestSubject, m.weakestSubjectAccuracy];
    const weakFloor = weakest ? clamp(weakest[1], 0, 100) : recentAvg;
    const retention = avgRecall !== null ? clamp((avgRecall / 5) * 100, 0, 100) : clamp(100 - overdue * 10, 20, 100);
    const delta = rm[0].percentage - rm[rm.length - 1].percentage;
    const trendLabel = delta >= 4 ? `Improving (+${Math.round(delta)}%)` : delta <= -4 ? `Declining (${Math.round(delta)}%)` : `Steady (${Math.abs(delta) < 0.5 ? "0" : Math.round(delta)}%)`;
    readiness = {
      kind: "score",
      scorePercent: clamp(Math.round(recentAvg * 0.45 + consistencyFactor * 0.2 + weakFloor * 0.2 + retention * 0.15), 0, 100),
      recentMockAveragePercent: r1(recentAvg), consistencySpreadPercent: r1(spread),
      weakestSubjectName: weakest?.[0] ?? null, weakestSubjectAccuracy: weakest?.[1] ?? null,
      revisionRetentionPercent: r1(retention), trendLabel, formula,
    };
  }
  return {
    consistency: { scorePercent: consistencyScore, studyHoursLast14Days: Math.round((recentMinutes / 60) * 10) / 10, activeDaysLast14Days: activeDays, completedSessions: completedFocus.length, currentStreakDays: streak,
      formula: "50% active days (last 14d) + 30% study hours vs target + 20% streak consistency" },
    coverage: { scorePercent: coverageScore, completedOrMasteredTopics: done, totalTopics, pendingTopics: Math.max(0, totalTopics - done), revisionsCompleted: revisions.length, overdueBacklog: overdue,
      formula: "Syllabus completed/mastered % minus overdue revision backlog penalty" },
    competency: { scorePercent: competencyScore, averageAccuracyPercent: avgAccuracy, avgSecondsPerQuestion: avgSpeed, masteredTopicsPercent: masteredPct, averageRecallRating: avgRecall,
      formula: "50% mock accuracy + 30% active recall rating + 20% mastered topics %" },
    readiness,
  };
}
