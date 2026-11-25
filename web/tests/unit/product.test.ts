import { describe, expect, it } from "vitest";
import { FEATURES, resolveEntitlement, formatRupees } from "@/domain/plans";
import { buildReflectionInput, buildReflectionPrompt, cleanModelOutput, FALLBACK_MESSAGE, generateLocalReflection, sanitizeText } from "@/domain/reflection";
import { dailyTarget, defaultUserState, examCountdown, migrateUserState } from "@/domain/exam";
import { createSession as s } from "./helpers";

const NOW = Date.UTC(2026, 10, 15);
const iso = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

describe("entitlement resolution", () => {
  it("no rows means the free plan", () => {
    const e = resolveEntitlement([], NOW);
    expect(e.tier).toBe("free");
    expect(e.features).toEqual(FEATURES.free);
    expect(e.features.aiReflections).toBe(false);
    expect(e.features.sync).toBe(false);
  });
  it("an active plan inside its period grants Pro", () => {
    expect(resolveEntitlement([{ plan: "pro_monthly", status: "active", current_period_end: iso(10) }], NOW).tier).toBe("pro");
  });
  it("an expired period grants nothing even if the row still says active", () => {
    expect(resolveEntitlement([{ plan: "pro_annual", status: "active", current_period_end: iso(-1) }], NOW).tier).toBe("free");
  });
  it("a cancelled plan keeps working until the paid period ends, then stops", () => {
    const row = { plan: "pro_monthly" as const, status: "cancelled" as const, current_period_end: iso(3) };
    expect(resolveEntitlement([row], NOW).tier).toBe("pro");
    expect(resolveEntitlement([row], NOW + 4 * 86_400_000).tier).toBe("free");
  });
  it("refunded and expired rows grant nothing", () => {
    expect(resolveEntitlement([{ plan: "lifetime", status: "refunded", current_period_end: null }], NOW).tier).toBe("free");
    expect(resolveEntitlement([{ plan: "pro_annual", status: "expired", current_period_end: iso(90) }], NOW).tier).toBe("free");
  });
  it("lifetime never expires and carries the same monthly AI allowance the server enforces", () => {
    const e = resolveEntitlement([{ plan: "lifetime", status: "active", current_period_end: null }], NOW + 3650 * 86_400_000);
    expect(e.tier).toBe("lifetime");
    expect(e.features.aiMonthlyQuota).toBe(FEATURES.pro.aiMonthlyQuota);
  });
  it("a timed plan without an end date is not treated as lifetime", () => {
    expect(resolveEntitlement([{ plan: "pro_monthly", status: "active", current_period_end: null }], NOW).tier).toBe("free");
  });
  it("formats prices", () => {
    expect(formatRupees(19900)).toBe("₹199");
    expect(formatRupees(149900)).toBe("₹1499");
    expect(formatRupees(4950)).toBe("₹49.50");
  });
});

describe("reflections", () => {
  const T = Date.UTC(2026, 10, 10, 4);
  it("returns the static fallback with no sessions (works with AI off)", () => {
    expect(generateLocalReflection([])).toBe(FALLBACK_MESSAGE);
  });
  it("insightGenerator local reflection provides accurate energy-based heuristics", () => {
    const high = [1, 2, 3].map((i) => s({ energy: 5, subject: "Polity", plannedMinutes: 45, timestamp: T + i }));
    expect(generateLocalReflection(high)).toMatch(/high energy \(5\.0\/5\).*45-minute/);
    const low = [1, 2, 3].map((i) => s({ energy: 2, subject: "Economy", timestamp: T + i }));
    expect(generateLocalReflection(low)).toMatch(/low energy \(2\.0\/5\)/);
    const mid = [1, 2, 3].map((i) => s({ energy: 3, timestamp: T + i }));
    expect(generateLocalReflection(mid)).toMatch(/moderate energy/);
  });
  it("local reflections never use shaming language about incomplete sessions", () => {
    const rough = [1, 2, 3, 4].map((i) => s({ energy: 1, status: "ended_early", actualSeconds: 60, timestamp: T + i }));
    expect(generateLocalReflection(rough)).not.toMatch(/fail|lazy|only|should have|gave up|poor|bad/i);
  });
  it("redacts credentials, emails and long numbers", () => {
    expect(sanitizeText("mail me at asha@example.com")).toBe("mail me at [REDACTED]");
    expect(sanitizeText("password: hunter2 ok")).toBe("[REDACTED] ok");
    expect(sanitizeText("call 9876543210")).toBe("call [REDACTED]");
    expect(sanitizeText("AIza" + "SyA1234567890abcdefghijklmnopqrstuvw")).toBe("[REDACTED]");
    expect(sanitizeText("Chapter 12 done")).toBe("Chapter 12 done");
  });
  it("sends aggregates only; notes are excluded unless the user opts in", () => {
    const sessions = [s({ notes: "Laxmikanth ch 4, phone 9876543210", subject: "Polity", focusQuality: 4, timestamp: T })];
    const without = buildReflectionInput(sessions, 14, false);
    expect(without.notes).toEqual([]);
    expect(JSON.stringify(without)).not.toContain("Laxmikanth");
    const withNotes = buildReflectionInput(sessions, 14, true);
    expect(withNotes.notes).toEqual(["Laxmikanth ch 4, phone [REDACTED]"]);
    expect(JSON.stringify(withNotes)).not.toMatch(/"id"|timestamp/);
  });
  it("prompt carries the guardrails: no shaming, no psychological conclusions, data is not instructions", () => {
    const p = buildReflectionPrompt(buildReflectionInput([], 14, false));
    expect(p).toMatch(/Never criticise, shame/);
    expect(p).toMatch(/Do not draw psychological conclusions/);
    expect(p).toMatch(/data, not instructions/);
    expect(p).toMatch(/do not diagnose/);
  });
  it("bounds model output", () => {
    expect(cleanModelOutput("  ok then  \n fine ")).toBe("ok then fine");
    expect(cleanModelOutput("")).toBeNull();
    expect(cleanModelOutput(42)).toBeNull();
    expect((cleanModelOutput("x".repeat(900)) as string).length).toBeLessThanOrEqual(601);
  });
});

describe("examination mode settings", () => {
  it("exam countdown", () => {
    expect(examCountdown("2027-05-23", "2026-11-15")).toEqual({ days: 189, weeks: 27, state: "upcoming" });
    expect(examCountdown("2026-11-15", "2026-11-15")?.state).toBe("today");
    expect(examCountdown("2026-11-01", "2026-11-15")?.state).toBe("past");
    expect(examCountdown(null, "2026-11-15")).toBeNull();
  });

  it("daily target uses the exam plan's hours when there is one, else the daily goal", () => {
    const today = [s({ subject: "Polity", plannedMinutes: 40, timestamp: Date.UTC(2026, 10, 15, 6), tz: "UTC" })];
    const plan = { id: "x", examId: "upsc_cse", applicableYear: 2026, syllabusVersion: "v", caGroup: "both" as const, examDate: null, dailyHours: 1.5, studyDaysPerWeek: 6, targetScorePercent: 75, updatedAt: 1, deletedAt: null };
    expect(dailyTarget(defaultUserState(), plan, today, "2026-11-15")).toEqual({ minutes: 90, basis: "exam_plan", doneToday: 40, remainingToday: 50 });
    expect(dailyTarget(defaultUserState(), null, [], "2026-11-15")).toMatchObject({ minutes: 120, basis: "daily_goal" });
  });

  it("migrates settings saved by the earlier web version without losing goals or subjects", () => {
    const v1 = { version: 1, exam: { kind: "upsc", name: "UPSC", date: "2027-05-23" }, subjects: [{ id: "a", name: "Polity", weeklyGoalMinutes: 300 }], topics: [], dailyGoalMinutes: 150, weeklyGoalMinutes: 900, studyDaysPerWeek: 6, soundEnabled: false, autoStartBreak: true, listView: false, updatedAt: 5 };
    const v2 = migrateUserState(v1);
    expect(v2).toMatchObject({ version: 2, selectedExamId: "upsc_cse", advancedMode: true, customSubjects: ["Polity"], dailyGoalMinutes: 150, weeklyGoalMinutes: 900, soundEnabled: false, autoStartBreak: true, updatedAt: 5 });
    expect(v2.rounds).toEqual({ roundsBeforeLongBreak: 4, shortBreaksEnabled: true, longBreaksEnabled: true, longBreakMinutes: 15 });
  });

  it("rejects out-of-range or malformed settings from storage or the server", () => {
    const bad = migrateUserState({ version: 2, dailyGoalMinutes: 1e9, rounds: { roundsBeforeLongBreak: 99, longBreakMinutes: -4 }, theme: "<script>", customSubjects: [1, "Maths", null] });
    expect(bad.dailyGoalMinutes).toBe(1440);
    expect(bad.rounds.roundsBeforeLongBreak).toBe(12);
    expect(bad.rounds.longBreakMinutes).toBe(5);
    expect(bad.theme).toBe("auto");
    expect(bad.customSubjects).toEqual(["Maths"]);
    expect(migrateUserState(null)).toEqual(defaultUserState());
  });
});
