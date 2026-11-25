"use client";
/**
 * Exam-preparation store (web counterpart of ExamPrepRepository.kt).
 * Every change is written to IndexedDB first, queued for sync, then shown. Deletions are
 * tombstones so they reach other devices.
 */
import { useSyncExternalStore } from "react";
import { effectiveSubjects, findExam, seedTopics, topicKey, type CaGroup, type ExamConfig, type TopicDifficulty } from "@/domain/exams";
import { parseSyllabus } from "@/domain/prep/csvImport";
import { isCorrect, scoreMarksEntry, scoreQuestionAttempts, scoreQuickEntry, validateMarksEntry, validateQuickEntry, type QuestionAttemptInput, type SchemeLike } from "@/domain/prep/mockScoring";
import { calculateNextRevision, type RevisionMethod } from "@/domain/prep/revision";
import type { TopicStatus } from "@/domain/prep/studyPlan";
import { mergePrep, type ExamPlan, type MockTest, type PrepEnvelope, type PrepRecordMap, type PrepTable, type QuestionAttempt, type RevisionEvent, type TopicProgress } from "@/domain/prep/types";
import { addDays } from "@/domain/time";
import { loadPrep, savePrep } from "./db";

export interface PrepState {
  ready: boolean;
  plans: Map<string, ExamPlan>;
  topics: Map<string, TopicProgress>;
  revisions: Map<string, RevisionEvent>;
  mocks: Map<string, MockTest>;
  attempts: Map<string, QuestionAttempt>;
}

let state: PrepState = { ready: false, plans: new Map(), topics: new Map(), revisions: new Map(), mocks: new Map(), attempts: new Map() };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const usePrep = (): PrepState => useSyncExternalStore(subscribe, () => state, () => state);
export const getPrep = () => state;

const tableMap: Record<PrepTable, keyof Omit<PrepState, "ready">> = {
  exam_plans: "plans", topic_progress: "topics", revision_events: "revisions", mock_tests: "mocks", question_attempts: "attempts",
};

function apply(records: PrepEnvelope[]) {
  const next: PrepState = { ...state, plans: new Map(state.plans), topics: new Map(state.topics), revisions: new Map(state.revisions), mocks: new Map(state.mocks), attempts: new Map(state.attempts) };
  for (const r of records) {
    const m = next[tableMap[r.table]] as Map<string, { updatedAt: number; deletedAt: number | null }>;
    const cur = m.get(r.row.id);
    m.set(r.row.id, cur ? mergePrep(cur, r.row) : r.row);
  }
  state = next;
  emit();
}

let syncHook: () => void = () => undefined;
/** Registered by store.ts so prep changes trigger a sync without a circular import at load time. */
export const setPrepSyncHook = (fn: () => void) => { syncHook = fn; };

async function commit(records: PrepEnvelope[]) {
  if (!records.length) return;
  await savePrep(records);
  apply(records);
  syncHook();
}

/** Applies records received from the server (already merged there). */
export async function applyRemotePrep(records: PrepEnvelope[]) {
  if (!records.length) return;
  const merged = records.map((r) => {
    const m = state[tableMap[r.table]] as Map<string, PrepRecordMap[typeof r.table]>;
    const cur = m.get(r.row.id);
    return { table: r.table, row: cur ? mergePrep(cur, r.row) : r.row } as PrepEnvelope;
  });
  await savePrep(merged, { fromServer: true });
  apply(merged);
}

let started = false;
export async function initPrep() {
  if (started) return;
  started = true;
  const all = await loadPrep();
  apply(all);
  state = { ...state, ready: true };
  emit();
}

export function resetPrepMemory() {
  state = { ready: true, plans: new Map(), topics: new Map(), revisions: new Map(), mocks: new Map(), attempts: new Map() };
  emit();
}

const live = <T extends { deletedAt: number | null }>(m: Map<string, T>) => [...m.values()].filter((x) => x.deletedAt === null);
const stamp = (prev?: { updatedAt: number }) => Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
const uuid = () => crypto.randomUUID();

// ---------------------------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------------------------
export const planFor = (s: PrepState, examId: string) => live(s.plans).find((p) => p.examId === examId) ?? null;

/** Topics for an exam, limited to the active CA group (custom topics always show), like Android. */
export function topicsFor(s: PrepState, exam: ExamConfig, group: CaGroup): TopicProgress[] {
  const all = live(s.topics).filter((t) => t.examId === exam.examId);
  if (!exam.supportsCaGroups) return all;
  const allowed = new Set(effectiveSubjects(exam, group).map((x) => x.name.toLowerCase()));
  return all.filter((t) => t.isCustom || allowed.has(t.subject.toLowerCase()));
}
export const revisionsFor = (s: PrepState, examId: string) => live(s.revisions).filter((r) => r.examId === examId).sort((a, b) => b.updatedAt - a.updatedAt);
export const mocksFor = (s: PrepState, examId: string) => live(s.mocks).filter((m) => m.examId === examId).sort((a, b) => b.dateTimestamp - a.dateTimestamp);
export const attemptsFor = (s: PrepState, examId: string) => live(s.attempts).filter((a) => a.examId === examId);

// ---------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------

/** Creates the plan and seeds the official syllabus. Never removes topics, including other exams'. */
export async function ensureExamInitialized(exam: ExamConfig, group: CaGroup = "both") {
  const now = Date.now();
  const out: PrepEnvelope[] = [];
  if (!planFor(state, exam.examId)) {
    out.push({ table: "exam_plans", row: { id: uuid(), examId: exam.examId, applicableYear: exam.applicableYear, syllabusVersion: exam.syllabusVersion, caGroup: group, examDate: null, dailyHours: 4, studyDaysPerWeek: 6, targetScorePercent: 75, updatedAt: now, deletedAt: null } });
  }
  const existing = new Set(live(state.topics).filter((t) => t.examId === exam.examId).map((t) => topicKey(t.subject, t.chapter, t.topicName)));
  for (const t of seedTopics(exam, group)) {
    if (existing.has(topicKey(t.subject, t.chapter, t.topicName))) continue;
    out.push({ table: "topic_progress", row: { id: uuid(), examId: exam.examId, syllabusVersion: exam.syllabusVersion, subject: t.subject.slice(0, 60), unit: t.unit.slice(0, 80), chapter: t.chapter.slice(0, 80), topicName: t.topicName.slice(0, 120), subtopics: t.subtopics.slice(0, 400), status: "not_started", difficulty: t.difficulty, ncertCompleted: false, formulaRevisionDone: false, diagramRevisionDone: false, rtpMtpCompleted: false, revisionCount: 0, lastStudiedDate: null, nextRevisionDate: null, isCustom: false, updatedAt: now, deletedAt: null } });
  }
  await commit(out);
}

export async function updatePlan(examId: string, patch: Partial<Pick<ExamPlan, "caGroup" | "examDate" | "dailyHours" | "studyDaysPerWeek" | "targetScorePercent">>) {
  const cur = planFor(state, examId);
  if (!cur) return;
  const next: ExamPlan = {
    ...cur, ...patch,
    dailyHours: Math.min(14, Math.max(0.5, patch.dailyHours ?? cur.dailyHours)),
    studyDaysPerWeek: Math.min(7, Math.max(1, Math.round(patch.studyDaysPerWeek ?? cur.studyDaysPerWeek))),
    targetScorePercent: Math.min(100, Math.max(30, Math.round(patch.targetScorePercent ?? cur.targetScorePercent))),
    updatedAt: stamp(cur),
  };
  await commit([{ table: "exam_plans", row: next }]);
  const exam = findExam(examId);
  if (exam && patch.caGroup && exam.supportsCaGroups) await ensureExamInitialized(exam, patch.caGroup);
}

/** Port of updateTopicStatus, plus a Tempo 3.0 fix: "Not started" clears revision scheduling. */
export async function setTopicStatus(topicId: string, status: TopicStatus, today: string) {
  const t = state.topics.get(topicId);
  if (!t || t.deletedAt) return;
  const nextRevisionDate =
    status === "not_started" ? null
    : status === "completed" && t.nextRevisionDate === null ? addDays(today, 1)
    : status === "revision_due" ? today
    : t.nextRevisionDate;
  await commit([{ table: "topic_progress", row: { ...t, status, nextRevisionDate, revisionCount: status === "not_started" ? 0 : t.revisionCount, lastStudiedDate: status !== "not_started" ? today : t.lastStudiedDate, updatedAt: stamp(t) } }]);
}

export async function setTopicFlags(topicId: string, flags: Partial<Pick<TopicProgress, "ncertCompleted" | "formulaRevisionDone" | "diagramRevisionDone" | "rtpMtpCompleted">>) {
  const t = state.topics.get(topicId);
  if (!t || t.deletedAt) return;
  await commit([{ table: "topic_progress", row: { ...t, ...flags, updatedAt: stamp(t) } }]);
}

export async function addCustomTopic(exam: ExamConfig, subject: string, unit: string, chapter: string, topicName: string, difficulty: TopicDifficulty): Promise<string | null> {
  const name = topicName.trim().slice(0, 120);
  if (!name) return "Enter a topic name.";
  const sub = (subject.trim() || exam.subjects[0]?.name || "General").slice(0, 60);
  const ch = (chapter.trim() || "Custom Chapter").slice(0, 80);
  if (live(state.topics).some((t) => t.examId === exam.examId && topicKey(t.subject, t.chapter, t.topicName) === topicKey(sub, ch, name))) return "That topic is already in this chapter.";
  await commit([{ table: "topic_progress", row: { id: uuid(), examId: exam.examId, syllabusVersion: exam.syllabusVersion, subject: sub, unit: (unit.trim() || "Custom Unit").slice(0, 80), chapter: ch, topicName: name, subtopics: "", status: "not_started", difficulty, ncertCompleted: false, formulaRevisionDone: false, diagramRevisionDone: false, rtpMtpCompleted: false, revisionCount: 0, lastStudiedDate: null, nextRevisionDate: null, isCustom: true, updatedAt: Date.now(), deletedAt: null } }]);
  return null;
}

export async function importSyllabusCsv(exam: ExamConfig, raw: string, defaultSubject: string): Promise<number> {
  const rows = parseSyllabus(raw, defaultSubject);
  const existing = new Set(live(state.topics).filter((t) => t.examId === exam.examId).map((t) => `${t.subject}|${t.topicName}`.toLowerCase()));
  const now = Date.now();
  const out: PrepEnvelope[] = [];
  for (const r of rows.slice(0, 2000)) {
    const k = `${r.subject}|${r.topicName}`.toLowerCase();
    if (existing.has(k)) continue;
    existing.add(k);
    out.push({ table: "topic_progress", row: { id: uuid(), examId: exam.examId, syllabusVersion: exam.syllabusVersion, subject: r.subject, unit: r.unit, chapter: r.chapter, topicName: r.topicName, subtopics: "", status: "not_started", difficulty: r.difficulty, ncertCompleted: false, formulaRevisionDone: false, diagramRevisionDone: false, rtpMtpCompleted: false, revisionCount: 0, lastStudiedDate: null, nextRevisionDate: null, isCustom: true, updatedAt: now, deletedAt: null } });
  }
  await commit(out);
  return out.length;
}

/** Deletes a topic and its revision history (Android: ON DELETE CASCADE). */
export async function deleteTopic(topicId: string) {
  const t = state.topics.get(topicId);
  if (!t || t.deletedAt) return;
  const now = Date.now();
  const out: PrepEnvelope[] = [{ table: "topic_progress", row: { ...t, deletedAt: now, updatedAt: stamp(t) } }];
  for (const r of live(state.revisions)) if (r.topicId === topicId) out.push({ table: "revision_events", row: { ...r, deletedAt: now, updatedAt: stamp(r) } });
  await commit(out);
}

export type RevisionOutcome = { ok: true; explanation: string } | { ok: false; message: string };

export async function logRevision(exam: ExamConfig, topicId: string, recallRating: number, accuracyPercent: number | null, difficulty: number, method: RevisionMethod, notes: string, today: string): Promise<RevisionOutcome> {
  // Read the current topic from the store, never a copy held by the screen (Tempo 3.0 fix).
  const topic = state.topics.get(topicId);
  if (!topic || topic.deletedAt) return { ok: false, message: "This topic no longer exists." };
  if (live(state.revisions).some((r) => r.topicId === topicId && r.revisionDate === today)) {
    return { ok: false, message: `A revision for "${topic.topicName}" was already logged today. Duplicate revision prevented.` };
  }
  const sched = calculateNextRevision(today, topic.revisionCount, recallRating, accuracyPercent, difficulty, { intervalsDays: exam.revisionIntervalsDays, poorRecallMultiplier: exam.poorRecallMultiplier, strongRecallMultiplier: exam.strongRecallMultiplier });
  const now = Date.now();
  const recall = Math.min(5, Math.max(1, Math.round(recallRating)));
  const acc = accuracyPercent === null ? null : Math.min(100, Math.max(0, Math.round(accuracyPercent)));
  const status: TopicStatus = recall >= 4 && sched.revisionNumber >= 3 && (acc === null || acc >= 80) ? "mastered" : recall <= 2 ? "revision_due" : "completed";
  await commit([
    { table: "revision_events", row: { id: uuid(), examId: exam.examId, topicId, topicName: topic.topicName, subject: topic.subject, revisionDate: today, revisionNumber: sched.revisionNumber, recallRating: recall, accuracyPercent: acc, difficulty: Math.min(5, Math.max(1, Math.round(difficulty))), nextRevisionDate: sched.nextRevisionDate, method, notes: notes.trim().slice(0, 200) || null, updatedAt: now, deletedAt: null } },
    { table: "topic_progress", row: { ...topic, status, revisionCount: sched.revisionNumber, lastStudiedDate: today, nextRevisionDate: sched.nextRevisionDate, updatedAt: stamp(topic) } },
  ]);
  return { ok: true, explanation: sched.explanation };
}

export async function rescheduleRevision(topicId: string, date: string) {
  const t = state.topics.get(topicId);
  if (!t || t.deletedAt) return;
  await commit([{ table: "topic_progress", row: { ...t, nextRevisionDate: date, updatedAt: stamp(t) } }]);
}

function mockBase(exam: ExamConfig, name: string, durationMinutes: number, notes: string) {
  return { id: uuid(), examId: exam.examId, attemptYear: exam.applicableYear, mockName: name.trim().slice(0, 60) || `${exam.shortName} Mock`, dateTimestamp: Date.now(), durationMinutes: Math.min(600, Math.max(1, Math.round(durationMinutes))), notes: notes.trim().slice(0, 240) || null, updatedAt: Date.now(), deletedAt: null };
}

export async function recordQuickMock(exam: ExamConfig, name: string, total: number, correct: number, incorrect: number, durationMinutes: number, scheme: SchemeLike, weakestSubject: string, notes: string): Promise<string | null> {
  const err = validateQuickEntry(total, correct, incorrect);
  if (err) return err;
  const r = scoreQuickEntry(total, correct, incorrect, scheme, durationMinutes);
  await commit([{ table: "mock_tests", row: { ...mockBase(exam, name, durationMinutes, notes), scoringMode: "PER_QUESTION", totalQuestions: r.totalQuestions, attemptedQuestions: r.attemptedQuestions, correctAnswers: r.correctAnswers, incorrectAnswers: r.incorrectAnswers, unansweredQuestions: r.unansweredQuestions, positiveMarksPerQ: scheme.positiveMarks, negativeMarksPerQ: scheme.hasNegativeMarking ? scheme.negativeMarks : 0, totalScore: r.finalScore, maxMarks: r.maxMarks, percentage: Math.max(-100, r.percentage), accuracyPercent: r.accuracyPercent, avgSecondsPerQuestion: r.avgSecondsPerQuestion, weakestSubject: weakestSubject.trim().slice(0, 60) || null, weakestSubjectAccuracy: null, isQuickEntry: true } }]);
  return null;
}

export async function recordMarksMock(exam: ExamConfig, name: string, marks: number, maxMarks: number, durationMinutes: number, notes: string): Promise<string | null> {
  const err = validateMarksEntry(marks, maxMarks, -maxMarks);
  if (err) return err;
  const r = scoreMarksEntry(marks, maxMarks);
  await commit([{ table: "mock_tests", row: { ...mockBase(exam, name, durationMinutes, notes), scoringMode: "MARKS_ENTRY", totalQuestions: 0, attemptedQuestions: 0, correctAnswers: 0, incorrectAnswers: 0, unansweredQuestions: 0, positiveMarksPerQ: 0, negativeMarksPerQ: 0, totalScore: r.finalScore, maxMarks: r.maxMarks, percentage: r.percentage, accuracyPercent: 0, avgSecondsPerQuestion: 0, weakestSubject: null, weakestSubjectAccuracy: null, isQuickEntry: true } }]);
  return null;
}

export async function recordDetailedMock(exam: ExamConfig, name: string, attempts: QuestionAttemptInput[], durationMinutes: number, notes: string): Promise<string | null> {
  if (attempts.length === 0) return "Add at least one question.";
  const r = scoreQuestionAttempts(attempts, exam.markingScheme);
  const weakest = r.subjectBreakdown[0];
  const base = mockBase(exam, name, durationMinutes, notes);
  const out: PrepEnvelope[] = [{ table: "mock_tests", row: { ...base, scoringMode: "PER_QUESTION", totalQuestions: r.totalQuestions, attemptedQuestions: r.attemptedQuestions, correctAnswers: r.correctAnswers, incorrectAnswers: r.incorrectAnswers, unansweredQuestions: r.unansweredQuestions, positiveMarksPerQ: exam.markingScheme.positiveMarks, negativeMarksPerQ: exam.markingScheme.hasNegativeMarking ? exam.markingScheme.negativeMarks : 0, totalScore: r.finalScore, maxMarks: r.maxMarks, percentage: Math.max(-100, r.percentage), accuracyPercent: r.accuracyPercent, avgSecondsPerQuestion: r.avgSecondsPerQuestion, weakestSubject: weakest?.subject.slice(0, 60) ?? null, weakestSubjectAccuracy: weakest?.accuracyPercent ?? null, isQuickEntry: false } }];
  for (const q of attempts) {
    out.push({ table: "question_attempts", row: { id: uuid(), examId: exam.examId, mockTestId: base.id, questionNumber: q.questionNumber, subject: q.subject.slice(0, 60), topicName: q.topicName.slice(0, 120), difficulty: (q.difficulty as TopicDifficulty) ?? "moderate", selectedAnswer: q.selectedAnswer?.trim().slice(0, 20) || null, correctAnswer: q.correctAnswer.trim().slice(0, 20), isCorrect: isCorrect(q), timeSpentSeconds: Math.max(0, Math.round(q.timeSpentSeconds ?? 60)), errorCategory: q.errorCategory ?? null, updatedAt: base.updatedAt, deletedAt: null } });
  }
  await commit(out);
  return null;
}

export async function deleteMock(mockId: string) {
  const m = state.mocks.get(mockId);
  if (!m || m.deletedAt) return;
  const now = Date.now();
  const out: PrepEnvelope[] = [{ table: "mock_tests", row: { ...m, deletedAt: now, updatedAt: stamp(m) } }];
  for (const a of live(state.attempts)) if (a.mockTestId === mockId) out.push({ table: "question_attempts", row: { ...a, deletedAt: now, updatedAt: stamp(a) } });
  await commit(out);
}

/** All live prep records, for export. */
export function exportPrep(s: PrepState) {
  return { examPlans: live(s.plans), topics: live(s.topics), revisions: live(s.revisions), mocks: live(s.mocks), questionAttempts: live(s.attempts) };
}
