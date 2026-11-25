/**
 * Timer arithmetic. Ported from TempoViewModel.kt (startTicker, pauseSession, resumeSession,
 * restoreActiveSession). The timer never counts ticks: remaining time is always derived from
 * wall-clock timestamps, so a refresh, a backgrounded tab or a throttled interval cannot drift it.
 */
import type { SessionPhase, SessionType } from "./types";

export type TimerState = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "ENDED_EARLY";

/** Persisted for the session in progress (Android: ActiveSessionState). */
export interface ActiveTimer {
  sessionId: string;
  phase: SessionPhase;
  energy: number;
  subject: string;
  sessionType: SessionType;
  plannedSeconds: number;
  /** Milliseconds accumulated in earlier run segments (before the last pause). */
  accumulatedElapsedMs: number;
  /** Wall-clock start of the current run segment. */
  runStartTimestamp: number;
  state: "RUNNING" | "PAUSED";
  savedTimestamp: number;
}

export function totalElapsedMs(t: ActiveTimer, now: number): number {
  if (t.state === "PAUSED") return t.accumulatedElapsedMs;
  // coerceAtLeast(0): a clock moved backwards must not produce negative elapsed time.
  return t.accumulatedElapsedMs + Math.max(0, now - t.runStartTimestamp);
}

export function elapsedSeconds(t: ActiveTimer, now: number): number {
  return Math.min(t.plannedSeconds, Math.floor(totalElapsedMs(t, now) / 1000));
}

export function remainingSeconds(t: ActiveTimer, now: number): number {
  return Math.max(0, t.plannedSeconds - Math.floor(totalElapsedMs(t, now) / 1000));
}

export function isFinished(t: ActiveTimer, now: number): boolean {
  return t.state === "RUNNING" && remainingSeconds(t, now) <= 0;
}

export function pause(t: ActiveTimer, now: number): ActiveTimer {
  if (t.state !== "RUNNING") return t;
  return { ...t, state: "PAUSED", accumulatedElapsedMs: totalElapsedMs(t, now), savedTimestamp: now };
}

export function resume(t: ActiveTimer, now: number): ActiveTimer {
  if (t.state !== "PAUSED") return t;
  return { ...t, state: "RUNNING", runStartTimestamp: now, savedTimestamp: now };
}

/** Wall-clock moment a running timer reaches zero. */
export function finishTimestamp(t: ActiveTimer): number {
  return t.runStartTimestamp + Math.max(0, t.plannedSeconds * 1000 - t.accumulatedElapsedMs);
}

export interface RestoreResult {
  state: TimerState;
  remainingSeconds: number;
  /** True when the countdown reached zero while the page was closed or in the background. */
  completedWhileAway: boolean;
}

/** What to show when the page loads and finds a persisted timer. */
export function restore(t: ActiveTimer | null, now: number): RestoreResult {
  if (!t) return { state: "IDLE", remainingSeconds: 0, completedWhileAway: false };
  const remaining = remainingSeconds(t, now);
  if (t.state === "RUNNING" && remaining <= 0) {
    return { state: "COMPLETED", remainingSeconds: 0, completedWhileAway: true };
  }
  return { state: t.state, remainingSeconds: remaining, completedWhileAway: false };
}

/** Ported from CircularCountdownTimer.formatTimerDisplay. */
export function formatTimerDisplay(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function progressRatio(plannedSeconds: number, remaining: number): number {
  if (plannedSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, (plannedSeconds - remaining) / plannedSeconds));
}
