/**
 * User settings and exam-mode helpers (Tempo 3.0).
 *
 * Examinations come from the shared Android registry (domain/exams.ts); per-exam plans, topics,
 * revisions and mocks are separate synced records (domain/prep/types.ts). This document holds only
 * preferences, so it stays small.
 */
import { focusSeconds, toMinutes } from "./analytics";
import { DEFAULT_ROUND_SETTINGS, type RoundSettings } from "./timer/rounds";
import { daysBetween, type DateKey } from "./time";
import type { Session } from "./types";
import type { ExamPlan } from "./prep/types";

export type ThemeId = "auto" | "paper" | "night" | "contrast";

export interface UserState {
  version: 2;
  /** Registry examId, or null in Simple Mode. */
  selectedExamId: string | null;
  advancedMode: boolean;
  /** Extra subjects for the timer, beyond the selected exam's syllabus. */
  customSubjects: string[];
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  soundEnabled: boolean;
  /** Start the break automatically after focus feedback (Tempo). */
  autoStartBreak: boolean;
  /** Start the next focus round automatically when a break ends (Pomotroid). */
  autoStartFocus: boolean;
  listView: boolean;
  rounds: RoundSettings;
  /** Pomotroid tick sounds, separately for focus and breaks. */
  tickFocus: boolean;
  tickBreak: boolean;
  volume: number;
  theme: ThemeId;
  updatedAt: number;
}

/** Defaults match Android UserSettings (120 min daily, 600 min weekly, sound on, auto-break off). */
export function defaultUserState(): UserState {
  return {
    version: 2, selectedExamId: null, advancedMode: false, customSubjects: [],
    dailyGoalMinutes: 120, weeklyGoalMinutes: 600, soundEnabled: true, autoStartBreak: false, autoStartFocus: false, listView: false,
    rounds: { ...DEFAULT_ROUND_SETTINGS }, tickFocus: false, tickBreak: false, volume: 70, theme: "auto", updatedAt: 0,
  };
}

const V1_EXAM_IDS: Record<string, string> = { upsc: "upsc_cse", state_psc: "state_psc", ssc: "ssc_cgl", banking: "banking", gate: "gate", university: "university", custom: "custom" };

/** Accepts anything read from storage or the server and returns a valid v2 state. */
export function migrateUserState(raw: unknown): UserState {
  const base = defaultUserState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  if (r.version === 1) {
    const exam = r.exam as { kind?: string } | null;
    const subjects = Array.isArray(r.subjects) ? (r.subjects as { name?: unknown }[]).map((s) => String(s.name ?? "")).filter(Boolean) : [];
    return {
      ...base,
      selectedExamId: exam?.kind ? V1_EXAM_IDS[exam.kind] ?? null : null,
      advancedMode: Boolean(exam),
      customSubjects: subjects.slice(0, 40),
      dailyGoalMinutes: num(r.dailyGoalMinutes, base.dailyGoalMinutes, 0, 1440),
      weeklyGoalMinutes: num(r.weeklyGoalMinutes, base.weeklyGoalMinutes, 0, 10080),
      soundEnabled: r.soundEnabled !== false,
      autoStartBreak: r.autoStartBreak === true,
      listView: r.listView === true,
      updatedAt: num(r.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
    };
  }
  const rounds = (r.rounds ?? {}) as Partial<RoundSettings>;
  return {
    ...base,
    selectedExamId: typeof r.selectedExamId === "string" ? r.selectedExamId : null,
    advancedMode: r.advancedMode === true,
    customSubjects: Array.isArray(r.customSubjects) ? r.customSubjects.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 60)).slice(0, 40) : [],
    dailyGoalMinutes: num(r.dailyGoalMinutes, base.dailyGoalMinutes, 0, 1440),
    weeklyGoalMinutes: num(r.weeklyGoalMinutes, base.weeklyGoalMinutes, 0, 10080),
    soundEnabled: r.soundEnabled !== false,
    autoStartBreak: r.autoStartBreak === true,
    autoStartFocus: r.autoStartFocus === true,
    listView: r.listView === true,
    rounds: {
      roundsBeforeLongBreak: num(rounds.roundsBeforeLongBreak, 4, 1, 12),
      shortBreaksEnabled: rounds.shortBreaksEnabled !== false,
      longBreaksEnabled: rounds.longBreaksEnabled !== false,
      longBreakMinutes: num(rounds.longBreakMinutes, 15, 5, 60),
    },
    tickFocus: r.tickFocus === true,
    tickBreak: r.tickBreak === true,
    volume: num(r.volume, 70, 0, 100),
    theme: (["auto", "paper", "night", "contrast"] as const).includes(r.theme as ThemeId) ? (r.theme as ThemeId) : "auto",
    updatedAt: num(r.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function num(v: unknown, fallback: number, lo: number, hi: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
}

export interface Countdown { days: number; weeks: number; state: "upcoming" | "today" | "past" }

export function examCountdown(examDate: DateKey | null, today: DateKey): Countdown | null {
  if (!examDate) return null;
  const days = daysBetween(today, examDate);
  return { days, weeks: Math.floor(Math.max(0, days) / 7), state: days > 0 ? "upcoming" : days === 0 ? "today" : "past" };
}

export interface DailyTarget { minutes: number; basis: "exam_plan" | "daily_goal"; remainingToday: number; doneToday: number }

/** Today's study target: the exam plan's daily hours when one is set, otherwise the daily goal. */
export function dailyTarget(state: UserState, plan: ExamPlan | null, sessions: Session[], today: DateKey): DailyTarget {
  const minutes = plan ? Math.round(plan.dailyHours * 60) : state.dailyGoalMinutes;
  const doneToday = toMinutes(focusSeconds(sessions.filter((s) => s.localDate === today)));
  return { minutes, basis: plan ? "exam_plan" : "daily_goal", doneToday, remainingToday: Math.max(0, minutes - doneToday) };
}
