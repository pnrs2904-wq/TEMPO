/**
 * Selects the history the engine sees and turns its result into a line-item "receipt".
 *
 * History selection mirrors TempoViewModel.updateRecommendationForCurrentEnergy():
 *   phase == focus, status == completed, energy == selected energy, newest first.
 *
 * One web-only rule is added: Mock Test sessions are left out, because their length is set by the
 * real paper (often 120-180 minutes) and would distort an engine that works in the 10-50 range.
 */
import {
  ADJUSTMENT_STEP_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  MIN_HISTORY_REQUIRED,
  calculateSubjectAwareRecommendation,
  type RecommendationResult,
} from "./engine";
import { energyLevel } from "./energy";
import type { Session } from "./types";

export function historyForEnergy(sessions: Session[], energy: number): Session[] {
  return sessions
    .filter(
      (s) =>
        !s.deletedAt &&
        s.phase === "focus" &&
        s.status === "completed" &&
        s.energy === energy &&
        s.sessionType !== "Mock Test",
    )
    .sort((a, b) => b.timestamp - a.timestamp);
}

export interface ReceiptLine {
  label: string;
  /** Signed minutes this line contributes; null for informational lines. */
  minutes: number | null;
  kind: "base" | "plus" | "minus" | "hold" | "info";
}

export interface Recommendation {
  result: RecommendationResult;
  receipt: ReceiptLine[];
  /** One plain sentence for people who do not open the receipt. */
  summary: string;
}

/** Context from exam mode; mirrors ExamFocusContext in the Android app. */
export interface ExamFocusContext { examName: string; sessionType: string; daysUntilExam: number | null }

/**
 * Port of SubjectAwareRecommendationEngine.calculateExamAwareRecommendation (Tempo 2.0): a revision
 * session within 14 days of the exam is kept 5 minutes shorter when the base is over 35 minutes.
 * Tempo 3.0 makes the timer start this figure; 2.0 only showed it.
 */
export function examAwareMinutes(baseMinutes: number, ctx: ExamFocusContext | null): { minutes: number; note: string | null } {
  if (!ctx || ctx.sessionType === "Mock Test") return { minutes: baseMinutes, note: null };
  if (ctx.sessionType === "Revision" && ctx.daysUntilExam !== null && ctx.daysUntilExam >= 0 && ctx.daysUntilExam <= 14 && baseMinutes > 35) {
    return { minutes: Math.max(MIN_DURATION_MINUTES, baseMinutes - 5), note: `${ctx.daysUntilExam} days to ${ctx.examName}: revision kept to tighter recall blocks` };
  }
  return { minutes: baseMinutes, note: null };
}

export function recommend(sessions: Session[], energy: number, subject: string, exam: ExamFocusContext | null = null): Recommendation {
  const history = historyForEnergy(sessions, energy);
  const base = calculateSubjectAwareRecommendation(energy, subject, history);
  const receipt = buildReceipt(base, history, energy, subject);
  const adj = examAwareMinutes(base.recommendedMinutes, exam);
  if (adj.note) {
    receipt.push({ label: adj.note, minutes: adj.minutes - base.recommendedMinutes, kind: "minus" });
    return { result: { ...base, recommendedMinutes: adj.minutes }, receipt, summary: buildSummary(base).replace(/\.$/, "") + "; " + adj.note + "." };
  }
  return { result: base, receipt, summary: buildSummary(base) };
}

/**
 * Explains a result. Every number shown comes from the engine's own output; this function only
 * recounts the votes and gates so the student can see which rule fired.
 */
export function buildReceipt(
  result: RecommendationResult,
  history: Session[],
  energy: number,
  subject: string,
): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const level = energyLevel(energy);
  const trimmed = subject.trim();
  const subjectHistory = trimmed
    ? history.filter((s) => s.subject.trim().toLowerCase() === trimmed.toLowerCase())
    : [];
  const usingSubject = subjectHistory.length >= MIN_HISTORY_REQUIRED;
  const pool = usingSubject ? subjectHistory : history;

  if (pool.length === 0) {
    lines.push({ label: `Starting point for ${level.shortLabel.toLowerCase()} energy`, minutes: result.baselineMinutes, kind: "base" });
    lines.push({ label: "No completed sessions at this energy yet, so nothing to adapt from", minutes: null, kind: "info" });
    return lines;
  }

  if (pool.length < MIN_HISTORY_REQUIRED) {
    lines.push({ label: "Length of your last completed session at this energy", minutes: result.baselineMinutes, kind: "base" });
    lines.push({
      label: `${pool.length} of ${MIN_HISTORY_REQUIRED} sessions logged; adapting starts at ${MIN_HISTORY_REQUIRED}`,
      minutes: null,
      kind: "info",
    });
    return lines;
  }

  const recent = pool.slice(0, MIN_HISTORY_REQUIRED);
  const planned = recent.map((s) => s.plannedMinutes);
  lines.push({
    label: `Middle value of your last 3 ${usingSubject ? trimmed + " " : ""}sessions (${planned.join(", ")} min)`,
    minutes: result.baselineMinutes,
    kind: "base",
  });

  if (trimmed && !usingSubject && subjectHistory.length > 0) {
    lines.push({
      label: `Only ${subjectHistory.length} ${trimmed} session${subjectHistory.length === 1 ? "" : "s"} at this energy, so all subjects are used`,
      minutes: null,
      kind: "info",
    });
  }

  const tooShort = recent.filter((s) => s.durationFeedback === "too_short").length;
  const tooLong = recent.filter((s) => s.durationFeedback === "too_long").length;

  if (result.overrodeUserFeedback) {
    lines.push({
      label: `You said "too short" ${tooShort} of 3 times, but held: ${result.overrideExplanation}`,
      minutes: 0,
      kind: "hold",
    });
    if (result.adjustmentMinutes < 0) {
      lines.push({ label: "Shortened to protect focus quality", minutes: result.adjustmentMinutes, kind: "minus" });
    }
  } else if (result.adjustmentMinutes > 0) {
    lines.push({ label: `You said "too short" ${tooShort} of 3 times`, minutes: ADJUSTMENT_STEP_MINUTES, kind: "plus" });
  } else if (result.adjustmentMinutes < 0 && tooLong > tooShort) {
    lines.push({ label: `You said "too long" ${tooLong} of 3 times`, minutes: -ADJUSTMENT_STEP_MINUTES, kind: "minus" });
  } else if (result.adjustmentMinutes < 0) {
    const lowQuality = recent.filter((s) => s.focusQuality != null && s.focusQuality <= 2).length;
    lines.push({
      label:
        lowQuality >= 2
          ? `Focus felt low (2 or under) in ${lowQuality} of 3 sessions`
          : "Distractions were high (4+) in most of your last 3 sessions",
      minutes: -ADJUSTMENT_STEP_MINUTES,
      kind: "minus",
    });
  } else {
    lines.push({ label: "Your feedback says this length is working", minutes: 0, kind: "info" });
  }

  const raw = result.baselineMinutes + result.adjustmentMinutes;
  if (raw !== result.recommendedMinutes) {
    lines.push({
      label: `Kept within ${MIN_DURATION_MINUTES}-${MAX_DURATION_MINUTES} minutes`,
      minutes: result.recommendedMinutes - raw,
      kind: "info",
    });
  }
  return lines;
}

function buildSummary(r: RecommendationResult): string {
  if (r.overrodeUserFeedback) return `Holding steady: ${r.overrideExplanation}.`;
  if (r.adjustmentMinutes > 0) return `${r.reason}: 5 minutes longer than your recent sessions.`;
  if (r.adjustmentMinutes < 0) return `${r.reason}: 5 minutes shorter than your recent sessions.`;
  return `${r.reason}.`;
}
