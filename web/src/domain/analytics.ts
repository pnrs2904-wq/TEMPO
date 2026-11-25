/**
 * Personal analytics. Pure functions over the session list.
 *
 * Counting rules (the acceptance tests in tests/unit/analytics.test.ts pin these):
 *   - "Completed" means status === "completed" and nothing else. Ended-early, cancelled, paused,
 *     active and unknown sessions are never counted as completed.
 *   - Focus time is the time actually spent (actualSeconds) in completed and ended-early focus
 *     sessions. Android counted only completed sessions; here a session stopped at minute 20 of 25
 *     still shows 20 minutes of study, while the completion rate reports it honestly as not completed.
 *   - Cancelled sessions and breaks never add focus time.
 */
import { addDays, dateRange, weekStart, zonedParts, type DateKey } from "./time";
import type { DurationFeedback, Session, SessionType } from "./types";

const live = (s: Session) => !s.deletedAt && s.phase === "focus";
export const isCompleted = (s: Session) => live(s) && s.status === "completed";
export const isEndedEarly = (s: Session) => live(s) && s.status === "ended_early";
/** Sessions that contribute study time. */
export const countsTowardFocusTime = (s: Session) => isCompleted(s) || isEndedEarly(s);

export function focusSeconds(sessions: Session[]): number {
  return sessions.filter(countsTowardFocusTime).reduce((sum, s) => sum + Math.max(0, s.actualSeconds), 0);
}

export const toMinutes = (seconds: number) => Math.floor(seconds / 60);

export function focusMinutesOn(sessions: Session[], day: DateKey): number {
  return toMinutes(focusSeconds(sessions.filter((s) => s.localDate === day)));
}

export function focusMinutesInWeekOf(sessions: Session[], day: DateKey): number {
  const start = weekStart(day);
  const end = addDays(start, 6);
  return toMinutes(focusSeconds(sessions.filter((s) => s.localDate >= start && s.localDate <= end)));
}

export interface DayPoint {
  date: DateKey;
  minutes: number;
  completed: number;
  endedEarly: number;
}

export function dailySeries(sessions: Session[], from: DateKey, to: DateKey): DayPoint[] {
  const byDay = new Map<DateKey, Session[]>();
  for (const s of sessions) {
    if (!live(s)) continue;
    const list = byDay.get(s.localDate);
    if (list) list.push(s);
    else byDay.set(s.localDate, [s]);
  }
  return dateRange(from, to).map((date) => {
    const list = byDay.get(date) ?? [];
    return {
      date,
      minutes: toMinutes(focusSeconds(list)),
      completed: list.filter(isCompleted).length,
      endedEarly: list.filter(isEndedEarly).length,
    };
  });
}

export interface WeekPoint {
  weekStart: DateKey;
  minutes: number;
  activeDays: number;
}

/** Weekly focus time and number of days studied: the consistency trend. */
export function weeklySeries(sessions: Session[], today: DateKey, weeks: number): WeekPoint[] {
  const out: WeekPoint[] = [];
  const thisWeek = weekStart(today);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 6);
    const inWeek = sessions.filter((s) => s.localDate >= start && s.localDate <= end);
    out.push({
      weekStart: start,
      minutes: toMinutes(focusSeconds(inWeek)),
      activeDays: new Set(inWeek.filter(countsTowardFocusTime).map((s) => s.localDate)).size,
    });
  }
  return out;
}

export interface CompletionStats {
  completed: number;
  endedEarly: number;
  /** completed / (completed + endedEarly); null when there is nothing to measure. */
  rate: number | null;
}

export function completionStats(sessions: Session[]): CompletionStats {
  const completed = sessions.filter(isCompleted).length;
  const endedEarly = sessions.filter(isEndedEarly).length;
  const total = completed + endedEarly;
  return { completed, endedEarly, rate: total === 0 ? null : completed / total };
}

/** Mean length of completed focus sessions, in minutes. */
export function averageSessionMinutes(sessions: Session[]): number | null {
  const done = sessions.filter(isCompleted);
  if (done.length === 0) return null;
  return Math.round(done.reduce((a, s) => a + s.actualSeconds, 0) / done.length / 60);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface SubjectStats {
  subject: string;
  minutes: number;
  sessions: number;
  completionRate: number | null;
  avgFocusQuality: number | null;
  avgDifficulty: number | null;
}

export function subjectPerformance(sessions: Session[]): SubjectStats[] {
  const groups = new Map<string, { name: string; list: Session[] }>();
  for (const s of sessions) {
    if (!live(s) || !(isCompleted(s) || isEndedEarly(s))) continue;
    const name = s.subject.trim() || "General";
    const key = name.toLowerCase();
    const g = groups.get(key);
    if (g) g.list.push(s);
    else groups.set(key, { name, list: [s] });
  }
  return [...groups.values()]
    .map(({ name, list }) => ({
      subject: name,
      minutes: toMinutes(focusSeconds(list)),
      sessions: list.length,
      completionRate: completionStats(list).rate,
      avgFocusQuality: mean(list.filter((s) => s.focusQuality != null).map((s) => s.focusQuality as number)),
      avgDifficulty: mean(list.filter((s) => s.difficulty != null).map((s) => s.difficulty as number)),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

export interface EnergyQualityPoint {
  energy: number;
  avgFocusQuality: number | null;
  rated: number;
  sessions: number;
  completionRate: number | null;
}

export function energyVsFocusQuality(sessions: Session[]): EnergyQualityPoint[] {
  return [1, 2, 3, 4, 5].map((energy) => {
    const list = sessions.filter((s) => live(s) && s.energy === energy && (isCompleted(s) || isEndedEarly(s)));
    const rated = list.filter((s) => s.focusQuality != null);
    return {
      energy,
      avgFocusQuality: mean(rated.map((s) => s.focusQuality as number)),
      rated: rated.length,
      sessions: list.length,
      completionRate: completionStats(list).rate,
    };
  });
}

export const DAY_PARTS = ["Early (5-9)", "Morning (9-13)", "Afternoon (13-17)", "Evening (17-21)", "Night (21-5)"] as const;

export function dayPartIndex(hour: number): number {
  if (hour >= 5 && hour < 9) return 0;
  if (hour >= 9 && hour < 13) return 1;
  if (hour >= 13 && hour < 17) return 2;
  if (hour >= 17 && hour < 21) return 3;
  return 4;
}

export interface DayPartStats {
  part: string;
  minutes: number;
  sessions: number;
  avgFocusQuality: number | null;
}

/** Historical pattern: when in the day study happens and how it felt. */
export function dayPartPattern(sessions: Session[]): DayPartStats[] {
  const buckets: Session[][] = DAY_PARTS.map(() => []);
  for (const s of sessions) {
    if (!countsTowardFocusTime(s)) continue;
    buckets[dayPartIndex(zonedParts(s.timestamp, s.tz).hour)].push(s);
  }
  return buckets.map((list, i) => ({
    part: DAY_PARTS[i],
    minutes: toMinutes(focusSeconds(list)),
    sessions: list.length,
    avgFocusQuality: mean(list.filter((s) => s.focusQuality != null).map((s) => s.focusQuality as number)),
  }));
}

export function durationFeedbackDistribution(sessions: Session[]): Record<DurationFeedback, number> {
  const out: Record<DurationFeedback, number> = { not_sure: 0, too_short: 0, about_right: 0, too_long: 0 };
  for (const s of sessions) if (isCompleted(s) && s.durationFeedback) out[s.durationFeedback]++;
  return out;
}

export function distractionsBySessionType(sessions: Session[]): { type: SessionType; avg: number | null; n: number }[] {
  const types: SessionType[] = ["Study", "Revision", "Practice Questions", "Mock Test"];
  return types.map((type) => {
    const xs = sessions.filter((s) => live(s) && s.sessionType === type && s.distractions != null).map((s) => s.distractions as number);
    return { type, avg: mean(xs), n: xs.length };
  });
}

export interface MockPoint {
  id: string;
  date: DateKey;
  subject: string;
  score: number;
  maxScore: number;
  percent: number;
}

export function mockTestTrend(sessions: Session[]): MockPoint[] {
  return sessions
    .filter((s) => !s.deletedAt && s.sessionType === "Mock Test" && s.mockScore != null && s.mockMaxScore != null && s.mockMaxScore > 0)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((s) => ({
      id: s.id,
      date: s.localDate,
      subject: s.subject || "General",
      score: s.mockScore as number,
      maxScore: s.mockMaxScore as number,
      percent: Math.round(((s.mockScore as number) / (s.mockMaxScore as number)) * 1000) / 10,
    }));
}
