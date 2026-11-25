/**
 * Exam-preparation records. Field-for-field equivalents of the Android Room entities in
 * android/.../data/db/ExamPrepEntities.kt, with three web changes:
 *   - dates are YYYY-MM-DD keys instead of epoch days;
 *   - every record carries updatedAt / deletedAt for offline sync (deletions are tombstones);
 *   - ids are UUIDs created on the device.
 * The zod schemas are used both by the browser and by POST /api/sync.
 */
import { z } from "zod";
import { isDateKey } from "../time";

const dateKey = z.string().refine(isDateKey, "must be YYYY-MM-DD");
const stamp = z.number().int().positive();
const meta = { id: z.uuid(), examId: z.string().regex(/^[a-z0-9_]{2,40}$/), updatedAt: stamp, deletedAt: stamp.nullable() };

export const examPlanSchema = z.object({
  ...meta,
  applicableYear: z.number().int().min(2000).max(2100),
  syllabusVersion: z.string().min(1).max(40),
  caGroup: z.enum(["group_1", "group_2", "both"]),
  examDate: dateKey.nullable(),
  dailyHours: z.number().min(0.5).max(14),
  studyDaysPerWeek: z.number().int().min(1).max(7),
  targetScorePercent: z.number().int().min(30).max(100),
}).strict();

export const topicSchema = z.object({
  ...meta,
  syllabusVersion: z.string().min(1).max(40),
  subject: z.string().min(1).max(60),
  unit: z.string().max(80),
  chapter: z.string().max(80),
  topicName: z.string().min(1).max(120),
  subtopics: z.string().max(400),
  status: z.enum(["not_started", "learning", "practising", "completed", "revision_due", "mastered"]),
  difficulty: z.enum(["foundational", "moderate", "high", "critical"]),
  ncertCompleted: z.boolean(),
  formulaRevisionDone: z.boolean(),
  diagramRevisionDone: z.boolean(),
  rtpMtpCompleted: z.boolean(),
  revisionCount: z.number().int().min(0).max(1000),
  lastStudiedDate: dateKey.nullable(),
  nextRevisionDate: dateKey.nullable(),
  isCustom: z.boolean(),
}).strict();

export const revisionSchema = z.object({
  ...meta,
  topicId: z.uuid(),
  topicName: z.string().max(120),
  subject: z.string().max(60),
  revisionDate: dateKey,
  revisionNumber: z.number().int().min(1).max(1000),
  recallRating: z.number().int().min(1).max(5),
  accuracyPercent: z.number().int().min(0).max(100).nullable(),
  difficulty: z.number().int().min(1).max(5),
  nextRevisionDate: dateKey,
  method: z.enum(["reading", "active_recall", "mcqs", "flashcards", "writing_practice", "numerical_problems", "case_studies"]),
  notes: z.string().max(200).nullable(),
}).strict();

export const mockSchema = z.object({
  ...meta,
  attemptYear: z.number().int().min(2000).max(2100),
  mockName: z.string().min(1).max(60),
  dateTimestamp: stamp,
  scoringMode: z.enum(["PER_QUESTION", "MARKS_ENTRY"]),
  totalQuestions: z.number().int().min(0).max(1000),
  attemptedQuestions: z.number().int().min(0).max(1000),
  correctAnswers: z.number().int().min(0).max(1000),
  incorrectAnswers: z.number().int().min(0).max(1000),
  unansweredQuestions: z.number().int().min(0).max(1000),
  positiveMarksPerQ: z.number().min(0).max(100),
  negativeMarksPerQ: z.number().min(0).max(100),
  totalScore: z.number().min(-100000).max(100000),
  maxMarks: z.number().positive().max(100000),
  percentage: z.number().min(-100).max(100),
  accuracyPercent: z.number().min(0).max(100),
  durationMinutes: z.number().int().min(1).max(600),
  avgSecondsPerQuestion: z.number().min(0).max(100000),
  weakestSubject: z.string().max(60).nullable(),
  weakestSubjectAccuracy: z.number().min(0).max(100).nullable(),
  isQuickEntry: z.boolean(),
  notes: z.string().max(240).nullable(),
}).strict()
  .refine((m) => m.correctAnswers + m.incorrectAnswers + m.unansweredQuestions === m.totalQuestions, "question counts do not add up")
  .refine((m) => m.attemptedQuestions === m.correctAnswers + m.incorrectAnswers, "attempted must equal correct + incorrect")
  .refine((m) => m.totalScore <= m.maxMarks, "score exceeds maximum");

export const attemptSchema = z.object({
  ...meta,
  mockTestId: z.uuid(),
  questionNumber: z.number().int().min(1).max(1000),
  subject: z.string().max(60),
  topicName: z.string().max(120),
  difficulty: z.enum(["foundational", "moderate", "high", "critical"]),
  selectedAnswer: z.string().max(20).nullable(),
  correctAnswer: z.string().min(1).max(20),
  isCorrect: z.boolean(),
  timeSpentSeconds: z.number().int().min(0).max(36000),
  errorCategory: z.enum(["conceptual", "calculation", "misreading", "guessing", "memory_failure", "time_pressure"]).nullable(),
}).strict();

export type ExamPlan = z.infer<typeof examPlanSchema>;
export type TopicProgress = z.infer<typeof topicSchema>;
export type RevisionEvent = z.infer<typeof revisionSchema>;
export type MockTest = z.infer<typeof mockSchema>;
export type QuestionAttempt = z.infer<typeof attemptSchema>;

export const PREP_TABLES = {
  exam_plans: examPlanSchema,
  topic_progress: topicSchema,
  revision_events: revisionSchema,
  mock_tests: mockSchema,
  question_attempts: attemptSchema,
} as const;
export type PrepTable = keyof typeof PREP_TABLES;
export interface PrepRecordMap { exam_plans: ExamPlan; topic_progress: TopicProgress; revision_events: RevisionEvent; mock_tests: MockTest; question_attempts: QuestionAttempt }
export interface PrepEnvelope<T extends PrepTable = PrepTable> { table: T; row: PrepRecordMap[T] }

/** Last write wins, except that a deletion is kept unless the other copy is newer. */
export function mergePrep<T extends { updatedAt: number; deletedAt: number | null }>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if ((a.deletedAt !== null) !== (b.deletedAt !== null)) return a.deletedAt !== null ? a : b;
  return a;
}
