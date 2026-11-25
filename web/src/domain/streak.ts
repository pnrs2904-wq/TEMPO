/** Ported from Android domain/StreakCalculator.kt. Uses each session's own stored calendar day. */
import { addDays, type DateKey } from "./time";
import type { Session } from "./types";

export interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  totalActiveDays: number;
  hasSessionToday: boolean;
}

export function calculateStreak(sessions: Session[], today: DateKey): StreakInfo {
  // Only completed focus sessions count toward the study streak.
  const dates = new Set(
    sessions.filter((s) => !s.deletedAt && s.phase === "focus" && s.status === "completed").map((s) => s.localDate),
  );
  if (dates.size === 0) return { currentStreak: 0, bestStreak: 0, totalActiveDays: 0, hasSessionToday: false };

  const hasToday = dates.has(today);
  const yesterday = addDays(today, -1);
  let currentStreak = 0;
  let check: DateKey | null = hasToday ? today : dates.has(yesterday) ? yesterday : null;
  while (check && dates.has(check)) {
    currentStreak++;
    check = addDays(check, -1);
  }

  let bestStreak = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const d of [...dates].sort()) {
    run = prev !== null && d === addDays(prev, 1) ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
    prev = d;
  }
  return { currentStreak, bestStreak, totalActiveDays: dates.size, hasSessionToday: hasToday };
}
