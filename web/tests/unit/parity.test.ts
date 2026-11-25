/**
 * Cross-platform parity: every value here was produced by the Kotlin engines in the Android app
 * (android/tools/domain-check/extra/ParityFixtures.kt). The web ports must reproduce them exactly.
 * Regenerate after changing either side: see docs/ARCHITECTURE.md, "Keeping Android and web in step".
 */
import { describe, expect, it } from "vitest";
import fixtures from "./parity-fixtures.json";
import { EXAMS, findExam, seedTopics } from "@/domain/exams";
import { evaluateReadiness, type MockSnapshot } from "@/domain/prep/readiness";
import { scoreQuestionAttempts, scoreQuickEntry, ERROR_CATEGORIES, type QuestionAttemptInput } from "@/domain/prep/mockScoring";
import { calculateNextRevision } from "@/domain/prep/revision";
import { generatePlan, TOPIC_STATUSES, type TopicPlanInput } from "@/domain/prep/studyPlan";
import { advanceRound, initialRoundState } from "@/domain/timer/rounds";
import { addDays } from "@/domain/time";
import { createSession } from "./helpers";

const TODAY = "2026-11-25";
const F = fixtures as any;

describe("parity with the Android Kotlin engines", () => {
  it("revision scheduling: all 210 combinations", () => {
    for (const r of F.revision) {
      const out = calculateNextRevision(TODAY, r.count, r.recall, r.acc, r.diff);
      expect([out.adjustedIntervalDays, out.baseIntervalDays, out.nextRevisionDate, out.revisionNumber, out.explanation], JSON.stringify(r)).toEqual([r.days, r.base, r.date, r.n, r.why]);
    }
  });

  it("quick-entry scoring for every exam", () => {
    for (const q of F.quick) {
      const m = findExam(q.exam)!.markingScheme;
      const out = scoreQuickEntry(m.totalQuestions, q.c, q.w, m);
      expect([out.finalScore, out.maxMarks, out.percentage, out.accuracyPercent, out.avgSecondsPerQuestion], JSON.stringify(q)).toEqual([q.score, q.max, q.pct, q.acc, q.avg]);
    }
  });

  it("question-level scoring and error diagnosis", () => {
    const subjects = ["Physics", "Chemistry", "Botany"];
    const attempts: QuestionAttemptInput[] = Array.from({ length: 30 }, (_, k) => {
      const i = k + 1;
      const sel = i % 7 === 0 ? null : i % 3 === 0 ? "B" : "A";
      return { questionNumber: i, subject: subjects[i % 3], topicName: `T${i}`, selectedAnswer: sel, correctAnswer: "A", timeSpentSeconds: 30 + i * 3, errorCategory: sel === "B" ? ERROR_CATEGORIES[i % ERROR_CATEGORIES.length][0] : null };
    });
    const d = scoreQuestionAttempts(attempts, findExam("neet_ug")!.markingScheme);
    expect([d.finalScore, d.maxMarks, d.percentage, d.accuracyPercent, d.avgSecondsPerQuestion, d.repeatedErrorDiagnosis]).toEqual([F.detailed.score, F.detailed.max, F.detailed.pct, F.detailed.acc, F.detailed.avg, F.detailed.diag]);
    expect(d.subjectBreakdown.map((s) => ({ s: s.subject, score: s.score, acc: s.accuracyPercent, avg: s.avgSecondsPerQuestion, ex: s.qualifiesExemption }))).toEqual(F.detailed.subjects);
  });

  const exam = findExam("neet_ug")!;
  const diffs = ["foundational", "moderate", "high", "critical"] as const;
  const topics: TopicPlanInput[] = seedTopics(exam).map((t, i) => ({
    topicId: `t${i}`, subject: t.subject, topicName: t.topicName, status: TOPIC_STATUSES[i % 6][0], difficulty: diffs[i % 4],
    nextRevisionDate: i % 4 === 0 ? addDays(TODAY, -(i % 3)) : i % 4 === 1 ? addDays(TODAY, 3) : null,
  }));

  it("readiness: four pillars, with and without enough mocks", () => {
    const sessions = Array.from({ length: 20 }, (_, i) =>
      createSession({ timestamp: Date.UTC(2026, 10, 25 - (i % 16), 6), tz: "UTC", plannedMinutes: 25 + i, actualSeconds: (25 + i) * 60, status: i % 5 === 0 ? "ended_early" : "completed", subject: "Physics" }));
    const revs = Array.from({ length: 7 }, (_, k) => ({ recallRating: 1 + ((k + 1) % 5), accuracyPercent: (k + 1) % 2 === 0 ? 60 + k + 1 : null }));
    const mocks: MockSnapshot[] = [1, 2, 3, 4].map((i) => ({ dateTimestamp: i * 1000, percentage: 40 + i * 6.5, accuracyPercent: 55 + i * 3, avgSecondsPerQuestion: 50 + i, weakestSubject: i % 2 === 0 ? "Physics" : "Chemistry", weakestSubjectAccuracy: 35 + i * 4 }));
    for (const [label, mk] of [["ready", mocks], ["insufficient", mocks.slice(0, 1)]] as const) {
      const r = evaluateReadiness(sessions, topics, revs, mk, 120, TODAY);
      const exp = F[`readiness_${label}`];
      expect([r.consistency.scorePercent, r.consistency.studyHoursLast14Days, r.consistency.activeDaysLast14Days, r.consistency.currentStreakDays, r.coverage.scorePercent, r.coverage.overdueBacklog, r.competency.scorePercent, r.competency.masteredTopicsPercent], label)
        .toEqual([exp.consistency, exp.hours, exp.active, exp.streak, exp.coverage, exp.overdue, exp.competency, exp.mastered]);
      if (r.readiness.kind === "score") {
        expect({ kind: "score", score: r.readiness.scorePercent, avg: r.readiness.recentMockAveragePercent, spread: r.readiness.consistencySpreadPercent, weak: r.readiness.weakestSubjectName, ret: r.readiness.revisionRetentionPercent, trend: r.readiness.trendLabel }).toEqual(exp.readiness);
      } else {
        expect({ kind: "insufficient", have: r.readiness.mocksRecorded }).toEqual(exp.readiness);
      }
    }
  });

  it("study plan: allocations, 7-day timetable and milestones", () => {
    const p = generatePlan(exam, topics, TODAY, addDays(TODAY, 150), 5.5, 6, { Physics: 48, Botany: 90 }, 45);
    expect([p.dailyTargetMinutes, p.revisionBacklogCount, p.backlogRecoveryMinutesPerDay, p.nextRecommendedMockDay]).toEqual([F.plan.daily, F.plan.backlog, F.plan.recovery, F.plan.mockDay]);
    expect(p.subjectAllocations.map((a) => ({ s: a.subject, min: a.allocatedMinutesPerWeek, share: a.sharePercent, boost: a.weakSubjectBoostApplied, why: a.rationale }))).toEqual(F.plan.alloc);
    expect(p.weeklySchedule.map((d) => ({ total: d.totalMinutes, tasks: d.tasks.map((t) => ({ s: t.subject, t: t.topicName, type: t.taskType, min: t.allocatedMinutes })) }))).toEqual(F.plan.days);
    expect(p.monthlyMilestones.map((m) => ({ topics: m.targetTopicsToComplete, mocks: m.recommendedMocks, dir: m.focusDirective }))).toEqual(F.plan.milestones);
  });

  it("Pomotroid round sequence", () => {
    for (const c of F.rounds) {
      const s = { roundsBeforeLongBreak: c.rounds, shortBreaksEnabled: c.short, longBreaksEnabled: c.long, longBreakMinutes: 15 };
      let st = initialRoundState();
      const seen = Array.from({ length: 10 }, () => { const x = `${st.current}:${st.focusRoundNumber}:${st.totalFocusRounds}`; st = advanceRound(st, s); return x; });
      expect(seen, JSON.stringify(c)).toEqual(c.seq);
    }
  });

  it("the registry JSON holds all 26 Android exams", () => {
    expect(EXAMS).toHaveLength(26);
  });
});
