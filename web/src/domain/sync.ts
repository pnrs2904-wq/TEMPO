/**
 * Offline sync rules, shared by the browser and the server so both sides merge identically.
 *
 * Sessions get a UUID on the device that records them. Sync is "upsert by id":
 *   1. A finished session (completed / ended_early / cancelled) is never replaced by an unfinished
 *      copy, whatever the timestamps say. A stale tab cannot reopen a session.
 *   2. Otherwise the copy with the later updatedAt wins.
 *   3. Feedback fields that the winner lacks are filled from the other copy, so a rating entered on
 *      a phone is not lost when a laptop syncs an older copy.
 *   4. A deletion wins over any copy that is not newer than it.
 */
import { z } from "zod";
import { isDateKey, isValidTimeZone } from "./time";
import { LIMITS, SESSION_TYPES, isTerminal, type Session } from "./types";

const STATUS_RANK: Record<string, number> = { completed: 3, ended_early: 2, cancelled: 1 };

function pickWinner(a: Session, b: Session): Session {
  const aT = isTerminal(a.status);
  const bT = isTerminal(b.status);
  if (aT !== bT) return aT ? a : b;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (a.status !== b.status) return (STATUS_RANK[a.status] ?? 0) >= (STATUS_RANK[b.status] ?? 0) ? a : b;
  return a;
}

export function mergeSession(a: Session, b: Session): Session {
  if (a.id !== b.id) throw new Error("mergeSession: ids differ");

  const deleted = [a, b].filter((s) => s.deletedAt != null).sort((x, y) => y.updatedAt - x.updatedAt)[0];
  if (deleted) {
    const other = deleted === a ? b : a;
    if (other.deletedAt != null || deleted.updatedAt >= other.updatedAt) return deleted;
  }

  const winner = pickWinner(a, b);
  const loser = winner === a ? b : a;
  return {
    ...winner,
    focusQuality: winner.focusQuality ?? loser.focusQuality,
    difficulty: winner.difficulty ?? loser.difficulty,
    durationFeedback: winner.durationFeedback ?? loser.durationFeedback,
    distractions: winner.distractions ?? loser.distractions,
    notes: winner.notes ?? loser.notes,
    mockScore: winner.mockScore ?? loser.mockScore,
    mockMaxScore: winner.mockMaxScore ?? loser.mockMaxScore,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

/** Merges two lists by id. */
export function mergeSessions(local: Session[], remote: Session[]): Session[] {
  const map = new Map<string, Session>();
  for (const s of local) map.set(s.id, s);
  for (const s of remote) {
    const existing = map.get(s.id);
    map.set(s.id, existing ? mergeSession(existing, s) : s);
  }
  return [...map.values()];
}

const rating = z.number().int().min(1).max(5).nullable();

/** Wire format accepted by POST /api/sync. Strict: unknown keys are rejected, nothing is coerced. */
export const sessionSchema = z
  .object({
    id: z.uuid(),
    timestamp: z.number().int().positive(),
    tz: z.string().min(1).max(64).refine(isValidTimeZone, "unknown timezone"),
    localDate: z.string().refine(isDateKey, "localDate must be YYYY-MM-DD"),
    phase: z.enum(["focus", "break"]),
    energy: z.number().int().min(1).max(5),
    subject: z.string().max(LIMITS.subjectMax),
    sessionType: z.enum(SESSION_TYPES),
    plannedMinutes: z.number().int().min(1).max(LIMITS.mockMaxMinutes),
    actualSeconds: z.number().int().min(0),
    status: z.enum(["active", "paused", "completed", "ended_early", "cancelled"]),
    focusQuality: rating,
    difficulty: rating,
    durationFeedback: z.enum(["not_sure", "too_short", "about_right", "too_long"]).nullable(),
    distractions: z.number().int().min(0).max(999).nullable(),
    notes: z.string().max(LIMITS.notesMax).nullable(),
    expectedDifficulty: rating,
    topicId: z.string().max(64).nullable(),
    mockScore: z.number().min(0).max(100000).nullable(),
    mockMaxScore: z.number().min(0).max(100000).nullable(),
    createdAt: z.number().int().positive(),
    updatedAt: z.number().int().positive(),
    deletedAt: z.number().int().positive().nullable(),
  })
  .strict();

/** Clock skew tolerated between a device and the server. */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * Integrity rules a session must meet before the server stores it. Returns an error message or null.
 * The same rules exist as CHECK constraints in the database.
 */
export function validateSessionIntegrity(s: Session, serverNow: number): string | null {
  const plannedSeconds = s.plannedMinutes * 60;
  if (s.timestamp > serverNow + MAX_FUTURE_SKEW_MS) return "session starts in the future";
  if (s.actualSeconds > plannedSeconds) return "actualSeconds exceeds the planned duration";
  if (s.status === "completed" && s.actualSeconds < plannedSeconds) {
    return "a completed session must have run for its full planned duration";
  }
  // A session cannot have lasted longer than the wall-clock time since it started.
  if (s.actualSeconds * 1000 > serverNow + MAX_FUTURE_SKEW_MS - s.timestamp) {
    return "actualSeconds exceeds the time elapsed since the session started";
  }
  if (s.phase === "break" && (s.focusQuality != null || s.mockScore != null)) return "breaks cannot carry focus feedback";
  if (s.mockScore != null && s.mockMaxScore != null && s.mockScore > s.mockMaxScore) return "mockScore exceeds mockMaxScore";
  return null;
}
