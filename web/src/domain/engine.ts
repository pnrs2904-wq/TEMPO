/**
 * Adaptive recommendation engine.
 *
 * This is a line-for-line port of the Android implementation:
 *   domain/AdaptiveRecommendationEngine.kt
 *   domain/SubjectAwareRecommendationEngine.kt
 *
 * The rules, thresholds, ordering of the safety gates and the reason strings are unchanged.
 * tests/unit/engine.test.ts ports every case from TempoRecommendationTest.kt.
 * Do not "improve" behaviour here; add new behaviour around it (see explain.ts, recommend.ts).
 */
import { defaultFocusMinutesFor } from "./energy";
import type { Session } from "./types";

export interface RecommendationResult {
  recommendedMinutes: number;
  reason: string;
  baselineMinutes: number;
  adjustmentMinutes: number;
  overrodeUserFeedback: boolean;
  overrideExplanation: string | null;
  subjectSessionsLogged: number | null;
}

export const MIN_DURATION_MINUTES = 10;
export const MAX_DURATION_MINUTES = 50;
export const ADJUSTMENT_STEP_MINUTES = 5;
export const MIN_HISTORY_REQUIRED = 3;

/** The fields of a session the engine reads. */
export type EngineSession = Pick<
  Session,
  "status" | "plannedMinutes" | "durationFeedback" | "difficulty" | "distractions" | "focusQuality" | "subject"
>;

const clamp = (n: number) => Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, n));

/**
 * @param energy  selected energy level (1..5)
 * @param history recent focus sessions for this energy level, sorted newest first
 */
export function calculateRecommendation(energy: number, history: EngineSession[]): RecommendationResult {
  const defaultMinutes = defaultFocusMinutesFor(energy);

  // Fix 1: exclude non-completed sessions from recommendation history.
  const validHistory = history.filter((s) => s.status === "completed");

  // Rule 1: no history at this energy level -> default duration.
  if (validHistory.length === 0) {
    return {
      recommendedMinutes: clamp(defaultMinutes),
      reason: "Default duration",
      baselineMinutes: defaultMinutes,
      adjustmentMinutes: 0,
      overrodeUserFeedback: false,
      overrideExplanation: null,
      subjectSessionsLogged: null,
    };
  }

  // Rule 2: fewer than three sessions -> planned duration of the most recent, clamped 10..50.
  if (validHistory.length < MIN_HISTORY_REQUIRED) {
    const clampedDuration = clamp(validHistory[0].plannedMinutes);
    return {
      recommendedMinutes: clampedDuration,
      reason: "Based on the last session",
      baselineMinutes: clampedDuration,
      adjustmentMinutes: 0,
      overrodeUserFeedback: false,
      overrideExplanation: null,
      subjectSessionsLogged: null,
    };
  }

  // Rule 3 & Fix 3: median planned duration of the three most recent sessions, clamped.
  const recentThree = validHistory.slice(0, MIN_HISTORY_REQUIRED);
  const plannedDurations = recentThree.map((s) => s.plannedMinutes).sort((a, b) => a - b);
  const baseline = clamp(plannedDurations[1]);

  // Rule 4: the student's duration feedback is the primary adjustment.
  let tooShortVotes = 0;
  let tooLongVotes = 0;
  for (const session of recentThree) {
    if (session.durationFeedback === "too_short") tooShortVotes++;
    else if (session.durationFeedback === "too_long") tooLongVotes++;
  }

  let adjustment =
    tooShortVotes > tooLongVotes ? ADJUSTMENT_STEP_MINUTES : tooLongVotes > tooShortVotes ? -ADJUSTMENT_STEP_MINUTES : 0;

  const proposedIncrease = adjustment > 0;
  let overrodeFeedback = false;
  let overrideGateExplanation: string | null = null;

  // Rule 5 & Fix 4: conservative safety gates, majority based (>= 2 of 3 sessions).
  const highDifficultyCount = recentThree.filter((s) => s.difficulty != null && s.difficulty >= 4).length;
  const highDistractionsCancelCount = recentThree.filter((s) => s.distractions != null && s.distractions >= 3).length;
  const lowFocusQualityCount = recentThree.filter((s) => s.focusQuality != null && s.focusQuality <= 2).length;
  const highDistractionsDecreaseCount = recentThree.filter((s) => s.distractions != null && s.distractions >= 4).length;

  // A proposed increase is cancelled when difficulty was high (>= 4) in >= 2 sessions.
  if (adjustment > 0 && highDifficultyCount >= 2) {
    adjustment = 0;
    if (proposedIncrease) {
      overrodeFeedback = true;
      overrideGateExplanation = `difficulty rated 4+ on ${highDifficultyCount} of your last 3 sessions`;
    }
  }

  // A proposed increase is cancelled when distractions were high (>= 3) in >= 2 sessions.
  if (adjustment > 0 && highDistractionsCancelCount >= 2) {
    adjustment = 0;
    if (proposedIncrease) {
      overrodeFeedback = true;
      overrideGateExplanation = `distractions rated 3+ on ${highDistractionsCancelCount} of your last 3 sessions`;
    }
  }

  // With no adjustment left, low focus quality (<= 2) in >= 2 sessions decreases by 5 minutes.
  if (adjustment === 0 && lowFocusQualityCount >= 2) {
    adjustment = -ADJUSTMENT_STEP_MINUTES;
    if (proposedIncrease) {
      overrodeFeedback = true;
      overrideGateExplanation = `focus quality rated 2 or lower on ${lowFocusQualityCount} of your last 3 sessions`;
    }
  }

  // With no adjustment left, very high distractions (>= 4) in >= 2 sessions decreases by 5 minutes.
  if (adjustment === 0 && highDistractionsDecreaseCount >= 2) {
    adjustment = -ADJUSTMENT_STEP_MINUTES;
    if (proposedIncrease) {
      overrodeFeedback = true;
      overrideGateExplanation = `distractions rated 4+ on ${highDistractionsDecreaseCount} of your last 3 sessions`;
    }
  }

  // Rules 6 & 7: clamp 10..50; the adjustment is never larger than 5 minutes.
  const finalMinutes = clamp(baseline + adjustment);

  return {
    recommendedMinutes: finalMinutes,
    reason: "Based on recent adaptive feedback",
    baselineMinutes: baseline,
    adjustmentMinutes: adjustment,
    overrodeUserFeedback: overrodeFeedback,
    overrideExplanation: overrodeFeedback
      ? overrideGateExplanation ?? "difficulty or focus quality in recent sessions suggested holding steady"
      : null,
    subjectSessionsLogged: null,
  };
}

/**
 * Prefers subject-specific history at the selected energy level.
 *
 * @param allHistoryForEnergy completed focus sessions for this energy level, newest first
 */
export function calculateSubjectAwareRecommendation(
  energy: number,
  subject: string,
  allHistoryForEnergy: EngineSession[],
): RecommendationResult {
  const trimmedSubject = subject.trim();
  const subjectHistory =
    trimmedSubject.length === 0
      ? []
      : allHistoryForEnergy.filter((s) => s.subject.trim().toLowerCase() === trimmedSubject.toLowerCase());

  if (subjectHistory.length >= MIN_HISTORY_REQUIRED) {
    return {
      ...calculateRecommendation(energy, subjectHistory),
      reason: `Based on your ${trimmedSubject} sessions at this energy level`,
      subjectSessionsLogged: subjectHistory.length,
    };
  }
  if (subjectHistory.length > 0) {
    return {
      ...calculateRecommendation(energy, allHistoryForEnergy),
      reason: `Not enough ${trimmedSubject} history yet — using your overall pattern at this energy level`,
      subjectSessionsLogged: subjectHistory.length,
    };
  }
  // No subject history: energy-only engine, reason unchanged.
  return calculateRecommendation(energy, allHistoryForEnergy);
}
