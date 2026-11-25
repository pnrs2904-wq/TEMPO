/**
 * The web client and the server share one wire format with Android. These tests pin:
 *   - prices shown on the website equal the server's authoritative prices;
 *   - every web record survives web -> wire -> server row -> wire -> web unchanged;
 *   - Android-shaped rows (no tz/localDate, epoch days) become valid web records.
 */
import { describe, expect, it } from "vitest";
import { PLANS } from "@/domain/plans";
import type { PrepEnvelope } from "@/domain/prep/types";
import type { Session } from "@/domain/types";
import { SERVER_PRICES } from "@/lib/server/config.mjs";
import { dbToWire, wireToDb } from "@/lib/server/wire.mjs";
import { dateKeyToEpochDay, epochDayToDateKey, prepFromWire, prepToWire, sessionFromWire, sessionToWire, WIRE_TABLE } from "@/lib/client/wire";

const NOW = 1_764_000_000_000;
const id = () => crypto.randomUUID();

/** Simulates Postgres: wireToDb, then values come back as the database returns them (ISO times). */
function throughServer(table: string, row: Record<string, unknown>) {
  const db = wireToDb(table, row, "user-1");
  return dbToWire(table, { ...db, rev: 7 });
}

describe("prices", () => {
  it("the website shows exactly the server's prices", () => {
    for (const p of ["pro_monthly", "pro_annual", "lifetime"] as const) expect(PLANS[p].defaultPaise).toBe(SERVER_PRICES[p].amountPaise);
  });
});

describe("epoch days", () => {
  it("convert both ways, including around midnight IST", () => {
    expect(dateKeyToEpochDay("1970-01-01")).toBe(0);
    expect(dateKeyToEpochDay("2026-11-25")).toBe(20782);
    for (const k of ["2024-02-29", "2026-11-25", "2027-03-31"]) expect(epochDayToDateKey(dateKeyToEpochDay(k))).toBe(k);
  });
});

describe("sessions", () => {
  const web: Session = {
    id: id(), timestamp: NOW - 3_600_000, tz: "Asia/Kolkata", localDate: "2025-11-24", phase: "focus", energy: 4, subject: "Polity", sessionType: "Revision",
    plannedMinutes: 45, actualSeconds: 2700, status: "completed", focusQuality: 4, difficulty: 3, durationFeedback: "about_right", distractions: 1,
    notes: "Preamble", expectedDifficulty: 3, topicId: id(), mockScore: null, mockMaxScore: null, createdAt: NOW - 3_600_000, updatedAt: NOW - 60_000, deletedAt: null,
  };
  it("round-trip unchanged", () => {
    expect(sessionFromWire(throughServer("sessions", sessionToWire(web)), "UTC")).toEqual(web);
  });
  it("an Android session gets the device time zone and its local day", () => {
    const android = { id: id(), localId: 3, timestamp: Date.UTC(2026, 10, 24, 20, 0), phase: "focus", energy: 3, subject: "Maths", sessionType: "Study", plannedMinutes: 30,
      actualSeconds: 1800, status: "completed", createdAt: NOW, updatedAt: NOW, deletedAt: null };
    const s = sessionFromWire(throughServer("sessions", android), "Asia/Kolkata");
    expect(s?.tz).toBe("Asia/Kolkata");
    expect(s?.localDate).toBe("2026-11-25"); // 20:00 UTC = 01:30 IST next day
  });
  it("a corrupt pulled row is skipped, not crashed on", () => {
    expect(sessionFromWire({ id: id(), timestamp: NOW, energy: 9 }, "UTC")).toBeNull();
  });
});

describe("exam prep", () => {
  const topicId = id();
  const mockId = id();
  const meta = { examId: "upsc_cse", updatedAt: NOW, deletedAt: null };
  const records: PrepEnvelope[] = [
    { table: "exam_plans", row: { id: id(), ...meta, applicableYear: 2026, syllabusVersion: "2026.1", caGroup: "both", examDate: "2026-05-24", dailyHours: 6, studyDaysPerWeek: 6, targetScorePercent: 70 } },
    { table: "topic_progress", row: { id: topicId, ...meta, syllabusVersion: "2026.1", subject: "Polity", unit: "", chapter: "Constitution", topicName: "Preamble", subtopics: "",
      status: "learning", difficulty: "high", ncertCompleted: true, formulaRevisionDone: false, diagramRevisionDone: false, rtpMtpCompleted: false, revisionCount: 1,
      lastStudiedDate: "2026-11-20", nextRevisionDate: null, isCustom: false } },
    { table: "revision_events", row: { id: id(), ...meta, topicId, topicName: "Preamble", subject: "Polity", revisionDate: "2026-11-20", revisionNumber: 1, recallRating: 4,
      accuracyPercent: null, difficulty: 3, nextRevisionDate: "2026-11-23", method: "active_recall", notes: null } },
    { table: "mock_tests", row: { id: mockId, ...meta, attemptYear: 2026, mockName: "CA paper 1", dateTimestamp: NOW, scoringMode: "MARKS_ENTRY", totalQuestions: 0,
      attemptedQuestions: 0, correctAnswers: 0, incorrectAnswers: 0, unansweredQuestions: 0, positiveMarksPerQ: 0, negativeMarksPerQ: 0, totalScore: 62, maxMarks: 100,
      percentage: 62, accuracyPercent: 0, durationMinutes: 180, avgSecondsPerQuestion: 0, weakestSubject: null, weakestSubjectAccuracy: null, isQuickEntry: true, notes: null } },
    { table: "question_attempts", row: { id: id(), ...meta, mockTestId: mockId, questionNumber: 4, subject: "Polity", topicName: "Preamble", difficulty: "moderate",
      selectedAnswer: null, correctAnswer: "C", isCorrect: false, timeSpentSeconds: 90, errorCategory: "misreading" } },
  ];
  it.each(records.map((r) => [r.table, r] as const))("%s round-trips unchanged", (_t, rec) => {
    const wire = prepToWire(rec);
    expect(wire.table).toBe(WIRE_TABLE[rec.table]);
    expect(prepFromWire({ table: wire.table, row: throughServer(wire.table, wire.row) })).toEqual(rec);
  });
  it("an Android topic with epoch days becomes a web topic with dates", () => {
    const back = prepFromWire({ table: "user_topic_progress", row: throughServer("user_topic_progress", {
      id: id(), examId: "neet_ug", syllabusVersion: "1", subject: "Physics", unit: "M", chapter: "K", topicName: "Projectile", subtopics: "", status: "completed",
      difficulty: "high", ncertCompleted: true, formulaRevisionDone: false, diagramRevisionDone: false, rtpMtpCompleted: false, revisionCount: 1,
      lastStudiedEpochDay: 20416, nextRevisionEpochDay: 20419, isCustom: false, updatedAt: NOW, deletedAt: null }) });
    expect(back?.table).toBe("topic_progress");
    expect(back?.row).toMatchObject({ lastStudiedDate: "2025-11-24", nextRevisionDate: "2025-11-27" });
  });
});
