/** Port of StudyPlanGenerator.kt: weighted subject allocation, 7-day timetable and milestones. */
import { DIFFICULTY_WEIGHT, type ExamConfig, type TopicDifficulty } from "../exams";
import { addDays, daysBetween, weekdayIndex, type DateKey } from "../time";

export type TopicStatus = "not_started" | "learning" | "practising" | "completed" | "revision_due" | "mastered";
export const TOPIC_STATUSES: [TopicStatus, string][] = [
  ["not_started", "Not started"], ["learning", "Learning"], ["practising", "Practising"], ["completed", "Completed"], ["revision_due", "Revision due"], ["mastered", "Mastered"],
];
export const statusLabel = (s: TopicStatus) => TOPIC_STATUSES.find(([k]) => k === s)?.[1] ?? s;

export interface TopicPlanInput { topicId: string; subject: string; topicName: string; status: TopicStatus; difficulty: TopicDifficulty; nextRevisionDate: DateKey | null }

export type WeightageSource = "Official Weightage" | "Historical Analysis" | "Algorithmic Recommendation";
export interface SubjectAllocation { subject: string; allocatedMinutesPerWeek: number; sharePercent: number; remainingTopics: number; weakSubjectBoostApplied: boolean; weightageSource: WeightageSource; rationale: string }
export interface PlanItem { subject: string; topicName: string; taskType: "Syllabus Study" | "Revision" | "Mock Practice" | "Backlog Recovery"; allocatedMinutes: number; weightageSource: WeightageSource; isBacklogRecovery: boolean }
export interface PlanDay { date: DateKey; weekday: number; totalMinutes: number; tasks: PlanItem[] }
export interface Milestone { monthLabel: string; targetTopicsToComplete: number; recommendedMocks: number; focusDirective: string }
export interface StudyPlan { examId: string; examName: string; daysUntilExam: number | null; dailyTargetMinutes: number; studyDaysPerWeek: number; subjectAllocations: SubjectAllocation[]; todayTasks: PlanItem[]; weeklySchedule: PlanDay[]; monthlyMilestones: Milestone[]; revisionBacklogCount: number; backlogRecoveryMinutesPerDay: number; nextRecommendedMockDay: string }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isDone = (s: TopicStatus) => s === "completed" || s === "mastered";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function generatePlan(exam: ExamConfig, topics: TopicPlanInput[], today: DateKey, examDate: DateKey | null, dailyAvailableHours: number, studyDaysPerWeek: number, subjectMockAccuracies: Record<string, number> = {}, missedMinutesRecently = 0): StudyPlan {
  const safeDaily = Math.round(clamp(dailyAvailableHours, 0.5, 14) * 60);
  const safeDays = clamp(Math.round(studyDaysPerWeek), 1, 7);
  const weeklyBudget = safeDaily * safeDays;
  const daysLeft = examDate ? Math.max(0, daysBetween(today, examDate)) : null;
  const overdue = topics.filter((t) => t.nextRevisionDate !== null && t.nextRevisionDate <= today);
  const backlog = overdue.length;
  const revisionRatio = backlog >= 5 || (daysLeft !== null && daysLeft <= 21) ? 0.35 : backlog > 0 ? 0.25 : 0.15;
  const backlogPerDay = missedMinutesRecently > 0 || backlog > 0 ? Math.max(15, Math.min(Math.round(safeDaily * 0.25), Math.floor(missedMinutesRecently / 3) + backlog * 10)) : 0;

  const grouped = new Map<string, TopicPlanInput[]>();
  for (const t of topics) grouped.set(t.subject, [...(grouped.get(t.subject) ?? []), t]);
  const seeds = new Map(exam.subjects.map((s) => [s.name, s]));
  const allSubjects = [...new Set([...grouped.keys(), ...seeds.keys()])];

  const raw = allSubjects.map((subject) => {
    const st = grouped.get(subject) ?? [];
    const remaining = st.filter((t) => !isDone(t.status));
    const seed = seeds.get(subject);
    const baseWeight = seed?.weightagePercent ?? 100 / Math.max(1, allSubjects.length);
    const source = (seed?.weightageSource as WeightageSource | undefined) ?? "Algorithmic Recommendation";
    const difficultyLoad = Math.max(remaining.length === 0 ? 0.35 : 1.0, remaining.reduce((a, t) => a + DIFFICULTY_WEIGHT[t.difficulty], 0));
    const acc = subjectMockAccuracies[subject];
    const weakBoost = acc !== undefined && acc < 65;
    const weaknessMultiplier = acc === undefined ? 1 : acc < 50 ? 1.45 : acc < 65 ? 1.25 : acc >= 85 ? 0.85 : 1;
    const due = st.filter((t) => t.nextRevisionDate !== null && t.nextRevisionDate <= today).length;
    const revisionMultiplier = 1 + Math.min(due * 0.12, 0.45);
    const composite = (baseWeight * 0.6 + difficultyLoad * 8) * weaknessMultiplier * revisionMultiplier;
    const reasons: string[] = [];
    if (seed?.weightagePercent != null) reasons.push(`${Math.round(seed.weightagePercent)}% ${seed.weightageSource.toLowerCase()}`);
    if (remaining.length) reasons.push(`${remaining.length} pending`);
    if (weakBoost) reasons.push(`boosted (mock accuracy ${Math.round(acc)}%)`);
    if (due > 0) reasons.push(`${due} revision due`);
    return { subject, score: Math.max(1, composite), remaining: remaining.length, weakBoost, source: (weakBoost || due > 0 ? "Algorithmic Recommendation" : source) as WeightageSource, rationale: reasons.join(" • ") || "Balanced maintenance allocation" };
  });
  const totalWeight = Math.max(1, raw.reduce((a, r) => a + r.score, 0));
  const pool = Math.max(30, Math.round(weeklyBudget * (1 - revisionRatio)));
  const allocations: SubjectAllocation[] = raw
    .map((r) => ({ subject: r.subject, allocatedMinutesPerWeek: Math.max(15, Math.round((r.score / totalWeight) * pool)), sharePercent: Math.round(((r.score / totalWeight) * 100) * 10) / 10, remainingTopics: r.remaining, weakSubjectBoostApplied: r.weakBoost, weightageSource: r.source, rationale: r.rationale }))
    .sort((a, b) => b.allocatedMinutesPerWeek - a.allocatedMinutesPerWeek);

  const firstPending = (subject: string) => (grouped.get(subject) ?? []).find((t) => !isDone(t.status))?.topicName;
  const weeklySchedule: PlanDay[] = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(today, offset);
    if (offset >= safeDays) return { date, weekday: weekdayIndex(date), totalMinutes: 0, tasks: [] };
    const tasks: PlanItem[] = [];
    let left = safeDaily;
    if (offset === 0 && overdue.length) {
      const m = Math.min(left, Math.max(25, backlogPerDay));
      tasks.push({ subject: overdue[0].subject, topicName: overdue[0].topicName, taskType: missedMinutesRecently > 0 ? "Backlog Recovery" : "Revision", allocatedMinutes: m, weightageSource: "Algorithmic Recommendation", isBacklogRecovery: true });
      left -= m;
    } else if (overdue.length > offset) {
      const m = Math.min(left, 30);
      tasks.push({ subject: overdue[offset].subject, topicName: overdue[offset].topicName, taskType: "Revision", allocatedMinutes: m, weightageSource: "Algorithmic Recommendation", isBacklogRecovery: false });
      left -= m;
    }
    if (offset === safeDays - 1 && left >= 60) {
      const m = Math.min(left, exam.markingScheme.durationMinutes);
      tasks.push({ subject: exam.shortName, topicName: "Timed Mock & Error Analysis", taskType: "Mock Practice", allocatedMinutes: m, weightageSource: "Official Weightage", isBacklogRecovery: false });
      left -= m;
    }
    if (allocations.length && left >= 20) {
      const p = allocations[offset % allocations.length];
      const q = allocations[(offset + 1) % allocations.length];
      const pMin = q.subject !== p.subject && left >= 50 ? Math.round(left * 0.6) : left;
      tasks.push({ subject: p.subject, topicName: firstPending(p.subject) ?? `Core ${p.subject} Practice`, taskType: "Syllabus Study", allocatedMinutes: pMin, weightageSource: p.weightageSource, isBacklogRecovery: false });
      left -= pMin;
      if (q.subject !== p.subject && left >= 15) tasks.push({ subject: q.subject, topicName: firstPending(q.subject) ?? `Core ${q.subject} Drills`, taskType: "Syllabus Study", allocatedMinutes: left, weightageSource: q.weightageSource, isBacklogRecovery: false });
    }
    return { date, weekday: weekdayIndex(date), totalMinutes: tasks.reduce((a, t) => a + t.allocatedMinutes, 0), tasks };
  });

  const totalRemaining = topics.filter((t) => !isDone(t.status)).length;
  const horizon = daysLeft === null ? 3 : daysLeft <= 30 ? 1 : daysLeft <= 60 ? 2 : 3;
  const monthlyMilestones: Milestone[] = Array.from({ length: horizon }, (_, i) => {
    const m = i + 1;
    return {
      monthLabel: `Phase ${m} (Days ${(m - 1) * 30 + 1}–${m * 30})`,
      targetTopicsToComplete: horizon === 1 ? totalRemaining : Math.max(1, Math.round(totalRemaining / horizon)),
      recommendedMocks: daysLeft !== null && daysLeft <= 35 ? 8 : m === horizon ? 6 : 4,
      focusDirective: m === 1 && backlog > 0 ? `Clear ${backlog} overdue revisions & prioritize weakest subjects` : m === horizon ? "Full-length timed mocks, error-log elimination & rapid revision cycles" : "Steady syllabus completion with spaced active-recall checkpoints",
    };
  });
  const mockDay = weeklySchedule.find((d) => d.tasks.some((t) => t.taskType === "Mock Practice"));
  return {
    examId: exam.examId, examName: exam.name, daysUntilExam: daysLeft, dailyTargetMinutes: safeDaily, studyDaysPerWeek: safeDays,
    subjectAllocations: allocations, todayTasks: weeklySchedule[0]?.tasks ?? [], weeklySchedule, monthlyMilestones,
    revisionBacklogCount: backlog, backlogRecoveryMinutesPerDay: backlogPerDay, nextRecommendedMockDay: mockDay ? WEEKDAYS[mockDay.weekday] : "Sunday",
  };
}
