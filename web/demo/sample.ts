/** Four weeks of invented study history, so the rings and charts have something to show. */
import { defaultUserState, type UserState } from "@/domain/exam";
import { deviceTimeZone, localDateKey } from "@/domain/time";
import type { DurationFeedback, Session } from "@/domain/types";

export function sampleData(now: number): { sessions: Session[]; state: UserState } {
  const tz = deviceTimeZone();
  const subjects = ["Polity", "Economy", "History", "Geography", "CSAT"];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sessions: Session[] = [];
  const make = (ts: number, over: Partial<Session>): Session => ({
    id: crypto.randomUUID(), timestamp: Math.round(ts), tz, localDate: localDateKey(ts, tz), phase: "focus", energy: 3, subject: "",
    sessionType: "Study", plannedMinutes: 25, actualSeconds: 1500, status: "completed", focusQuality: null, difficulty: null,
    durationFeedback: null, distractions: null, notes: null, expectedDifficulty: null, topicId: null, mockScore: null, mockMaxScore: null,
    createdAt: Math.round(ts), updatedAt: Math.round(ts), deletedAt: null, ...over,
  });
  for (let d = 27; d >= 0; d--) {
    if (d % 7 === 3 && d !== 0) continue; // one rest day a week
    const midnight = new Date(now - d * 86_400_000);
    midnight.setHours(0, 0, 0, 0);
    for (const [hour, energy] of [[6.5, 4], [7.5, 4], [10, 3], [15, 2], [19, 3], [20, 3]] as const) {
      if (rnd() <= 0.3) continue;
      const ts = midnight.getTime() + (hour + rnd() * 0.4) * 3_600_000;
      const planned = [15, 20, 25, 35, 45][Math.min(4, energy - 1 + (rnd() > 0.7 ? 1 : 0))];
      if (ts + planned * 60_000 > now - 600_000) continue;
      const subject = subjects[Math.floor(rnd() * subjects.length)];
      const early = rnd() < 0.15;
      sessions.push(make(ts, {
        energy, subject, sessionType: rnd() > 0.75 ? "Revision" : "Study", plannedMinutes: planned,
        actualSeconds: early ? Math.round(planned * 60 * (0.3 + rnd() * 0.4)) : planned * 60, status: early ? "ended_early" : "completed",
        focusQuality: Math.min(5, Math.max(1, Math.round(energy + rnd() * 2 - 1))), difficulty: 1 + Math.floor(rnd() * 4),
        durationFeedback: subject === "Economy" ? "too_short" : (["about_right", "about_right", "too_long", "too_short"] as DurationFeedback[])[Math.floor(rnd() * 4)],
        distractions: Math.floor(rnd() * 3), notes: rnd() > 0.75 ? "Finished the chapter. Maps next." : null,
      }));
    }
  }
  [[20, 82], [12, 96], [5, 104]].forEach(([d, score]) =>
    sessions.push(make(now - d * 86_400_000, { energy: 4, subject: "Prelims GS", sessionType: "Mock Test", plannedMinutes: 120, actualSeconds: 7200, focusQuality: 4, difficulty: 4, distractions: 1, mockScore: score, mockMaxScore: 200 })));

  const state: UserState = {
    ...defaultUserState(), selectedExamId: "upsc_cse", advancedMode: true, customSubjects: [], soundEnabled: true, updatedAt: now,
  };
  return { sessions, state };
}
