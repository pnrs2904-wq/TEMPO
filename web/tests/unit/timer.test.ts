/** Ports TempoTimerAndSessionTest.kt and CircularCountdownTimerTest.kt, plus refresh/background cases. */
import { describe, expect, it } from "vitest";
import {
  elapsedSeconds, finishTimestamp, formatTimerDisplay, isFinished, pause, progressRatio, remainingSeconds, restore, resume,
  type ActiveTimer,
} from "@/domain/timer";
import { parseSessionPhase, parseSessionStatus, parseSessionType } from "@/domain/types";

const base = (over: Partial<ActiveTimer> = {}): ActiveTimer => ({
  sessionId: "s1", phase: "focus", energy: 3, subject: "Polity", sessionType: "Study",
  plannedSeconds: 1500, accumulatedElapsedMs: 0, runStartTimestamp: 1000, state: "RUNNING", savedTimestamp: 1000, ...over,
});

describe("timer arithmetic", () => {
  it("timer remaining seconds calculation accurately accounts for accumulated elapsed time", () => {
    const t = base({ accumulatedElapsedMs: 300_000, runStartTimestamp: 1000 });
    expect(remainingSeconds(t, 61_000)).toBe(1140);
  });

  it("timer remaining seconds clamps to zero when elapsed exceeds planned", () => {
    expect(remainingSeconds(base({ plannedSeconds: 60 }), 76_000)).toBe(0);
    expect(elapsedSeconds(base({ plannedSeconds: 60 }), 76_000)).toBe(60);
  });

  it("survives a refresh: state rebuilt from storage gives the same remaining time", () => {
    const t = base({ runStartTimestamp: 1_000_000 });
    const beforeRefresh = remainingSeconds(t, 1_000_000 + 400_000);
    const restored = JSON.parse(JSON.stringify(t)) as ActiveTimer; // what localStorage hands back
    expect(remainingSeconds(restored, 1_000_000 + 400_000)).toBe(beforeRefresh);
    expect(restore(restored, 1_000_000 + 400_000)).toEqual({ state: "RUNNING", remainingSeconds: 1100, completedWhileAway: false });
  });

  it("does not drift when the tab is throttled: only timestamps matter, not tick count", () => {
    const t = base({ runStartTimestamp: 0 });
    // One "tick" after 17 minutes in the background.
    expect(remainingSeconds(t, 17 * 60_000)).toBe(8 * 60);
  });

  it("completes while the page is closed", () => {
    const t = base({ runStartTimestamp: 0 });
    expect(isFinished(t, 1500_000)).toBe(true);
    expect(restore(t, 3 * 3600_000)).toEqual({ state: "COMPLETED", remainingSeconds: 0, completedWhileAway: true });
    expect(finishTimestamp(t)).toBe(1500_000);
  });

  it("paused time is not counted, however long the pause lasts", () => {
    let t = base({ runStartTimestamp: 0 });
    t = pause(t, 600_000); // 10 min in
    expect(t.state).toBe("PAUSED");
    expect(remainingSeconds(t, 600_000 + 86_400_000)).toBe(900); // a day later, still 15 min left
    expect(restore(t, 600_000 + 86_400_000).state).toBe("PAUSED");
    t = resume(t, 90_000_000);
    expect(remainingSeconds(t, 90_000_000 + 300_000)).toBe(600);
    expect(finishTimestamp(t)).toBe(90_000_000 + 900_000);
  });

  it("pause and resume are idempotent", () => {
    const running = base();
    expect(resume(running, 5000)).toBe(running);
    const paused = pause(running, 5000);
    expect(pause(paused, 9000)).toBe(paused);
  });

  it("a clock moved backwards never yields negative elapsed time", () => {
    const t = base({ runStartTimestamp: 10_000, accumulatedElapsedMs: 60_000 });
    expect(remainingSeconds(t, 2_000)).toBe(1440);
  });

  it("restore with nothing stored is idle", () => {
    expect(restore(null, 1)).toEqual({ state: "IDLE", remainingSeconds: 0, completedWhileAway: false });
  });
});

describe("display helpers (CircularCountdownTimerTest)", () => {
  it("formatTimerDisplay formats 0 seconds as 00 00", () => expect(formatTimerDisplay(0)).toBe("00:00"));
  it("formatTimerDisplay clamps negative seconds to 00 00", () => expect(formatTimerDisplay(-5)).toBe("00:00"));
  it("formatTimerDisplay formats standard 25 minutes as 25 00", () => expect(formatTimerDisplay(1500)).toBe("25:00"));
  it("formatTimerDisplay formats arbitrary minutes and seconds correctly", () => {
    expect(formatTimerDisplay(65)).toBe("01:05");
    expect(formatTimerDisplay(599)).toBe("09:59");
  });
  it("formatTimerDisplay formats durations an hour or longer with HH MM SS", () => {
    expect(formatTimerDisplay(3600)).toBe("01:00:00");
    expect(formatTimerDisplay(3725)).toBe("01:02:05");
  });
  it("progress ratio correctly computes elapsed percentage within bounds", () => {
    expect(progressRatio(1500, 1500)).toBe(0);
    expect(progressRatio(1500, 750)).toBe(0.5);
    expect(progressRatio(1500, 0)).toBe(1);
    expect(progressRatio(0, 0)).toBe(0);
    expect(progressRatio(100, 500)).toBe(0);
  });
});

describe("enum parsing (ProductionHardeningTest)", () => {
  it("sessionStatus fromString correctly maps all known statuses", () => {
    for (const v of ["active", "paused", "completed", "ended_early", "cancelled"]) expect(parseSessionStatus(v)).toBe(v);
    expect(parseSessionStatus("COMPLETED")).toBe("completed");
  });
  it("sessionStatus fromString returns UNKNOWN for corrupted or invalid values and NEVER COMPLETED", () => {
    for (const v of ["", "done", "complete", "finished", null, undefined, 7, "ended"]) {
      expect(parseSessionStatus(v)).toBe("unknown");
    }
  });
  it("session types parse correctly and default safely", () => {
    expect(parseSessionType("study")).toBe("Study");
    expect(parseSessionType("revision")).toBe("Revision");
    expect(parseSessionType("practice questions")).toBe("Practice Questions");
    expect(parseSessionType("MOCK_TEST")).toBe("Mock Test");
    expect(parseSessionType("unknown_type")).toBe("Study");
  });
  it("session phase enum values are distinct and identifiable", () => {
    expect(parseSessionPhase("focus")).toBe("focus");
    expect(parseSessionPhase("BREAK")).toBe("break");
    expect(parseSessionPhase("???")).toBe("focus");
  });
});
