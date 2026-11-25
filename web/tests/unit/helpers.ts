import { localDateKey } from "@/domain/time";
import type { DurationFeedback, Session, SessionStatus, SessionType } from "@/domain/types";

let counter = 0;
export function uuid(): string {
  counter++;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

export interface Make {
  energy?: number;
  plannedMinutes?: number;
  feedback?: DurationFeedback | null;
  difficulty?: number | null;
  distractions?: number | null;
  focusQuality?: number | null;
  subject?: string;
  status?: SessionStatus;
  notes?: string | null;
  timestamp?: number;
  tz?: string;
  phase?: "focus" | "break";
  sessionType?: SessionType;
  actualSeconds?: number;
  id?: string;
  updatedAt?: number;
}

/** Mirrors createSession() in TempoRecommendationTest.kt. */
export function createSession(m: Make = {}): Session {
  const timestamp = m.timestamp ?? Date.UTC(2026, 8, 15, 6, 0, 0);
  const tz = m.tz ?? "UTC";
  const plannedMinutes = m.plannedMinutes ?? 25;
  return {
    id: m.id ?? uuid(),
    timestamp,
    tz,
    localDate: localDateKey(timestamp, tz),
    phase: m.phase ?? "focus",
    energy: m.energy ?? 3,
    subject: m.subject ?? "Math",
    sessionType: m.sessionType ?? "Study",
    plannedMinutes,
    actualSeconds: m.actualSeconds ?? plannedMinutes * 60,
    status: m.status ?? "completed",
    focusQuality: m.focusQuality ?? null,
    difficulty: m.difficulty ?? null,
    durationFeedback: m.feedback ?? null,
    distractions: m.distractions ?? null,
    notes: m.notes ?? null,
    expectedDifficulty: null,
    topicId: null,
    mockScore: null,
    mockMaxScore: null,
    createdAt: timestamp,
    updatedAt: m.updatedAt ?? timestamp,
    deletedAt: null,
  };
}
