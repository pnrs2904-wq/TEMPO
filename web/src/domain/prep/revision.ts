/** Port of RevisionSchedulerEngine.kt. Dates are YYYY-MM-DD keys (see domain/time.ts). */
import { addDays, type DateKey } from "../time";

export const REVISION_METHODS = [
  ["reading", "Reading"], ["active_recall", "Active recall"], ["mcqs", "MCQs"], ["flashcards", "Flashcards"],
  ["writing_practice", "Writing practice"], ["numerical_problems", "Numerical problems"], ["case_studies", "Case studies"],
] as const;
export type RevisionMethod = (typeof REVISION_METHODS)[number][0];

export const DEFAULT_INTERVALS_DAYS = [1, 3, 7, 14, 30];

export interface RevisionRule { intervalsDays: number[]; poorRecallMultiplier: number; strongRecallMultiplier: number }

export interface ScheduledRevision { revisionNumber: number; baseIntervalDays: number; adjustedIntervalDays: number; nextRevisionDate: DateKey; explanation: string }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Kotlin roundToInt: half away from zero for positives (all values here are positive). */
const roundToInt = (n: number) => Math.round(n);

export function calculateNextRevision(
  actualRevisionDate: DateKey,
  previousRevisionCount: number,
  recallRating: number,
  accuracyPercent: number | null = null,
  difficulty = 3,
  rule: RevisionRule = { intervalsDays: DEFAULT_INTERVALS_DAYS, poorRecallMultiplier: 0.5, strongRecallMultiplier: 1.35 },
): ScheduledRevision {
  const safeCount = Math.max(0, previousRevisionCount);
  const nextRevNumber = safeCount + 1;
  const intervals = rule.intervalsDays.length ? rule.intervalsDays : DEFAULT_INTERVALS_DAYS;
  const baseInterval = Math.max(1, intervals[Math.min(safeCount, intervals.length - 1)]);
  const safeRecall = clamp(recallRating, 1, 5);

  let multiplier =
    safeRecall <= 1 ? 0.35
    : safeRecall === 2 ? clamp(rule.poorRecallMultiplier, 0.35, 0.8)
    : safeRecall === 3 ? 1.0
    : safeRecall === 4 ? 1.15
    : clamp(rule.strongRecallMultiplier, 1.15, 1.6);
  if (accuracyPercent !== null && accuracyPercent < 55) multiplier = Math.min(multiplier, 0.6);
  if (difficulty >= 5 && safeRecall <= 3) multiplier = Math.min(multiplier, 0.75);

  const adjustedDays = safeRecall <= 1 ? 1 : clamp(roundToInt(baseInterval * multiplier), 1, 45);
  const reason =
    safeRecall <= 2 ? `Shortened to ${adjustedDays} d due to low recall (${safeRecall}/5)`
    : safeRecall >= 4 ? `Extended to ${adjustedDays} d after strong recall (${safeRecall}/5)`
    : `Scheduled in ${adjustedDays} d (Rev #${nextRevNumber} from ${actualRevisionDate})`;
  return { revisionNumber: nextRevNumber, baseIntervalDays: baseInterval, adjustedIntervalDays: adjustedDays, nextRevisionDate: addDays(actualRevisionDate, adjustedDays), explanation: reason };
}

export const isDueOrOverdue = (next: DateKey | null, today: DateKey) => next !== null && next <= today;
