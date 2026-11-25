/**
 * Web records <-> the sync wire format shared with Android (see src/lib/server/wire.mjs).
 *
 * The web keeps calendar days as YYYY-MM-DD keys and a few names of its own; the wire uses
 * epoch days and the Android names. Everything else is identical.
 */
import { mockSchema, PREP_TABLES, type PrepEnvelope, type PrepTable } from "@/domain/prep/types";
import { localDateKey } from "@/domain/time";
import { sessionSchema } from "@/domain/sync";
import { parseDurationFeedback, parseSessionPhase, parseSessionStatus, parseSessionType, type Session } from "@/domain/types";

const DAY_MS = 86_400_000;
export const dateKeyToEpochDay = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
export const epochDayToDateKey = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const dayOrNull = (key: string | null) => (key ? dateKeyToEpochDay(key) : null);
const keyOrNull = (day: unknown) => (day === null || day === undefined || day === "" ? null : epochDayToDateKey(Number(day)));

/** Web table name -> server table name. */
export const WIRE_TABLE: Record<PrepTable, string> = {
  exam_plans: "user_exam_plans",
  topic_progress: "user_topic_progress",
  revision_events: "revision_events",
  mock_tests: "mock_tests",
  question_attempts: "question_attempts",
};
const WEB_TABLE = Object.fromEntries(Object.entries(WIRE_TABLE).map(([w, s]) => [s, w])) as Record<string, PrepTable>;

type Row = Record<string, unknown>;

export function sessionToWire(s: Session): Row {
  return {
    id: s.id, timestamp: s.timestamp, startedAt: s.timestamp, phase: s.phase, energy: s.energy, subject: s.subject, sessionType: s.sessionType,
    plannedMinutes: s.plannedMinutes, actualSeconds: s.actualSeconds,
    // The server accepts the five real states; "unknown" only exists for unreadable local rows.
    status: s.status === "unknown" ? "cancelled" : s.status,
    focusQuality: s.focusQuality, difficulty: s.difficulty, durationFeedback: s.durationFeedback, distractions: s.distractions, notes: s.notes,
    createdAt: s.createdAt, updatedAt: s.updatedAt, deletedAt: s.deletedAt,
    tz: s.tz, localDate: s.localDate, expectedDifficulty: s.expectedDifficulty, topicId: s.topicId, mockScore: s.mockScore, mockMaxScore: s.mockMaxScore,
  };
}

/** A pulled session (possibly recorded on Android, without tz/localDate) -> web session, or null if unfit. */
export function sessionFromWire(r: Row, deviceTz: string): Session | null {
  const timestamp = Number(r.timestamp ?? r.startedAt);
  if (typeof r.id !== "string" || !Number.isFinite(timestamp)) return null;
  const tz = typeof r.tz === "string" && r.tz ? r.tz : deviceTz;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const status = parseSessionStatus(r.status);
  const candidate = {
    id: r.id, timestamp, tz,
    localDate: typeof r.localDate === "string" && r.localDate ? r.localDate : localDateKey(timestamp, tz),
    phase: parseSessionPhase(r.phase), energy: Number(r.energy), subject: String(r.subject ?? ""), sessionType: parseSessionType(r.sessionType),
    plannedMinutes: Number(r.plannedMinutes), actualSeconds: Number(r.actualSeconds),
    status: status === "unknown" ? "cancelled" : status,
    focusQuality: num(r.focusQuality), difficulty: num(r.difficulty), durationFeedback: parseDurationFeedback(r.durationFeedback),
    distractions: num(r.distractions), notes: typeof r.notes === "string" ? r.notes : null,
    expectedDifficulty: num(r.expectedDifficulty), topicId: typeof r.topicId === "string" ? r.topicId : null,
    mockScore: num(r.mockScore), mockMaxScore: num(r.mockMaxScore),
    createdAt: Number(r.createdAt ?? timestamp) || timestamp, updatedAt: Number(r.updatedAt), deletedAt: num(r.deletedAt),
  };
  const parsed = sessionSchema.safeParse(candidate);
  return parsed.success ? (parsed.data as Session) : null;
}

export function prepToWire(e: PrepEnvelope): { table: string; row: Row } {
  const r = e.row as unknown as Row;
  const base = { ...r };
  switch (e.table) {
    case "exam_plans": {
      const { caGroup, examDate, ...rest } = base;
      return { table: WIRE_TABLE.exam_plans, row: { ...rest, selectedCaGroup: caGroup, examDateEpochDay: dayOrNull(examDate as string | null) } };
    }
    case "topic_progress": {
      const { lastStudiedDate, nextRevisionDate, ...rest } = base;
      return { table: WIRE_TABLE.topic_progress, row: { ...rest, lastStudiedEpochDay: dayOrNull(lastStudiedDate as string | null), nextRevisionEpochDay: dayOrNull(nextRevisionDate as string | null) } };
    }
    case "revision_events": {
      const { revisionDate, nextRevisionDate, ...rest } = base;
      const day = dateKeyToEpochDay(revisionDate as string);
      return { table: WIRE_TABLE.revision_events, row: { ...rest, revisionEpochDay: day, revisionTimestamp: day * DAY_MS + 12 * 3_600_000, nextRevisionEpochDay: dateKeyToEpochDay(nextRevisionDate as string) } };
    }
    default:
      return { table: WIRE_TABLE[e.table], row: base };
  }
}

/**
 * A pulled envelope -> web envelope, or null if it does not fit the web's schema (for example a
 * revision method the web does not offer yet). Unfit records stay on the server untouched.
 */
export function prepFromWire(e: { table: string; row: Row }): PrepEnvelope | null {
  const table = WEB_TABLE[e.table];
  if (!table) return null;
  const r: Row = { ...e.row };
  delete r.rev;
  r.updatedAt = Number(r.updatedAt);
  r.deletedAt = r.deletedAt === null || r.deletedAt === undefined ? null : Number(r.deletedAt);
  let row: Row;
  switch (table) {
    case "exam_plans": {
      const { selectedCaGroup, examDateEpochDay, ...rest } = r;
      row = { ...rest, caGroup: selectedCaGroup ?? "both", examDate: keyOrNull(examDateEpochDay) };
      break;
    }
    case "topic_progress": {
      const { lastStudiedEpochDay, nextRevisionEpochDay, ...rest } = r;
      row = { ...rest, unit: rest.unit ?? "", chapter: rest.chapter ?? "", subtopics: rest.subtopics ?? "", lastStudiedDate: keyOrNull(lastStudiedEpochDay), nextRevisionDate: keyOrNull(nextRevisionEpochDay) };
      break;
    }
    case "revision_events": {
      const { revisionEpochDay, nextRevisionEpochDay, revisionTimestamp: _t, ...rest } = r;
      row = { ...rest, revisionDate: keyOrNull(revisionEpochDay), nextRevisionDate: keyOrNull(nextRevisionEpochDay), difficulty: rest.difficulty ?? 3 };
      break;
    }
    case "mock_tests":
      row = { ...r, scoringMode: r.scoringMode ?? "PER_QUESTION", positiveMarksPerQ: r.positiveMarksPerQ ?? 0, negativeMarksPerQ: r.negativeMarksPerQ ?? 0, avgSecondsPerQuestion: r.avgSecondsPerQuestion ?? 0, isQuickEntry: r.isQuickEntry ?? true };
      break;
    default:
      row = r;
  }
  const schema = table === "mock_tests" ? mockSchema : PREP_TABLES[table];
  const parsed = schema.safeParse(row);
  return parsed.success ? ({ table, row: parsed.data } as PrepEnvelope) : null;
}
