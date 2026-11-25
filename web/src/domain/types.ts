/**
 * Core data model. Ported from the Android app:
 *   data/db/SessionEntity.kt, data/model/{SessionStatus,SessionPhase,SessionType,DurationFeedback}.kt
 *
 * Changes from Android (all additive):
 *   - `id` is a client-generated UUID instead of an auto-increment Long, so sessions recorded
 *     offline on several devices can be merged without collisions.
 *   - `tz` and `localDate` are captured when the session starts, so a session keeps its calendar
 *     day even if the user later travels or the device timezone changes.
 *   - `expectedDifficulty`, `topicId`, `mockScore`, `mockMaxScore` support exam workflows.
 */

export type SessionPhase = "focus" | "break";

export type SessionStatus = "active" | "paused" | "completed" | "ended_early" | "cancelled" | "unknown";

export const SESSION_TYPES = ["Study", "Revision", "Practice Questions", "Mock Test"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export type DurationFeedback = "not_sure" | "too_short" | "about_right" | "too_long";

export const DURATION_FEEDBACK_LABELS: Record<DurationFeedback, string> = {
  not_sure: "Not sure",
  too_short: "Too short",
  about_right: "About right",
  too_long: "Too long",
};

export interface Session {
  id: string;
  /** Start time, epoch milliseconds (UTC). Android: `timestamp`. */
  timestamp: number;
  /** IANA timezone the session was started in. */
  tz: string;
  /** Calendar day (YYYY-MM-DD) in `tz` at start. */
  localDate: string;
  phase: SessionPhase;
  energy: number; // 1..5
  subject: string; // max 60 chars
  sessionType: SessionType;
  plannedMinutes: number;
  actualSeconds: number;
  status: SessionStatus;
  focusQuality: number | null; // 1..5
  difficulty: number | null; // 1..5, rated after the session
  durationFeedback: DurationFeedback | null;
  distractions: number | null;
  notes: string | null; // max 240 chars
  /** Difficulty the student expected before starting (1..5). Pre-fills the post-session rating. */
  expectedDifficulty: number | null;
  topicId: string | null;
  mockScore: number | null;
  mockMaxScore: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

const STATUSES: SessionStatus[] = ["active", "paused", "completed", "ended_early", "cancelled", "unknown"];

/** Unknown or corrupted values map to "unknown", never to "completed" (ProductionHardeningTest). */
export function parseSessionStatus(value: unknown): SessionStatus {
  if (typeof value !== "string") return "unknown";
  const v = value.trim().toLowerCase();
  return (STATUSES as string[]).includes(v) ? (v as SessionStatus) : "unknown";
}

export function parseSessionPhase(value: unknown): SessionPhase {
  return typeof value === "string" && value.trim().toLowerCase() === "break" ? "break" : "focus";
}

export function parseSessionType(value: unknown): SessionType {
  if (typeof value !== "string") return "Study";
  const v = value.trim().toLowerCase().replace(/_/g, " ");
  return SESSION_TYPES.find((t) => t.toLowerCase() === v) ?? "Study";
}

export function parseDurationFeedback(value: unknown): DurationFeedback | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v === "not_sure" || v === "too_short" || v === "about_right" || v === "too_long" ? v : null;
}

export const TERMINAL_STATUSES: SessionStatus[] = ["completed", "ended_early", "cancelled"];

export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const LIMITS = {
  subjectMax: 60,
  notesMax: 240,
  /** Mock tests follow the real paper's length, so they may run longer than adaptive sessions. */
  mockMaxMinutes: 240,
  manualMaxMinutes: 120,
  manualMinMinutes: 5,
} as const;
