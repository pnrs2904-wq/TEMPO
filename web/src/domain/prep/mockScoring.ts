/** Port of MockTestScoringEngine.kt (including the Tempo 3.0 validation and marks-entry mode). */
export const ERROR_CATEGORIES = [
  ["conceptual", "Conceptual error"], ["calculation", "Calculation error"], ["misreading", "Misreading"],
  ["guessing", "Guessing"], ["memory_failure", "Memory failure"], ["time_pressure", "Time-pressure error"],
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number][0];
export const errorLabel = (c: ErrorCategory) => ERROR_CATEGORIES.find(([k]) => k === c)?.[1] ?? c;

export interface SchemeLike { positiveMarks: number; negativeMarks: number; hasNegativeMarking: boolean; totalQuestions: number; maxMarks: number; durationMinutes: number }

export interface QuestionAttemptInput {
  questionNumber: number;
  subject: string;
  topicName: string;
  difficulty?: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  timeSpentSeconds?: number;
  errorCategory?: ErrorCategory | null;
}
const attempted = (q: QuestionAttemptInput) => !!q.selectedAnswer && q.selectedAnswer.trim() !== "";
export const isCorrect = (q: QuestionAttemptInput) => attempted(q) && q.selectedAnswer!.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();

export interface SubjectScore { subject: string; attempted: number; correct: number; incorrect: number; unanswered: number; score: number; maxMarks: number; accuracyPercent: number; avgSecondsPerQuestion: number; qualifiesExemption: boolean }

export interface MockScore {
  totalQuestions: number; attemptedQuestions: number; correctAnswers: number; incorrectAnswers: number; unansweredQuestions: number;
  positiveMarksAwarded: number; negativeMarksDeducted: number; finalScore: number; maxMarks: number; percentage: number;
  accuracyPercent: number; attemptRatePercent: number; avgSecondsPerQuestion: number;
  subjectBreakdown: SubjectScore[]; errorCategoryCounts: Partial<Record<ErrorCategory, number>>; repeatedErrorDiagnosis: string | null;
}

/** Kotlin: (value * 100).roundToInt() / 100.0 — roundToInt rounds half up (towards +infinity). */
export const round2 = (v: number) => Math.floor(v * 100 + 0.5) / 100;

export function validateQuickEntry(total: number, correct: number, incorrect: number): string | null {
  if (!Number.isInteger(total) || total <= 0) return "Total questions must be at least 1.";
  if (correct < 0 || incorrect < 0 || !Number.isInteger(correct) || !Number.isInteger(incorrect)) return "Counts cannot be negative.";
  if (correct + incorrect > total) return `Correct (${correct}) plus incorrect (${incorrect}) is more than the ${total} questions in the test.`;
  return null;
}

export function validateMarksEntry(marks: number, maxMarks: number, minimumMarks = 0): string | null {
  if (!(maxMarks > 0)) return "Maximum marks must be more than 0.";
  if (!Number.isFinite(marks)) return "Enter a number.";
  if (marks > maxMarks) return `Marks obtained (${marks}) cannot exceed the maximum (${maxMarks}).`;
  if (marks < minimumMarks) return `Marks obtained cannot be below ${minimumMarks}.`;
  return null;
}

export function scoreQuickEntry(totalQuestions: number, correctAnswers: number, incorrectAnswers: number, m: SchemeLike, durationMinutes = m.durationMinutes): MockScore {
  const safeTotal = Math.max(1, totalQuestions);
  const safeCorrect = Math.min(safeTotal, Math.max(0, correctAnswers));
  const safeIncorrect = Math.min(Math.max(0, safeTotal - safeCorrect), Math.max(0, incorrectAnswers));
  const att = safeCorrect + safeIncorrect;
  const neg = m.hasNegativeMarking ? Math.max(0, m.negativeMarks) : 0;
  const pos = safeCorrect * m.positiveMarks;
  const ded = safeIncorrect * neg;
  const finalScore = round2(pos - ded);
  const maxMarks = m.maxMarks > 0 && safeTotal === m.totalQuestions ? m.maxMarks : round2(safeTotal * m.positiveMarks);
  return {
    totalQuestions: safeTotal, attemptedQuestions: att, correctAnswers: safeCorrect, incorrectAnswers: safeIncorrect, unansweredQuestions: safeTotal - att,
    positiveMarksAwarded: round2(pos), negativeMarksDeducted: round2(ded), finalScore, maxMarks,
    percentage: maxMarks > 0 ? round2((finalScore / maxMarks) * 100) : 0,
    accuracyPercent: att > 0 ? round2((safeCorrect / att) * 100) : 0,
    attemptRatePercent: round2((att / safeTotal) * 100),
    avgSecondsPerQuestion: att > 0 ? round2((durationMinutes * 60) / att) : 0,
    subjectBreakdown: [], errorCategoryCounts: {}, repeatedErrorDiagnosis: null,
  };
}

export function scoreMarksEntry(marks: number, maxMarks: number): MockScore {
  if (validateMarksEntry(marks, maxMarks, -maxMarks)) throw new Error("invalid marks entry");
  const score = round2(marks);
  return {
    totalQuestions: 0, attemptedQuestions: 0, correctAnswers: 0, incorrectAnswers: 0, unansweredQuestions: 0,
    positiveMarksAwarded: round2(Math.max(0, marks)), negativeMarksDeducted: 0, finalScore: score, maxMarks: round2(maxMarks),
    percentage: round2((score / maxMarks) * 100), accuracyPercent: 0, attemptRatePercent: 0, avgSecondsPerQuestion: 0,
    subjectBreakdown: [], errorCategoryCounts: {}, repeatedErrorDiagnosis: null,
  };
}

export function scoreQuestionAttempts(attempts: QuestionAttemptInput[], m: SchemeLike): MockScore {
  if (attempts.length === 0) return scoreQuickEntry(m.totalQuestions, 0, 0, m);
  const neg = m.hasNegativeMarking ? Math.max(0, m.negativeMarks) : 0;
  const total = attempts.length;
  const correct = attempts.filter(isCorrect).length;
  const incorrect = attempts.filter((q) => attempted(q) && !isCorrect(q)).length;
  const att = correct + incorrect;
  const pos = correct * m.positiveMarks;
  const ded = incorrect * neg;
  const finalScore = round2(pos - ded);
  const maxMarks = round2(total * m.positiveMarks);

  const groups = new Map<string, QuestionAttemptInput[]>();
  for (const q of attempts) {
    const k = q.subject.trim() || "General";
    groups.set(k, [...(groups.get(k) ?? []), q]);
  }
  const subjectBreakdown = [...groups.entries()]
    .map(([subject, items]) => {
      const c = items.filter(isCorrect).length;
      const i = items.filter((q) => attempted(q) && !isCorrect(q)).length;
      const sAtt = c + i;
      const sScore = round2(c * m.positiveMarks - i * neg);
      const sMax = round2(items.length * m.positiveMarks);
      const sPct = sMax > 0 ? (sScore / sMax) * 100 : 0;
      return {
        subject, attempted: sAtt, correct: c, incorrect: i, unanswered: items.length - sAtt, score: sScore, maxMarks: sMax,
        accuracyPercent: sAtt > 0 ? round2((c / sAtt) * 100) : 0,
        avgSecondsPerQuestion: round2(items.reduce((a, q) => a + (q.timeSpentSeconds ?? 60), 0) / items.length),
        qualifiesExemption: sPct >= 60,
      };
    })
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent);

  const errorCategoryCounts: Partial<Record<ErrorCategory, number>> = {};
  for (const q of attempts) if (attempted(q) && !isCorrect(q) && q.errorCategory) errorCategoryCounts[q.errorCategory] = (errorCategoryCounts[q.errorCategory] ?? 0) + 1;
  // Kotlin maxByOrNull keeps the first maximum in insertion order.
  let top: [ErrorCategory, number] | null = null;
  for (const [k, v] of Object.entries(errorCategoryCounts) as [ErrorCategory, number][]) if (!top || v > top[1]) top = [k, v];
  const totalSec = attempts.reduce((a, q) => a + Math.max(0, q.timeSpentSeconds ?? 60), 0);

  return {
    totalQuestions: total, attemptedQuestions: att, correctAnswers: correct, incorrectAnswers: incorrect, unansweredQuestions: total - att,
    positiveMarksAwarded: round2(pos), negativeMarksDeducted: round2(ded), finalScore, maxMarks,
    percentage: maxMarks > 0 ? round2((finalScore / maxMarks) * 100) : 0,
    accuracyPercent: att > 0 ? round2((correct / att) * 100) : 0,
    attemptRatePercent: round2((att / total) * 100),
    avgSecondsPerQuestion: att > 0 ? round2(totalSec / att) : 0,
    subjectBreakdown, errorCategoryCounts,
    repeatedErrorDiagnosis: top ? `Top repeated mistake: ${errorLabel(top[0])} (${top[1]} of ${incorrect} incorrect answers)` : null,
  };
}
